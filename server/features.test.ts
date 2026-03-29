import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Test Helpers ────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-1",
    email: "test@example.com",
    name: "Test User",
    phone: "5551234567",
    loginMethod: "manus",
    role: "guest",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function makeCtx(user: AuthenticatedUser | null = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ─── Auth Tests ──────────────────────────────────────────────────

describe("auth.me", () => {
  it("returns null when not authenticated", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user when authenticated", async () => {
    const user = makeUser();
    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.openId).toBe("test-user-1");
    expect(result?.role).toBe("guest");
  });
});

// ─── Reservation Router Tests ────────────────────────────────────

describe("reservation.create", () => {
  it("rejects unapproved_guest from creating reservation", async () => {
    const user = makeUser({ role: "unapproved_guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.reservation.create({
        date: "2026-04-15",
        startTime: "10:00",
        duration: 60,
        contactPhone: "5551234567",
      })
    ).rejects.toThrow("pending approval");
  });

  it("rejects unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());

    await expect(
      caller.reservation.create({
        date: "2026-04-15",
        startTime: "10:00",
        duration: 60,
        contactPhone: "5551234567",
      })
    ).rejects.toThrow();
  });

  it("validates duration must be 60 or 120", async () => {
    const user = makeUser();
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.reservation.create({
        date: "2026-04-15",
        startTime: "10:00",
        duration: 90 as 60, // force wrong value
        contactPhone: "5551234567",
      })
    ).rejects.toThrow();
  });

  it("requires contactPhone", async () => {
    const user = makeUser();
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.reservation.create({
        date: "2026-04-15",
        startTime: "10:00",
        duration: 60,
        contactPhone: "",
      })
    ).rejects.toThrow();
  });
});

// ─── Admin Router Tests ──────────────────────────────────────────

describe("admin procedures", () => {
  it("rejects non-admin from accessing admin.stats", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(caller.admin.stats()).rejects.toThrow();
  });

  it("rejects unauthenticated from accessing admin.stats", async () => {
    const caller = appRouter.createCaller(makeCtx());

    await expect(caller.admin.stats()).rejects.toThrow();
  });

  it("rejects non-admin from listing users", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(caller.admin.users.list()).rejects.toThrow();
  });

  it("rejects non-admin from approving users", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(caller.admin.users.approve({ userId: 2 })).rejects.toThrow();
  });

  it("rejects non-admin from cancelling reservations", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(caller.admin.reservations.cancel({ id: 1 })).rejects.toThrow();
  });

  it("rejects non-admin from creating session blocks", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.admin.reservations.createBlock({
        date: "2026-04-15",
        startTime: "09:00",
        endTime: "11:00",
        sessionName: "Open Play",
      })
    ).rejects.toThrow();
  });
});

// ─── Tournament Router Tests ─────────────────────────────────────

describe("tournament procedures", () => {
  it("allows public access to tournament list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // Should not throw — public procedure
    const result = await caller.tournament.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects unapproved_guest from registering for tournament", async () => {
    const user = makeUser({ role: "unapproved_guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.tournament.register({ tournamentId: 1 })
    ).rejects.toThrow("pending approval");
  });

  it("rejects unauthenticated from registering for tournament", async () => {
    const caller = appRouter.createCaller(makeCtx());

    await expect(
      caller.tournament.register({ tournamentId: 1 })
    ).rejects.toThrow();
  });

  it("rejects non-admin from creating tournament", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.tournament.create({
        name: "Sunday Showdown",
        date: "2026-04-20",
      })
    ).rejects.toThrow();
  });

  it("rejects non-admin from setting winner", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.tournament.setWinner({ tournamentId: 1, winnerId: 2 })
    ).rejects.toThrow();
  });

  it("rejects non-admin from updating tournament status", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.tournament.updateStatus({ tournamentId: 1, status: "completed" })
    ).rejects.toThrow();
  });
});

// ─── Leaderboard Tests ───────────────────────────────────────────

describe("leaderboard", () => {
  it("allows public access to leaderboard", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.leaderboard.get();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Profile Tests ───────────────────────────────────────────────

describe("profile", () => {
  it("rejects unauthenticated from updating phone", async () => {
    const caller = appRouter.createCaller(makeCtx());

    await expect(
      caller.profile.updatePhone({ phone: "5559876543" })
    ).rejects.toThrow();
  });

  it("validates phone is not empty", async () => {
    const user = makeUser();
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.profile.updatePhone({ phone: "" })
    ).rejects.toThrow();
  });
});
