/**
 * Achievements Service
 * Manages achievements and user achievements
 */

import { prisma } from "../../lib/prisma.js";
import {
  ACHIEVEMENTS,
  getAchievementById,
  getAchievementsByType,
  type Achievement,
  type AchievementProgress,
} from "../../data/achievements.js";

/**
 * Get all achievements from code-defined data
 */
export async function getAllAchievements(category?: Achievement["category"]) {
  let achievements = ACHIEVEMENTS;

  if (category) {
    achievements = achievements.filter((a) => a.category === category);
  }

  return achievements;
}

/**
 * Get user's achievements with progress
 */
export async function getUserAchievements(userId: string) {
  const userAchievements = await prisma.userAchievement.findMany({
    where: { userId },
  });

  return ACHIEVEMENTS.map((achievement) => {
    const userAchievement = userAchievements.find(
      (ua) => ua.achievementId === achievement.id,
    );

    return {
      ...achievement,
      unlocked: !!userAchievement,
      unlockedAt: userAchievement?.unlockedAt || null,
      claimed: userAchievement?.claimed || false,
      claimedAt: userAchievement?.claimedAt || null,
      userAchievementId: userAchievement?.id || null,
    };
  });
}

/**
 * Check if user has completed prerequisite achievements
 */
async function checkPrerequisites(
  userId: string,
  prerequisites: string[],
): Promise<boolean> {
  const unlockedAchievementIds = (
    await prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    })
  ).map((ua) => ua.achievementId);

  return prerequisites.every((prereqId) =>
    unlockedAchievementIds.includes(prereqId),
  );
}

/**
 * Check and unlock achievements based on user stats
 */
export async function checkAchievements(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    console.warn(`[Achievement] User not found: ${userId}`);
    return [];
  }

  // Get total tickets
  const totalTickets = await prisma.ticket.count({
    where: { userId },
  });

  // Get total wins
  const totalWins = await prisma.ticket.count({
    where: { userId, status: "won" },
  });

  // Get total winnings
  const totalWinnings = user.totalWon || 0;

  // Get jackpot wins (5 matches)
  const jackpotWins = await prisma.ticket.count({
    where: {
      userId,
      status: "won",
      matchedNumbers: 5,
    },
  });

  // Get current streak
  const userStreak = await prisma.userStreak.findUnique({
    where: { userId },
  });

  // Get total referrals
  const totalReferrals = await prisma.referralRelation.count({
    where: { referrerId: userId },
  });

  // Get already unlocked achievements
  const unlockedAchievementIds = (
    await prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    })
  ).map((ua) => ua.achievementId);

  const newlyUnlocked: string[] = [];

  // Check each achievement from code-defined list
  for (const achievement of ACHIEVEMENTS) {
    // Skip if already unlocked
    if (unlockedAchievementIds.includes(achievement.id)) {
      continue;
    }

    // Check prerequisites
    if (achievement.prerequisites) {
      const hasPrerequisites = await checkPrerequisites(
        userId,
        achievement.prerequisites,
      );
      if (!hasPrerequisites) {
        continue;
      }
    }

    let shouldUnlock = false;

    // Check based on type
    switch (achievement.type) {
      case "tickets":
        shouldUnlock = totalTickets >= achievement.target;
        break;
      case "wins":
        shouldUnlock = totalWins >= achievement.target;
        break;
      case "winnings":
        shouldUnlock = totalWinnings >= achievement.target;
        break;
      case "jackpot":
        shouldUnlock = jackpotWins >= achievement.target;
        break;
      case "streak":
        shouldUnlock = (userStreak?.longestStreak || 0) >= achievement.target;
        break;
      case "referrals":
        shouldUnlock = totalReferrals >= achievement.target;
        break;
    }

    if (shouldUnlock) {
      // Unlock achievement
      await prisma.userAchievement.create({
        data: {
          userId,
          achievementId: achievement.id,
        },
      });

      newlyUnlocked.push(achievement.id);
    }
  }

  return newlyUnlocked;
}

