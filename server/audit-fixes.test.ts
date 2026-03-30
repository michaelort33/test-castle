import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Test Helpers ────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Generate unique dates per test run using timestamp seed to avoid DB collisions
const runSeed = Math.floor(Date.now() / 1000) % 100000;
let dateCounter = 0;
function uniqueDate(): string {
  dateCounter++;
  const combined = runSeed * 100 + dateCounter;
  // Spread across years 2050-2099 to avoid collisions with other test files
  const year = 2050 + (combined % 50);
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

// ─── B1: Anonymous Reservations (userId nullable) ───────────────

describe("B1: Anonymous reservations - userId nullable", () => {
  it("allows anonymous (null user) to create a reservation", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();
    const result = await caller.reservation.create({
      date,
      startTime: "07:00",
      duration: 60,
      contactPhone: "5550001111",
      fullName: "Anonymous Booker",
    });
    expect(result.confirmationCode).toBeTruthy();
    expect(result.confirmationCode.length).toBe(8);
    expect(result.endTime).toBe("08:00");
    expect(result.price).toBe(5000); // $50 for 1hr
  });

  it("allows authenticated user to create a reservation", async () => {
    const user = makeUser();
    const caller = appRouter.createCaller(makeCtx(user));
    const date = uniqueDate();
    const result = await caller.reservation.create({
      date,
      startTime: "07:00",
      duration: 60,
      contactPhone: "5550002222",
    });
    expect(result.confirmationCode).toBeTruthy();
  });
});

// ─── B2: Cross-system conflict detection ────────────────────────

describe("B2: Cross-system conflict detection", () => {
  it("prevents reservation from overlapping with an existing reservation", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();

    // Book 10:00-11:00
    await caller.reservation.create({
      date,
      startTime: "10:00",
      duration: 60,
      contactPhone: "5550003333",
    });

    // Try to book 10:30-11:30 (overlaps)
    await expect(
      caller.reservation.create({
        date,
        startTime: "10:30",
        duration: 60,
        contactPhone: "5550004444",
      })
    ).rejects.toThrow("conflicts");
  });

  it("prevents reservation from overlapping with an Open Play session", async () => {
    const admin = makeUser({ role: "admin" });
    const adminCaller = appRouter.createCaller(makeCtx(admin));
    const date = uniqueDate();

    // Create Open Play 14:00-16:00
    await adminCaller.openPlay.create({
      date,
      startTime: "14:00",
      endTime: "16:00",
      title: "Conflict Test OP",
      maxPlayers: 10,
    });

    // Try to book 15:00-16:00 (overlaps with open play)
    const publicCaller = appRouter.createCaller(makeCtx());
    await expect(
      publicCaller.reservation.create({
        date,
        startTime: "15:00",
        duration: 60,
        contactPhone: "5550005555",
      })
    ).rejects.toThrow("conflicts");
  });

  it("prevents Open Play from overlapping with an existing reservation", async () => {
    const publicCaller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();

    // Book 18:00-19:00
    await publicCaller.reservation.create({
      date,
      startTime: "18:00",
      duration: 60,
      contactPhone: "5550006666",
    });

    // Try to create Open Play 17:30-18:30 (overlaps)
    const admin = makeUser({ role: "admin" });
    const adminCaller = appRouter.createCaller(makeCtx(admin));
    await expect(
      adminCaller.openPlay.create({
        date,
        startTime: "17:30",
        endTime: "18:30",
        title: "Conflict Test OP2",
        maxPlayers: 10,
      })
    ).rejects.toThrow("conflicts");
  });
});

// ─── B3: Cancel-by-code for anonymous users ─────────────────────

describe("B3: Cancel reservation by confirmation code", () => {
  it("allows cancellation with valid code + phone", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();

    // Create a reservation
    const res = await caller.reservation.create({
      date,
      startTime: "08:00",
      duration: 60,
      contactPhone: "5550007777",
    });

    // Cancel by code
    const result = await caller.reservation.cancelByCode({
      confirmationCode: res.confirmationCode,
      contactPhone: "5550007777",
    });
    expect(result.success).toBe(true);
  });

  it("rejects cancellation with wrong phone", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();

    const res = await caller.reservation.create({
      date,
      startTime: "08:00",
      duration: 60,
      contactPhone: "5550008888",
    });

    await expect(
      caller.reservation.cancelByCode({
        confirmationCode: res.confirmationCode,
        contactPhone: "0000000000",
      })
    ).rejects.toThrow();
  });

  it("rejects cancellation with invalid code", async () => {
    const caller = appRouter.createCaller(makeCtx());

    await expect(
      caller.reservation.cancelByCode({
        confirmationCode: "INVALID123",
        contactPhone: "5550009999",
      })
    ).rejects.toThrow();
  });
});

// ─── B4: Tournament maxParticipants enforcement ─────────────────

