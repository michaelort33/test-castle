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
  cancelReservationByCode,
  createAdminSessionBlock,
  createTournament, getAllTournaments, getTournamentById,
  updateTournamentWinner, updateTournamentStatus,
  registerForTournament, getTournamentRegistrations,
  getUserTournamentRegistrations, unregisterFromTournament,
  getTournamentRegistrationCount,
  getAdminStats, getUserById,
  createOpenPlaySession, getOpenPlaySessionsByDate, getAllOpenPlaySessions,
  getOpenPlaySessionById, cancelOpenPlaySession, updateOpenPlaySession,
  getOpenPlaySignups, getOpenPlaySignupCount,
  joinOpenPlaySession, leaveOpenPlaySession, adminCancelOpenPlaySignup,
} from "./db";
import { notifyOwner } from "./_core/notification";

// ─── Shared conflict check helper ──────────────────────────────
// Checks both reservations AND open play sessions for time conflicts on a given date
async function checkTimeConflicts(date: string, startMins: number, endMins: number, excludeReservationId?: number) {
  // Check reservation conflicts
  const existingReservations = await getReservationsByDate(date);
  for (const res of existingReservations) {
    if (excludeReservationId && res.id === excludeReservationId) continue;
    const [rsh, rsm] = res.startTime.split(":").map(Number);
    const [reh, rem] = res.endTime.split(":").map(Number);
    const resStart = rsh * 60 + rsm;
    const resEnd = reh * 60 + rem;
    if (startMins < resEnd && endMins > resStart) {
      throw new TRPCError({ code: "CONFLICT", message: "This time slot conflicts with an existing reservation." });
    }
  }

  // Check open play session conflicts
  const existingSessions = await getOpenPlaySessionsByDate(date);
  for (const session of existingSessions) {
    const [ssh, ssm] = session.startTime.split(":").map(Number);
    const [seh, sem] = session.endTime.split(":").map(Number);
    const sessionStart = ssh * 60 + ssm;
    const sessionEnd = seh * 60 + sem;
    if (startMins < sessionEnd && endMins > sessionStart) {
      throw new TRPCError({ code: "CONFLICT", message: "This time slot conflicts with an Open Play session." });
    }
  }
}

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
      fullName: z.string().optional(),
      notifyBeforeReservation: z.boolean().optional().default(true),
    }))
    .mutation(async ({ ctx, input }) => {

      // Calculate end time
      const [hours, mins] = input.startTime.split(":").map(Number);
      const endMinutes = hours * 60 + mins + input.duration;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${String(endHours).padStart(2, "0")}:${String(endMins).padStart(2, "0")}`;

      // Check for conflicts against both reservations and open play sessions
      const startMins = hours * 60 + mins;
      await checkTimeConflicts(input.date, startMins, endMinutes);

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

      // Use the logged-in user's ID if available, otherwise NULL for anonymous
      const userId = ctx.user?.id ?? null;

      const id = await createReservation({
        userId,
        date: new Date(input.date + "T00:00:00"),
        startTime: input.startTime,
        endTime,
        duration: input.duration,
        price,
        fullName: input.fullName || input.guestName || null,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail || null,
        notifyBeforeReservation: input.notifyBeforeReservation ?? true,
        confirmationCode,
        status: "confirmed",
      });

      return { id, confirmationCode, endTime, price };
    }),

  // Cancel a reservation (authenticated user)
  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await cancelReservation(input.id, ctx.user.id);
      return { success: true };
    }),

  // Cancel a reservation by confirmation code + phone (for anonymous users)
  cancelByCode: publicProcedure
    .input(z.object({
      confirmationCode: z.string().min(1, "Confirmation code is required"),
      contactPhone: z.string().min(1, "Phone number is required"),
    }))
    .mutation(async ({ input }) => {
      const result = await cancelReservationByCode(input.confirmationCode, input.contactPhone);
      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No matching reservation found. Please check your confirmation code and phone number.",
        });
      }
      return { success: true, reservationId: result.id };
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
        // Check for conflicts against both reservations and open play sessions
        const [sh, sm] = input.startTime.split(":").map(Number);
        const [eh, em] = input.endTime.split(":").map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        await checkTimeConflicts(input.date, startMins, endMins);

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
    // Enrich with registration counts for capacity display
    const enriched = await Promise.all(allTournaments.map(async (t) => {
      const count = await getTournamentRegistrationCount(t.id);
      return { ...t, registrationCount: count };
    }));
    return enriched;
  }),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const tournament = await getTournamentById(input.id);
      if (!tournament) throw new TRPCError({ code: "NOT_FOUND", message: "Tournament not found" });
      const registrations = await getTournamentRegistrations(input.id);
      const registrationCount = registrations.length;
      let winnerName: string | null = null;
      if (tournament.winnerId) {
        const winner = await getUserById(tournament.winnerId);
        winnerName = winner?.name ?? null;
      }
      return { ...tournament, registrations, registrationCount, winnerName };
    }),

  register: protectedProcedure
    .input(z.object({ tournamentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "unapproved_guest") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your account is pending approval." });
      }
      // Enforce maxParticipants
      const tournament = await getTournamentById(input.tournamentId);
      if (!tournament) throw new TRPCError({ code: "NOT_FOUND", message: "Tournament not found" });
      if (tournament.status !== "upcoming") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Registration is only open for upcoming tournaments." });
      }
      if (tournament.maxParticipants) {
        const currentCount = await getTournamentRegistrationCount(input.tournamentId);
        if (currentCount >= tournament.maxParticipants) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This tournament is full." });
        }
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

// ─── Open Play Router ──────────────────────────────────────

const openPlayRouter = router({
  // Public: get open play sessions for a date
  getByDate: publicProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ input }) => {
      const sessions = await getOpenPlaySessionsByDate(input.date);
      // Enrich with signup counts
      const enriched = await Promise.all(sessions.map(async (s) => {
        const counts = await getOpenPlaySignupCount(s.id);
        const signups = await getOpenPlaySignups(s.id);
        return { ...s, confirmedCount: counts.confirmed, waitlistedCount: counts.waitlisted, signups };
      }));
      return enriched;
    }),

  // Public: get a single session with full details
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const session = await getOpenPlaySessionById(input.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const counts = await getOpenPlaySignupCount(session.id);
      const signups = await getOpenPlaySignups(session.id);
      return { ...session, confirmedCount: counts.confirmed, waitlistedCount: counts.waitlisted, signups };
    }),

  // Public: join an open play session
  join: publicProcedure
    .input(z.object({
      sessionId: z.number(),
      playerName: z.string().min(1, "Name is required"),
      phone: z.string().min(1, "Phone number is required"),
      email: z.string().email().optional().or(z.literal("")),
    }))
    .mutation(async ({ input }) => {
      const result = await joinOpenPlaySession(
        input.sessionId,
        input.playerName,
        input.phone,
        input.email || undefined,
      );
      return result;
    }),

  // Public: leave an open play session
  leave: publicProcedure
    .input(z.object({
      signupId: z.number(),
      phone: z.string().min(1, "Phone required to verify identity"),
    }))
    .mutation(async ({ input }) => {
      await leaveOpenPlaySession(input.signupId, input.phone);
      return { success: true };
    }),

  // Admin: create open play session
  create: adminProcedure
    .input(z.object({
      date: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      title: z.string().min(1),
      description: z.string().optional(),
      maxPlayers: z.number().min(1),
    }))
    .mutation(async ({ input }) => {
      // Check for conflicts against both reservations and open play sessions
      const [sh, sm] = input.startTime.split(":").map(Number);
      const [eh, em] = input.endTime.split(":").map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;

      // Check reservation conflicts
      const existingReservations = await getReservationsByDate(input.date);
      for (const res of existingReservations) {
        const [rsh, rsm] = res.startTime.split(":").map(Number);
        const [reh, rem] = res.endTime.split(":").map(Number);
        const resStart = rsh * 60 + rsm;
        const resEnd = reh * 60 + rem;
        if (startMins < resEnd && endMins > resStart) {
          throw new TRPCError({ code: "CONFLICT", message: "This time conflicts with an existing reservation." });
        }
      }

      // Check open play session conflicts
      const existingSessions = await getOpenPlaySessionsByDate(input.date);
      for (const session of existingSessions) {
        const [ssh, ssm] = session.startTime.split(":").map(Number);
        const [seh, sem] = session.endTime.split(":").map(Number);
        const sessionStart = ssh * 60 + ssm;
        const sessionEnd = seh * 60 + sem;
        if (startMins < sessionEnd && endMins > sessionStart) {
          throw new TRPCError({ code: "CONFLICT", message: "This time conflicts with an existing Open Play session." });
        }
      }

      const id = await createOpenPlaySession({
        date: new Date(input.date + "T00:00:00"),
        startTime: input.startTime,
        endTime: input.endTime,
        title: input.title,
        description: input.description ?? null,
        maxPlayers: input.maxPlayers,
        status: "active",
      });
      return { id };
    }),

  // Admin: list all open play sessions with signups
  listAll: adminProcedure.query(async () => {
    const sessions = await getAllOpenPlaySessions();
    const enriched = await Promise.all(sessions.map(async (s) => {
      const counts = await getOpenPlaySignupCount(s.id);
      const signups = await getOpenPlaySignups(s.id);
      return { ...s, confirmedCount: counts.confirmed, waitlistedCount: counts.waitlisted, signups };
    }));
    return enriched;
  }),

  // Admin: cancel session
  cancel: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await cancelOpenPlaySession(input.id);
      return { success: true };
    }),

  // Admin: update session details
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      maxPlayers: z.number().min(1).optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateOpenPlaySession(id, data);
      return { success: true };
    }),

  // Admin: remove a player from a session
  removePlayer: adminProcedure
    .input(z.object({ signupId: z.number() }))
    .mutation(async ({ input }) => {
      await adminCancelOpenPlaySignup(input.signupId);
      return { success: true };
    }),

  // Admin: get signups for a session
  signups: adminProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      return getOpenPlaySignups(input.sessionId);
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
  openPlay: openPlayRouter,
  profile: profileRouter,
  leaderboard: leaderboardRouter,
});

export type AppRouter = typeof appRouter;
