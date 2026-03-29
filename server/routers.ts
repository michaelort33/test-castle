import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { leaderboardRouter } from "./routers/leaderboard";
import {
  getAllUsers, updateUserRole, updateUserPhone,
  createReservation, getReservationsByDate, getReservationsByUser,
  getAllReservations, cancelReservation, adminCancelReservation,
  updateReservationSessionName, getReservationById,
  createAdminSessionBlock,
  createTournament, getAllTournaments, getTournamentById,
  updateTournamentWinner, updateTournamentStatus,
  registerForTournament, getTournamentRegistrations,
  getUserTournamentRegistrations, unregisterFromTournament,
  getAdminStats, getUserById,
} from "./db";
import { notifyOwner } from "./_core/notification";

// ─── Reservation Router ─────────────────────────────────────────

const reservationRouter = router({
  // Get available slots for a date (public — anyone can view)
  getByDate: publicProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ input }) => {
      return getReservationsByDate(input.date);
    }),

  // Get current user's reservations (still requires login)
  mine: protectedProcedure.query(async ({ ctx }) => {
    return getReservationsByUser(ctx.user.id);
  }),

  // Create a new reservation (public — anyone can book with a phone number)
  create: publicProcedure
    .input(z.object({
      date: z.string(),
      startTime: z.string(),
      duration: z.number().refine(d => d >= 30 && d % 30 === 0, "Duration must be a multiple of 30 minutes"),
      contactPhone: z.string().min(1, "Phone number is required"),
      contactEmail: z.string().email().optional().or(z.literal("")),
      guestName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {

      // Calculate end time
      const [hours, mins] = input.startTime.split(":").map(Number);
      const endMinutes = hours * 60 + mins + input.duration;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${String(endHours).padStart(2, "0")}:${String(endMins).padStart(2, "0")}`;

      // Check for conflicts
      const existing = await getReservationsByDate(input.date);
      const startMins = hours * 60 + mins;
      for (const res of existing) {
        const [rsh, rsm] = res.startTime.split(":").map(Number);
        const [reh, rem] = res.endTime.split(":").map(Number);
        const resStart = rsh * 60 + rsm;
        const resEnd = reh * 60 + rem;
        if (startMins < resEnd && endMinutes > resStart) {
          throw new TRPCError({ code: "CONFLICT", message: "This time slot conflicts with an existing reservation." });
        }
      }

      // Price: $25 per 30-min slot, with 2hr ($90) being a discount
      // 30min=$25, 60min=$50, 90min=$75, 120min=$90, 150min=$115, etc.
      const slots = input.duration / 30;
      let price: number;
      if (input.duration <= 120) {
        // Up to 2 hours: $25/slot but 4-slot (2hr) is capped at $90
        price = slots === 4 ? 9000 : slots * 2500;
      } else {
        // Beyond 2 hours: $90 for first 4 slots + $25 per additional slot
        price = 9000 + (slots - 4) * 2500;
      }
      const confirmationCode = nanoid(8).toUpperCase();

      // Use the logged-in user's ID if available, otherwise 0 for anonymous
      const userId = ctx.user?.id ?? 0;

      const id = await createReservation({
        userId,
        date: new Date(input.date + "T00:00:00"),
        startTime: input.startTime,
        endTime,
        duration: input.duration,
        price,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail || null,
        confirmationCode,
        status: "confirmed",
      });

      return { id, confirmationCode, endTime, price };
    }),

  // Cancel a reservation
  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await cancelReservation(input.id, ctx.user.id);
      return { success: true };
    }),
});

// ─── Admin Router ───────────────────────────────────────────────

const adminRouter = router({
  stats: adminProcedure.query(async () => {
    return getAdminStats();
  }),

  // User management
  users: router({
    list: adminProcedure.query(async () => {
      return getAllUsers();
    }),
    approve: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        await updateUserRole(input.userId, "guest");
        return { success: true };
      }),
    reject: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        // Keep as unapproved — admin can see them
        await updateUserRole(input.userId, "unapproved_guest");
        return { success: true };
      }),
    setRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["admin", "guest", "unapproved_guest"]) }))
      .mutation(async ({ input }) => {
        await updateUserRole(input.userId, input.role);
        return { success: true };
      }),
  }),

  // Reservation management
  reservations: router({
    list: adminProcedure.query(async () => {
      return getAllReservations();
    }),
    cancel: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await adminCancelReservation(input.id);
        return { success: true };
      }),
    nameSlot: adminProcedure
      .input(z.object({ id: z.number(), sessionName: z.string() }))
      .mutation(async ({ input }) => {
        await updateReservationSessionName(input.id, input.sessionName);
        return { success: true };
      }),
    createBlock: adminProcedure
      .input(z.object({
        date: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        sessionName: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check for conflicts
        const existing = await getReservationsByDate(input.date);
        const [sh, sm] = input.startTime.split(":").map(Number);
        const [eh, em] = input.endTime.split(":").map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        for (const res of existing) {
          const [rsh, rsm] = res.startTime.split(":").map(Number);
          const [reh, rem] = res.endTime.split(":").map(Number);
          const resStart = rsh * 60 + rsm;
          const resEnd = reh * 60 + rem;
          if (startMins < resEnd && endMins > resStart) {
            throw new TRPCError({ code: "CONFLICT", message: "This time slot conflicts with an existing reservation." });
          }
        }
        const id = await createAdminSessionBlock({
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          sessionName: input.sessionName,
          adminUserId: ctx.user.id,
        });
        return { id };
      }),
  }),
});

// ─── Tournament Router ──────────────────────────────────────────

const tournamentRouter = router({
  list: publicProcedure.query(async () => {
    const allTournaments = await getAllTournaments();
    return allTournaments;
  }),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const tournament = await getTournamentById(input.id);
      if (!tournament) throw new TRPCError({ code: "NOT_FOUND", message: "Tournament not found" });
      const registrations = await getTournamentRegistrations(input.id);
      let winnerName: string | null = null;
      if (tournament.winnerId) {
        const winner = await getUserById(tournament.winnerId);
        winnerName = winner?.name ?? null;
      }
      return { ...tournament, registrations, winnerName };
    }),

  register: protectedProcedure
    .input(z.object({ tournamentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "unapproved_guest") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your account is pending approval." });
      }
      await registerForTournament(input.tournamentId, ctx.user.id);
      return { success: true };
    }),

  unregister: protectedProcedure
    .input(z.object({ tournamentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await unregisterFromTournament(input.tournamentId, ctx.user.id);
      return { success: true };
    }),

  myRegistrations: protectedProcedure.query(async ({ ctx }) => {
    return getUserTournamentRegistrations(ctx.user.id);
  }),

  // Admin-only
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      date: z.string(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      details: z.string().optional(),
      maxParticipants: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await createTournament({
        name: input.name,
        date: new Date(input.date + "T00:00:00"),
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        details: input.details ?? null,
        maxParticipants: input.maxParticipants ?? null,
        status: "upcoming",
      });
      return { id };
    }),

  setWinner: adminProcedure
    .input(z.object({ tournamentId: z.number(), winnerId: z.number() }))
    .mutation(async ({ input }) => {
      await updateTournamentWinner(input.tournamentId, input.winnerId);
      return { success: true };
    }),

  updateStatus: adminProcedure
    .input(z.object({ tournamentId: z.number(), status: z.enum(["upcoming", "in_progress", "completed", "cancelled"]) }))
    .mutation(async ({ input }) => {
      await updateTournamentStatus(input.tournamentId, input.status);
      return { success: true };
    }),

  registrations: adminProcedure
    .input(z.object({ tournamentId: z.number() }))
    .query(async ({ input }) => {
      return getTournamentRegistrations(input.tournamentId);
    }),
});

// ─── User Profile Router ────────────────────────────────────────

const profileRouter = router({
  updatePhone: protectedProcedure
    .input(z.object({ phone: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await updateUserPhone(ctx.user.id, input.phone);
      return { success: true };
    }),
});

// ─── Main App Router ────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  reservation: reservationRouter,
  admin: adminRouter,
  tournament: tournamentRouter,
  profile: profileRouter,
  leaderboard: leaderboardRouter,
});

export type AppRouter = typeof appRouter;
