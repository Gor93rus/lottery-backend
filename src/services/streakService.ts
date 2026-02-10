import { prisma } from "../lib/prisma.js";
import { GAMIFICATION_CONFIG } from "../config/gamification.js";
import { updateDailyTaskProgress } from "./gamification/dailyTasks.js";

/**
 * Streak Service
 * Manages user check-in streaks
 */

/**
 * Process daily check-in for a user
 */
export async function processCheckIn(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
  xpEarned: number;
  ticketsEarned: number;
  milestoneReached?: number;
}> {
  const now = new Date();
  const resetHours = GAMIFICATION_CONFIG.streak.resetHours;

  // Get or create user streak using UPSERT (fixes unique constraint error)
  let userStreak = await prisma.userStreak.upsert({
    where: { userId },
    update: {}, // Don't update anything if exists
    create: {
      userId,
      currentStreak: 0,
      longestStreak: 0,
      totalCheckIns: 0,
    },
  });

  // Check if user already checked in today
  if (userStreak.lastCheckIn) {
    const lastCheckIn = new Date(userStreak.lastCheckIn);

    // Check if already checked in today (same calendar day)
    const isToday =
      now.getFullYear() === lastCheckIn.getFullYear() &&
      now.getMonth() === lastCheckIn.getMonth() &&
      now.getDate() === lastCheckIn.getDate();

    if (isToday) {
      throw new Error("Already checked in today");
    }

    // Calculate hours since last check-in for streak logic
    const hoursSinceLastCheckIn =
      (now.getTime() - userStreak.lastCheckIn.getTime()) / (1000 * 60 * 60);

    // Streak continues (within reset window)
    if (hoursSinceLastCheckIn < resetHours) {
      userStreak = {
        ...userStreak,
        currentStreak: userStreak.currentStreak + 1,
      };
    } else {
      // Streak reset
      userStreak = { ...userStreak, currentStreak: 1 };
    }
  } else {
    // First check-in ever
    userStreak = { ...userStreak, currentStreak: 1 };
  }

  // Update longest streak
  const newLongestStreak = Math.max(
    userStreak.currentStreak,
    userStreak.longestStreak,
  );

  // Save streak
  await prisma.userStreak.update({
    where: { userId },
    data: {
      currentStreak: userStreak.currentStreak,
      longestStreak: newLongestStreak,
      lastCheckIn: now,
      totalCheckIns: { increment: 1 },
    },
  });

  // Calculate rewards
  let xpEarned = GAMIFICATION_CONFIG.xp.dailyCheckInBase;
  let ticketsEarned = 0;
  let milestoneReached: number | undefined;

  // Check for streak milestones
  const milestone =
    GAMIFICATION_CONFIG.streak.milestones[userStreak.currentStreak];
  if (milestone) {
    milestoneReached = userStreak.currentStreak;
    if (milestone.xp) {
      xpEarned += milestone.xp;
    }
    if (milestone.tickets) {
      ticketsEarned += milestone.tickets;
    }
  }

  // Update user XP
  await prisma.user.update({
    where: { id: userId },
    data: {
      experience: { increment: xpEarned },
      streak: userStreak.currentStreak,
      lastActiveAt: now,
    },
  });

  // Update daily tasks for login and streak
  await updateDailyTaskProgress(userId, "LOGIN", 1);
  await updateDailyTaskProgress(userId, "STREAK", userStreak.currentStreak);

  return {
    currentStreak: userStreak.currentStreak,
    longestStreak: newLongestStreak,
    xpEarned,
    ticketsEarned,
    milestoneReached,
  };
}

/**
 * Get user streak info
 */
export async function getUserStreak(userId: string) {
  // Use UPSERT instead of findUnique + create (fixes unique constraint error)
  const userStreak = await prisma.userStreak.upsert({
    where: { userId },
    update: {}, // Don't update anything if exists
    create: {
      userId,
      currentStreak: 0,
      longestStreak: 0,
      totalCheckIns: 0,
    },
  });

  // Check if can check in
  const now = new Date();
  let canCheckIn = true;
  let nextCheckInAt: Date | null = null;

  if (userStreak.lastCheckIn) {
    const lastCheckIn = new Date(userStreak.lastCheckIn);

    // Check if already checked in today (same calendar day)
    const isToday =
      now.getFullYear() === lastCheckIn.getFullYear() &&
      now.getMonth() === lastCheckIn.getMonth() &&
      now.getDate() === lastCheckIn.getDate();

    if (isToday) {
      canCheckIn = false;
      // Next check-in is tomorrow at midnight
      nextCheckInAt = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        0,
      );
    }
  }

  return {
    currentStreak: userStreak.currentStreak,
    longestStreak: userStreak.longestStreak,
    lastCheckIn: userStreak.lastCheckIn,
    totalCheckIns: userStreak.totalCheckIns,
    canCheckIn,
    nextCheckInAt,
  };
}
