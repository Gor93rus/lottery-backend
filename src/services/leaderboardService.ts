import { prisma } from "../lib/prisma.js";

/**
 * Leaderboard Service
 * Manages leaderboard calculations and rankings
 */

export type LeaderboardType = "xp" | "tickets" | "wins" | "streak";
export type LeaderboardPeriod = "daily" | "weekly" | "monthly" | "alltime";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  value: number;
  level: number;
}

/**
 * Get leaderboard for a specific type and period
 */
export async function getLeaderboard(
  type: LeaderboardType,
  period: LeaderboardPeriod = "alltime",
  limit: number = 100,
): Promise<LeaderboardEntry[]> {
  const now = new Date();
  let startDate: Date | undefined;

  // Calculate period start date
  if (period === "daily") {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
  } else if (period === "weekly") {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    startDate.setHours(0, 0, 0, 0);
  } else if (period === "monthly") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  let entries: Omit<LeaderboardEntry, "rank">[] = [];

  switch (type) {
    case "xp":
      entries = await getXpLeaderboard(limit);
      break;
    case "tickets":
      entries = await getTicketsLeaderboard(startDate, limit);
      break;
    case "wins":
      entries = await getWinsLeaderboard(startDate, limit);
      break;
    case "streak":
      entries = await getStreakLeaderboard(limit);
      break;
  }

  // Add ranks
  return entries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

/**
 * Get XP leaderboard (all-time)
 */
async function getXpLeaderboard(
  limit: number,
): Promise<Omit<LeaderboardEntry, "rank">[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      experience: true,
      level: true,
    },
    orderBy: { experience: "desc" },
    take: limit,
  });

  return users.map((user) => ({
    userId: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    photoUrl: user.photoUrl,
    value: user.experience,
    level: user.level,
  }));
}

/**
 * Get tickets leaderboard (for period)
 */
async function getTicketsLeaderboard(
  startDate: Date | undefined,
  limit: number,
): Promise<Omit<LeaderboardEntry, "rank">[]> {
  const where: Record<string, unknown> = {};
  if (startDate) {
    where.createdAt = { gte: startDate };
  }

  const ticketCounts = await prisma.ticket.groupBy({
    by: ["userId"],
    where,
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  const userIds = ticketCounts
    .map((tc) => tc.userId)
    .filter((id) => id !== null) as string[];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      level: true,
    },
  });

  return ticketCounts
    .filter((tc) => tc.userId !== null)
    .map((tc) => {
      const user = users.find((u) => u.id === tc.userId);
      return {
        userId: tc.userId as string,
        username: user?.username || null,
        firstName: user?.firstName || null,
        lastName: user?.lastName || null,
        photoUrl: user?.photoUrl || null,
        value: tc._count.id,
        level: user?.level || 1,
      };
    });
}

/**
 * Get wins leaderboard (for period)
 */
async function getWinsLeaderboard(
  startDate: Date | undefined,
  limit: number,
): Promise<Omit<LeaderboardEntry, "rank">[]> {
  const where: Record<string, unknown> = { status: "won" };
  if (startDate) {
    where.createdAt = { gte: startDate };
  }

  const winCounts = await prisma.ticket.groupBy({
    by: ["userId"],
    where,
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  const userIds = winCounts
    .map((wc) => wc.userId)
    .filter((id) => id !== null) as string[];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      level: true,
    },
  });

  return winCounts
    .filter((wc) => wc.userId !== null)
    .map((wc) => {
      const user = users.find((u) => u.id === wc.userId);
      return {
        userId: wc.userId as string,
        username: user?.username || null,
        firstName: user?.firstName || null,
        lastName: user?.lastName || null,
        photoUrl: user?.photoUrl || null,
        value: wc._count.id,
        level: user?.level || 1,
      };
    });
}

/**
 * Get streak leaderboard (current streaks)
 */
async function getStreakLeaderboard(
  limit: number,
): Promise<Omit<LeaderboardEntry, "rank">[]> {
  const streaks = await prisma.userStreak.findMany({
    orderBy: { currentStreak: "desc" },
    take: limit,
  });

  const userIds = streaks.map((s) => s.userId);

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      level: true,
    },
  });

  return streaks.map((streak) => {
    const user = users.find((u) => u.id === streak.userId);
    return {
      userId: streak.userId,
      username: user?.username || null,
      firstName: user?.firstName || null,
      lastName: user?.lastName || null,
      photoUrl: user?.photoUrl || null,
      value: streak.currentStreak,
      level: user?.level || 1,
    };
  });
}

/**
 * Get user's position in leaderboard
 */
export async function getUserLeaderboardPosition(
  userId: string,
  type: LeaderboardType,
  period: LeaderboardPeriod = "alltime",
): Promise<{ rank: number; total: number } | null> {
  const now = new Date();
  let startDate: Date | undefined;

  // Calculate period start date
  if (period === "daily") {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
  } else if (period === "weekly") {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    startDate.setHours(0, 0, 0, 0);
  } else if (period === "monthly") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  // Get user's value for the leaderboard type
  let userValue: number;
  let rank: number;
  let total: number;

  switch (type) {
    case "xp": {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { experience: true },
      });
      if (!user) return null;
      userValue = user.experience;

      // Count users with higher XP
      rank =
        (await prisma.user.count({
          where: { experience: { gt: userValue } },
        })) + 1;

      total = await prisma.user.count();
      break;
    }
    case "tickets": {
      const where: Record<string, unknown> = { userId };
      if (startDate) {
        where.createdAt = { gte: startDate };
      }

      const userTickets = await prisma.ticket.count({ where });
      userValue = userTickets;

      // Count users with more tickets in the period
      const ticketCounts = await prisma.ticket.groupBy({
        by: ["userId"],
        where: startDate ? { createdAt: { gte: startDate } } : {},
        _count: { id: true },
      });

      rank = ticketCounts.filter((tc) => tc._count.id > userValue).length + 1;
      total = ticketCounts.length;
      break;
    }
    case "wins": {
      const where: Record<string, unknown> = { userId, status: "won" };
      if (startDate) {
        where.createdAt = { gte: startDate };
      }

      const userWins = await prisma.ticket.count({ where });
      userValue = userWins;

      // Count users with more wins
      const whereAll: Record<string, unknown> = { status: "won" };
      if (startDate) {
        whereAll.createdAt = { gte: startDate };
      }

      const winCounts = await prisma.ticket.groupBy({
        by: ["userId"],
        where: whereAll,
        _count: { id: true },
      });

      rank = winCounts.filter((wc) => wc._count.id > userValue).length + 1;
      total = winCounts.length;
      break;
    }
    case "streak": {
      const userStreak = await prisma.userStreak.findUnique({
        where: { userId },
        select: { currentStreak: true },
      });
      if (!userStreak) return null;
      userValue = userStreak.currentStreak;

      // Count streaks higher than user's
      rank =
        (await prisma.userStreak.count({
          where: { currentStreak: { gt: userValue } },
        })) + 1;

      total = await prisma.userStreak.count();
      break;
    }
  }

  return { rank, total };
}