/**
 * Claim achievement reward
 */
export async function claimAchievementReward(
  userId: string,
  achievementId: string,
) {
  const userAchievement = await prisma.userAchievement.findFirst({
    where: {
      userId,
      achievementId,
      claimed: false,
    },
  });

  if (!userAchievement) {
    throw new Error("Achievement not found or already claimed");
  }

  // Get achievement from code-defined list
  const achievement = getAchievementById(achievementId);

  if (!achievement) {
    throw new Error("Achievement definition not found");
  }

  // Use transaction to update achievement and user atomically
  const [, updatedUser] = await prisma.$transaction([
    // Mark as claimed
    prisma.userAchievement.update({
      where: { id: userAchievement.id },
      data: {
        claimed: true,
        claimedAt: new Date(),
      },
    }),
    // Award XP and TON (coinReward) to user
    prisma.user.update({
      where: { id: userId },
      data: {
        experience: { increment: achievement.xpReward },
        balance: { increment: achievement.coinReward },
      },
    }),
  ]);

  return {
    rewardXp: achievement.xpReward,
    rewardTon: achievement.coinReward,
    rewardTickets: 0, // Ticket rewards not currently supported in code-defined achievements
    newXp: updatedUser.experience,
    newBalance: updatedUser.balance,
  };
}

/**
 * Get achievement progress for a specific achievement
 */
export async function getAchievementProgress(
  userId: string,
  achievementId: string,
): Promise<AchievementProgress | null> {
  const achievement = getAchievementById(achievementId);

  if (!achievement) {
    return null;
  }

  const userAchievement = await prisma.userAchievement.findFirst({
    where: { userId, achievementId },
  });

  // Get current value based on achievement type
  let currentValue = 0;

  switch (achievement.type) {
    case "tickets": {
      currentValue = await prisma.ticket.count({ where: { userId } });
      break;
    }
    case "wins": {
      currentValue = await prisma.ticket.count({
        where: { userId, status: "won" },
      });
      break;
    }
    case "winnings": {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      currentValue = user?.totalWon || 0;
      break;
    }
    case "jackpot": {
      currentValue = await prisma.ticket.count({
        where: { userId, status: "won", matchedNumbers: 5 },
      });
      break;
    }
    case "streak": {
      const streak = await prisma.userStreak.findUnique({ where: { userId } });
      currentValue = streak?.longestStreak || 0;
      break;
    }
    case "referrals": {
      currentValue = await prisma.referralRelation.count({
        where: { referrerId: userId },
      });
      break;
    }
  }

  return {
    achievementId,
    userId,
    currentValue,
    targetValue: achievement.target,
    completed: !!userAchievement,
    completedAt: userAchievement?.unlockedAt,
    claimed: userAchievement?.claimed || false,
    claimedAt: userAchievement?.claimedAt || undefined,
  };
}

/**
 * Check achievements of a specific type with current value
 * This is useful for real-time achievement checking
 */
export async function checkAchievementsByType(
  userId: string,
  type: Achievement["type"],
  currentValue: number,
): Promise<Achievement[]> {
  const relevantAchievements = getAchievementsByType(type);
  const unlockedAchievements: Achievement[] = [];

  for (const achievement of relevantAchievements) {
    // Check prerequisites
    if (achievement.prerequisites) {
      const hasPrerequisites = await checkPrerequisites(
        userId,
        achievement.prerequisites,
      );
      if (!hasPrerequisites) continue;
    }

    // Check if achievement is already unlocked
    const existingAchievement = await prisma.userAchievement.findFirst({
      where: { userId, achievementId: achievement.id },
    });

    if (!existingAchievement && currentValue >= achievement.target) {
      // Unlock achievement
      await prisma.userAchievement.create({
        data: {
          userId,
          achievementId: achievement.id,
        },
      });

      unlockedAchievements.push(achievement);
    }
  }

  return unlockedAchievements;
}
