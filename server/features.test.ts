import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Test Helpers ────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Generate unique dates per test run using timestamp seed to avoid DB collisions
const runSeed = Math.floor(Date.now() / 1000) % 100000;
let dateCounter = 500; // Offset from audit-fixes.test.ts
function uniqueDate(): string {
  dateCounter++;
  const combined = runSeed * 100 + dateCounter;
  // Spread across years 2100-2149 to avoid collisions with audit-fixes.test.ts
  const year = 2100 + (combined % 50);
  const month = (Math.floor(combined / 50) % 12) + 1;
  const day = (Math.floor(combined / 600) % 28) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

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
  it("allows unapproved_guest to create reservation (no login wall)", async () => {
    const user = makeUser({ role: "unapproved_guest" });
    const caller = appRouter.createCaller(makeCtx(user));
    const date = uniqueDate();
    const result = await caller.reservation.create({
      date,
      startTime: "06:00",
      duration: 60,
      contactPhone: "5551234567",
    });
    expect(result.confirmationCode).toBeTruthy();
  });

  it("allows anonymous (unauthenticated) users to book", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();
    const result = await caller.reservation.create({
      date,
      startTime: "14:00",
      duration: 60,
      contactPhone: "5559876543",
    });
    expect(result.confirmationCode).toBeTruthy();
    expect(result.endTime).toBe("15:00");
  });

  it("rejects duration that is not a multiple of 30", async () => {
    const user = makeUser();
    const caller = appRouter.createCaller(makeCtx(user));
    const date = uniqueDate();

    await expect(
      caller.reservation.create({
        date,
        startTime: "10:00",
        duration: 45 as any,
        contactPhone: "5551234567",
      })
    ).rejects.toThrow();
  });

  it("accepts 30-minute single slot booking", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();
    const result = await caller.reservation.create({
      date,
      startTime: "08:00",
      duration: 30,
      contactPhone: "5551111111",
    });
    expect(result.confirmationCode).toBeTruthy();
    expect(result.endTime).toBe("08:30");
    expect(result.price).toBe(2500); // $25
  });

  it("accepts 90-minute multi-slot booking with correct price", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();
    const result = await caller.reservation.create({
      date,
      startTime: "09:00",
      duration: 90,
      contactPhone: "5552222222",
    });
    expect(result.confirmationCode).toBeTruthy();
    expect(result.endTime).toBe("10:30");
    expect(result.price).toBe(7500); // $75 = 3 slots x $25
  });

  it("applies 2-hour discount ($90 instead of $100)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();
    const result = await caller.reservation.create({
      date,
      startTime: "12:00",
      duration: 120,
      contactPhone: "5553333333",
    });
    expect(result.price).toBe(9000); // $90 discount
  });

  it("requires contactPhone", async () => {
    const user = makeUser();
    const caller = appRouter.createCaller(makeCtx(user));
    const date = uniqueDate();

    await expect(
      caller.reservation.create({
        date,
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
    const date = uniqueDate();

    await expect(
      caller.admin.reservations.createBlock({
        date,
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
    const date = uniqueDate();

    await expect(
      caller.tournament.create({
        name: "Sunday Showdown",
        date,
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

// ─── Open Play Tests ────────────────────────────────────────────

describe("openPlay procedures", () => {
  it("allows public access to get open play sessions by date", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();
    const result = await caller.openPlay.getByDate({ date });
    expect(Array.isArray(result)).toBe(true);
  });

  it("allows anonymous user to join an open play session", async () => {
    const admin = makeUser({ role: "admin" });
    const adminCaller = appRouter.createCaller(makeCtx(admin));
    const date = uniqueDate();
    const session = await adminCaller.openPlay.create({
      date,
      startTime: "09:00",
      endTime: "11:00",
      title: "Test Open Play",
      maxPlayers: 2,
    });
    expect(session.id).toBeTruthy();

    // Join as anonymous
    const publicCaller = appRouter.createCaller(makeCtx());
    const join1 = await publicCaller.openPlay.join({
      sessionId: session.id,
      playerName: "Player One",
      phone: "5551111111",
    });
    expect(join1.status).toBe("confirmed");

    // Join second player
    const join2 = await publicCaller.openPlay.join({
      sessionId: session.id,
      playerName: "Player Two",
      phone: "5552222222",
    });
    expect(join2.status).toBe("confirmed");

    // Third player should be waitlisted (maxPlayers = 2)
    const join3 = await publicCaller.openPlay.join({
      sessionId: session.id,
      playerName: "Player Three",
      phone: "5553333333",
    });
    expect(join3.status).toBe("waitlisted");
  });

  it("rejects non-admin from creating open play sessions", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));
    const date = uniqueDate();

    await expect(
      caller.openPlay.create({
        date,
        startTime: "09:00",
        endTime: "11:00",
        title: "Test",
        maxPlayers: 10,
      })
    ).rejects.toThrow();
  });

  it("rejects non-admin from cancelling open play sessions", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.openPlay.cancel({ id: 1 })
    ).rejects.toThrow();
  });

  it("rejects non-admin from removing players", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.openPlay.removePlayer({ signupId: 1 })
    ).rejects.toThrow();
  });

  it("rejects non-admin from updating open play sessions", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.openPlay.update({ id: 1, title: "Updated" })
    ).rejects.toThrow();
  });

  it("allows anonymous user to leave an open play session", async () => {
    const admin = makeUser({ role: "admin" });
    const adminCaller = appRouter.createCaller(makeCtx(admin));
    const date = uniqueDate();
    const session = await adminCaller.openPlay.create({
      date,
      startTime: "10:00",
      endTime: "12:00",
      title: "Leave Test",
      maxPlayers: 10,
    });

    // Join
    const publicCaller = appRouter.createCaller(makeCtx());
    const join = await publicCaller.openPlay.join({
      sessionId: session.id,
      playerName: "Leaver",
      phone: "5554444444",
    });
    expect(join.status).toBe("confirmed");

    // Leave
    const result = await publicCaller.openPlay.leave({
      signupId: join.id,
      phone: "5554444444",
    });
    expect(result.success).toBe(true);
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