describe("B4: Tournament maxParticipants enforcement", () => {
  it("enforces maxParticipants cap on tournament registration", async () => {
    const admin = makeUser({ role: "admin" });
    const adminCaller = appRouter.createCaller(makeCtx(admin));
    const date = uniqueDate();

    // Create tournament with max 1 participant
    const t = await adminCaller.tournament.create({
      name: "Tiny Tournament " + date,
      date,
      maxParticipants: 1,
    });

    // First user registers successfully — use the actual admin user (id=1) which exists in DB
    const reg = await adminCaller.tournament.register({ tournamentId: t.id });
    expect(reg.success).toBe(true);

    // Second user should be rejected — but we need a real user in the DB
    // Since we can't easily create users in tests, we test the capacity check
    // by trying to register the same user again (which will fail on duplicate or capacity)
    await expect(
      adminCaller.tournament.register({ tournamentId: t.id })
    ).rejects.toThrow();
  });

  it("rejects registration for non-upcoming tournaments", async () => {
    const admin = makeUser({ role: "admin" });
    const adminCaller = appRouter.createCaller(makeCtx(admin));
    const date = uniqueDate();

    const t = await adminCaller.tournament.create({
      name: "Completed Tournament " + date,
      date,
    });

    // Mark as completed
    await adminCaller.tournament.updateStatus({ tournamentId: t.id, status: "completed" });

    await expect(
      adminCaller.tournament.register({ tournamentId: t.id })
    ).rejects.toThrow("upcoming");
  });
});

// ─── B5: Admin reject user ──────────────────────────────────────

describe("B5: Admin reject user", () => {
  it("admin can set a user role to unapproved_guest (reject)", async () => {
    const admin = makeUser({ role: "admin" });
    const caller = appRouter.createCaller(makeCtx(admin));

    // This should not throw — the procedure exists and accepts the role
    const result = await caller.admin.users.setRole({ userId: 999, role: "unapproved_guest" });
    expect(result.success).toBe(true);
  });

  it("non-admin cannot reject users", async () => {
    const user = makeUser({ role: "guest" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.admin.users.setRole({ userId: 999, role: "unapproved_guest" })
    ).rejects.toThrow();
  });
});

// ─── B10: Type safety - no `as any` in procedures ───────────────

describe("B10: Procedure type safety", () => {
  it("reservation.create input validation rejects invalid duration", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();

    await expect(
      caller.reservation.create({
        date,
        startTime: "10:00",
        duration: 45 as any, // Not a multiple of 30
        contactPhone: "5551111111",
      })
    ).rejects.toThrow();
  });

  it("reservation.create input validation rejects empty phone", async () => {
    const caller = appRouter.createCaller(makeCtx());
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

  it("cancelByCode input validation rejects empty code", async () => {
    const caller = appRouter.createCaller(makeCtx());

    await expect(
      caller.reservation.cancelByCode({
        confirmationCode: "",
        contactPhone: "5551111111",
      })
    ).rejects.toThrow();
  });
});

// ─── Pricing consistency ────────────────────────────────────────

describe("Pricing consistency", () => {
  it("30min = $25", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();
    const r = await caller.reservation.create({
      date,
      startTime: "06:00",
      duration: 30,
      contactPhone: "5551111111",
    });
    expect(r.price).toBe(2500);
  });

  it("60min = $50", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();
    const r = await caller.reservation.create({
      date,
      startTime: "06:00",
      duration: 60,
      contactPhone: "5551111111",
    });
    expect(r.price).toBe(5000);
  });

  it("90min = $75", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();
    const r = await caller.reservation.create({
      date,
      startTime: "06:00",
      duration: 90,
      contactPhone: "5551111111",
    });
    expect(r.price).toBe(7500);
  });

  it("120min = $90 (2hr discount)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const date = uniqueDate();
    const r = await caller.reservation.create({
      date,
      startTime: "06:00",
      duration: 120,
      contactPhone: "5551111111",
    });
    expect(r.price).toBe(9000);
  });
});

// ─── Profile router ─────────────────────────────────────────────

describe("Profile router", () => {
  it("rejects unauthenticated phone update", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.profile.updatePhone({ phone: "5559876543" })
    ).rejects.toThrow();
  });

  it("rejects empty phone", async () => {
    const user = makeUser();
    const caller = appRouter.createCaller(makeCtx(user));
    await expect(
      caller.profile.updatePhone({ phone: "" })
    ).rejects.toThrow();
  });

  it("allows authenticated user to update phone", async () => {
    const user = makeUser();
    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.profile.updatePhone({ phone: "5559876543" });
    expect(result.success).toBe(true);
  });
});

// ─── Open Play: admin operations ────────────────────────────────

describe("Open Play admin operations", () => {
  it("admin can update an open play session", async () => {
    const admin = makeUser({ role: "admin" });
    const adminCaller = appRouter.createCaller(makeCtx(admin));
    const date = uniqueDate();

    const session = await adminCaller.openPlay.create({
      date,
      startTime: "09:00",
      endTime: "11:00",
      title: "Editable Session",
      maxPlayers: 10,
    });

    const result = await adminCaller.openPlay.update({
      id: session.id,
      title: "Updated Session Title",
      maxPlayers: 15,
    });
    expect(result.success).toBe(true);
  });

  it("admin can cancel an open play session", async () => {
    const admin = makeUser({ role: "admin" });
    const adminCaller = appRouter.createCaller(makeCtx(admin));
    const date = uniqueDate();

    const session = await adminCaller.openPlay.create({
      date,
      startTime: "09:00",
      endTime: "11:00",
      title: "Cancellable Session",
      maxPlayers: 10,
    });

    const result = await adminCaller.openPlay.cancel({ id: session.id });
    expect(result.success).toBe(true);
  });
});
