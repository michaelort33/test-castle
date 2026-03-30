import { eq, and, desc, asc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  reservations, InsertReservation, Reservation,
  tournaments, InsertTournament, Tournament,
  tournamentRegistrations, InsertTournamentRegistration,
  openPlaySessions, InsertOpenPlaySession, OpenPlaySession,
  openPlaySignups, InsertOpenPlaySignup, OpenPlaySignup,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── USER HELPERS ───────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "phone"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: "admin" | "guest" | "unapproved_guest") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function updateUserPhone(userId: number, phone: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ phone }).where(eq(users.id, userId));
}

// ─── RESERVATION HELPERS ────────────────────────────────────────

export async function createReservation(data: InsertReservation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reservations).values(data);
  return result[0].insertId;
}

export async function getReservationsByDate(date: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reservations)
    .where(and(sql`${reservations.date} = ${date}`, eq(reservations.status, "confirmed")))
    .orderBy(asc(reservations.startTime));
}

export async function getReservationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reservations)
    .where(eq(reservations.userId, userId))
    .orderBy(desc(reservations.date), desc(reservations.startTime));
}

export async function getAllReservations(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    reservation: reservations,
    userName: users.name,
  }).from(reservations)
    .leftJoin(users, eq(reservations.userId, users.id))
    .orderBy(desc(reservations.date), desc(reservations.startTime))
    .limit(limit);
}

export async function cancelReservation(reservationId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(reservations)
    .set({ status: "cancelled" })
    .where(and(eq(reservations.id, reservationId), eq(reservations.userId, userId)));
}

export async function cancelReservationByCode(confirmationCode: string, contactPhone: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Find the reservation by confirmation code and phone
  const result = await db.select().from(reservations)
    .where(and(
      eq(reservations.confirmationCode, confirmationCode),
      eq(reservations.contactPhone, contactPhone),
      eq(reservations.status, "confirmed")
    )).limit(1);
  if (result.length === 0) return null;
  await db.update(reservations)
    .set({ status: "cancelled" })
    .where(eq(reservations.id, result[0].id));
  return result[0];
}

export async function getReservationByCode(confirmationCode: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reservations)
    .where(eq(reservations.confirmationCode, confirmationCode)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function adminCancelReservation(reservationId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(reservations)
    .set({ status: "cancelled" })
    .where(eq(reservations.id, reservationId));
}

export async function updateReservationSessionName(reservationId: number, sessionName: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(reservations)
    .set({ sessionName })
    .where(eq(reservations.id, reservationId));
}

export async function getReservationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── ADMIN SESSION BLOCKS ───────────────────────────────────────

export async function createAdminSessionBlock(data: {
  date: string;
  startTime: string;
  endTime: string;
  sessionName: string;
  adminUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Admin blocks are stored as reservations with a special session name
  const confirmationCode = "ADMIN";
  const duration = calculateDuration(data.startTime, data.endTime);
  const result = await db.insert(reservations).values({
    userId: data.adminUserId,
    date: new Date(data.date + "T00:00:00"),
    startTime: data.startTime,
    endTime: data.endTime,
    duration,
    price: 0,
    sessionName: data.sessionName,
    contactPhone: "admin",
    confirmationCode,
    status: "confirmed",
  });
  return result[0].insertId;
}

function calculateDuration(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

// ─── TOURNAMENT HELPERS ─────────────────────────────────────────

export async function createTournament(data: InsertTournament) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tournaments).values(data);
  return result[0].insertId;
}

export async function getAllTournaments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tournaments).orderBy(desc(tournaments.date));
}

export async function getTournamentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tournaments).where(eq(tournaments.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateTournamentWinner(tournamentId: number, winnerId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(tournaments)
    .set({ winnerId, status: "completed" })
    .where(eq(tournaments.id, tournamentId));
}

export async function updateTournamentStatus(tournamentId: number, status: "upcoming" | "in_progress" | "completed" | "cancelled") {
  const db = await getDb();
  if (!db) return;
  await db.update(tournaments)
    .set({ status })
    .where(eq(tournaments.id, tournamentId));
}

export async function registerForTournament(tournamentId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if already registered
  const existing = await db.select().from(tournamentRegistrations)
    .where(and(
      eq(tournamentRegistrations.tournamentId, tournamentId),
      eq(tournamentRegistrations.userId, userId)
    )).limit(1);
  if (existing.length > 0) throw new Error("Already registered for this tournament");
  await db.insert(tournamentRegistrations).values({ tournamentId, userId });
}

export async function getTournamentRegistrations(tournamentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    registration: tournamentRegistrations,
    userName: users.name,
    userEmail: users.email,
    userPhone: users.phone,
  }).from(tournamentRegistrations)
    .leftJoin(users, eq(tournamentRegistrations.userId, users.id))
    .where(eq(tournamentRegistrations.tournamentId, tournamentId))
    .orderBy(asc(tournamentRegistrations.registeredAt));
}

