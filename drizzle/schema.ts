import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, date, time, bigint } from "drizzle-orm/mysql-core";

/**
 * Users table — extended with phone, role enum includes unapproved_guest
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "guest", "unapproved_guest"]).default("unapproved_guest").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Reservations table — court bookings with 30-min intervals
 */
export const reservations = mysqlTable("reservations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: date("date").notNull(),
  startTime: varchar("startTime", { length: 5 }).notNull(), // "HH:MM" format
  endTime: varchar("endTime", { length: 5 }).notNull(),     // "HH:MM" format
  duration: int("duration").notNull(), // in minutes: 60 or 120
  price: int("price").notNull(), // in cents: 5000 or 9000
  sessionName: varchar("sessionName", { length: 100 }),
  contactPhone: varchar("contactPhone", { length: 20 }).notNull(),
  contactEmail: varchar("contactEmail", { length: 320 }),
  confirmationCode: varchar("confirmationCode", { length: 10 }).notNull(),
  status: mysqlEnum("status", ["confirmed", "cancelled"]).default("confirmed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Reservation = typeof reservations.$inferSelect;
export type InsertReservation = typeof reservations.$inferInsert;

/**
 * Tournaments table — exclusive events (primarily Sundays)
 */
export const tournaments = mysqlTable("tournaments", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  date: date("date").notNull(),
  startTime: varchar("startTime", { length: 5 }),
  endTime: varchar("endTime", { length: 5 }),
  details: text("details"),
  maxParticipants: int("maxParticipants"),
  winnerId: int("winnerId"),
  status: mysqlEnum("status", ["upcoming", "in_progress", "completed", "cancelled"]).default("upcoming").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Tournament = typeof tournaments.$inferSelect;
export type InsertTournament = typeof tournaments.$inferInsert;

/**
 * Tournament registrations — links users to tournaments
 */
export const tournamentRegistrations = mysqlTable("tournament_registrations", {
  id: int("id").autoincrement().primaryKey(),
  tournamentId: int("tournamentId").notNull(),
  userId: int("userId").notNull(),
  registeredAt: timestamp("registeredAt").defaultNow().notNull(),
});

export type TournamentRegistration = typeof tournamentRegistrations.$inferSelect;
export type InsertTournamentRegistration = typeof tournamentRegistrations.$inferInsert;
