import { eq, and, desc, asc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  reservations, InsertReservation, Reservation,
  tournaments, InsertTournament, Tournament,
  tournamentRegistrations, InsertTournamentRegistration,
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

// ─── STATS ──────────────────────────────────────────────────────

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