export async function getUserTournamentRegistrations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    registration: tournamentRegistrations,
    tournament: tournaments,
  }).from(tournamentRegistrations)
    .leftJoin(tournaments, eq(tournamentRegistrations.tournamentId, tournaments.id))
    .where(eq(tournamentRegistrations.userId, userId))
    .orderBy(desc(tournaments.date));
}

export async function unregisterFromTournament(tournamentId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(tournamentRegistrations)
    .where(and(
      eq(tournamentRegistrations.tournamentId, tournamentId),
      eq(tournamentRegistrations.userId, userId)
    ));
}

// ─── OPEN PLAY HELPERS ─────────────────────────────────────────

export async function createOpenPlaySession(data: InsertOpenPlaySession) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(openPlaySessions).values(data);
  return result[0].insertId;
}

export async function getOpenPlaySessionsByDate(date: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(openPlaySessions)
    .where(and(sql`${openPlaySessions.date} = ${date}`, eq(openPlaySessions.status, "active")))
    .orderBy(asc(openPlaySessions.startTime));
}

export async function getAllOpenPlaySessions(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(openPlaySessions)
    .orderBy(desc(openPlaySessions.date), desc(openPlaySessions.startTime))
    .limit(limit);
}

export async function getOpenPlaySessionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(openPlaySessions).where(eq(openPlaySessions.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function cancelOpenPlaySession(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(openPlaySessions).set({ status: "cancelled" }).where(eq(openPlaySessions.id, id));
}

export async function updateOpenPlaySession(id: number, data: Partial<Pick<InsertOpenPlaySession, "title" | "description" | "maxPlayers" | "startTime" | "endTime" | "date">>) {
  const db = await getDb();
  if (!db) return;
  const updateSet: Record<string, unknown> = {};
  if (data.title !== undefined) updateSet.title = data.title;
  if (data.description !== undefined) updateSet.description = data.description;
  if (data.maxPlayers !== undefined) updateSet.maxPlayers = data.maxPlayers;
  if (data.startTime !== undefined) updateSet.startTime = data.startTime;
  if (data.endTime !== undefined) updateSet.endTime = data.endTime;
  if (data.date !== undefined) updateSet.date = data.date;
  if (Object.keys(updateSet).length === 0) return;
  await db.update(openPlaySessions).set(updateSet).where(eq(openPlaySessions.id, id));
}

export async function getOpenPlaySignups(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(openPlaySignups)
    .where(and(eq(openPlaySignups.sessionId, sessionId), sql`${openPlaySignups.status} != 'cancelled'`))
    .orderBy(asc(openPlaySignups.position));
}

export async function getOpenPlaySignupCount(sessionId: number) {
  const db = await getDb();
  if (!db) return { confirmed: 0, waitlisted: 0 };
  const [confirmed] = await db.select({ count: sql<number>`count(*)` }).from(openPlaySignups)
    .where(and(eq(openPlaySignups.sessionId, sessionId), eq(openPlaySignups.status, "confirmed")));
  const [waitlisted] = await db.select({ count: sql<number>`count(*)` }).from(openPlaySignups)
    .where(and(eq(openPlaySignups.sessionId, sessionId), eq(openPlaySignups.status, "waitlisted")));
  return { confirmed: Number(confirmed.count), waitlisted: Number(waitlisted.count) };
}

export async function joinOpenPlaySession(sessionId: number, playerName: string, phone: string, email?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if already signed up with same phone
  const existing = await db.select().from(openPlaySignups)
    .where(and(
      eq(openPlaySignups.sessionId, sessionId),
      eq(openPlaySignups.phone, phone),
      sql`${openPlaySignups.status} != 'cancelled'`
    )).limit(1);
  if (existing.length > 0) throw new Error("Already signed up for this session");

  // Get session to check max players
  const session = await getOpenPlaySessionById(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status === "cancelled") throw new Error("Session is cancelled");

  const counts = await getOpenPlaySignupCount(sessionId);
  
  // Get next position
  const [maxPos] = await db.select({ maxPosition: sql<number>`COALESCE(MAX(position), 0)` })
    .from(openPlaySignups)
    .where(and(eq(openPlaySignups.sessionId, sessionId), sql`${openPlaySignups.status} != 'cancelled'`));
  const nextPosition = Number(maxPos.maxPosition) + 1;

  const status = counts.confirmed < session.maxPlayers ? "confirmed" : "waitlisted";

  const result = await db.insert(openPlaySignups).values({
    sessionId,
    playerName,
    phone,
    email: email || null,
    status,
    position: nextPosition,
  });

  return { id: result[0].insertId, status, position: nextPosition, waitlistPosition: status === "waitlisted" ? nextPosition - session.maxPlayers : null };
}

export async function leaveOpenPlaySession(signupId: number, phone: string) {
  const db = await getDb();
  if (!db) return;

  // Get the signup to find session and check ownership
  const [signup] = await db.select().from(openPlaySignups).where(eq(openPlaySignups.id, signupId)).limit(1);
  if (!signup || signup.phone !== phone) throw new Error("Signup not found or unauthorized");
  if (signup.status === "cancelled") return;

  const wasConfirmed = signup.status === "confirmed";
  await db.update(openPlaySignups).set({ status: "cancelled" }).where(eq(openPlaySignups.id, signupId));

  // If the person who left was confirmed, promote the first waitlisted person
  if (wasConfirmed) {
    const waitlisted = await db.select().from(openPlaySignups)
      .where(and(
        eq(openPlaySignups.sessionId, signup.sessionId),
        eq(openPlaySignups.status, "waitlisted")
      ))
      .orderBy(asc(openPlaySignups.position))
      .limit(1);
    if (waitlisted.length > 0) {
      await db.update(openPlaySignups)
        .set({ status: "confirmed" })
        .where(eq(openPlaySignups.id, waitlisted[0].id));
    }
  }
}

export async function adminCancelOpenPlaySignup(signupId: number) {
  const db = await getDb();
  if (!db) return;

  const [signup] = await db.select().from(openPlaySignups).where(eq(openPlaySignups.id, signupId)).limit(1);
  if (!signup || signup.status === "cancelled") return;

  const wasConfirmed = signup.status === "confirmed";
  await db.update(openPlaySignups).set({ status: "cancelled" }).where(eq(openPlaySignups.id, signupId));

  if (wasConfirmed) {
    const waitlisted = await db.select().from(openPlaySignups)
      .where(and(
        eq(openPlaySignups.sessionId, signup.sessionId),
        eq(openPlaySignups.status, "waitlisted")
      ))
      .orderBy(asc(openPlaySignups.position))
      .limit(1);
    if (waitlisted.length > 0) {
      await db.update(openPlaySignups)
        .set({ status: "confirmed" })
        .where(eq(openPlaySignups.id, waitlisted[0].id));
    }
  }
}

// ─── STATS ──────────────────────────────────────────────────────

export async function getTournamentRegistrationCount(tournamentId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(tournamentRegistrations)
    .where(eq(tournamentRegistrations.tournamentId, tournamentId));
  return Number(result.count);
}

export async function getAdminStats() {
  const db = await getDb();
  if (!db) return { totalUsers: 0, pendingUsers: 0, totalReservations: 0, upcomingTournaments: 0 };

  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [pendingCount] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "unapproved_guest"));
  const [resCount] = await db.select({ count: sql<number>`count(*)` }).from(reservations).where(eq(reservations.status, "confirmed"));
  const [tourneyCount] = await db.select({ count: sql<number>`count(*)` }).from(tournaments).where(eq(tournaments.status, "upcoming"));

  return {
    totalUsers: Number(userCount.count),
    pendingUsers: Number(pendingCount.count),
    totalReservations: Number(resCount.count),
    upcomingTournaments: Number(tourneyCount.count),
  };
}
