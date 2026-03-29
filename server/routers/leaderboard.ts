import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { tournaments, users } from "../../drizzle/schema";
import { eq, sql, desc, isNotNull } from "drizzle-orm";

export const leaderboardRouter = router({
  get: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    // Get all completed tournaments with winners
    const results = await db
      .select({
        usrId: users.id,
        userName: users.name,
        wins: sql<number>`count(*)`.as("wins"),
      })
      .from(tournaments)
      .innerJoin(users, eq(tournaments.winnerId, users.id))
      .where(eq(tournaments.status, "completed"))
      .groupBy(users.id, users.name)
      .orderBy(desc(sql`count(*)`));

    return results.map((r, i) => ({
      rank: i + 1,
      userId: r.usrId,
      name: r.userName || "Unknown",
      wins: Number(r.wins),
    }));
  }),
});
