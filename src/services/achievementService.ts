import { prisma } from "../lib/prisma.js";

/**
 * Achievement Service
 * Manages achievements and user achievements
 */

/**
 * Get all achievements
 */
export async function getAllAchievements(category?: string) {
  const where: Record<string, unknown> = {};
  if (category) {
    where.category = category;
  }

  return await prisma.achievement.findMany({
    where,
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * Get user's achievements
 */
export async function getUserAchievements(userId: string) {
  const achievements = await prisma.achievement.findMany({
    orderBy: { sortOrder: "asc" },
  });

  const userAchievements = await prisma.userAchievement.findMany({
    where: { userId },
    include: { achievement: true },
  });

  return achievements.map((achievement) => {
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

  // Get current streak
  const userStreak = await prisma.userStreak.findUnique({
    where: { userId },
  });

  // Get total referrals
  const totalReferrals = await prisma.referralRelation.count({
    where: { referrerId: userId },
  });

  // Get all achievements
  const achievements = await prisma.achievement.findMany();

  // Get already unlocked achievements
  const unlockedAchievementIds = (
    await prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    })
  ).map((ua) => ua.achievementId);

  const newlyUnlocked: string[] = [];

  // Check each achievement
  for (const achievement of achievements) {
    // Skip if already unlocked
    if (unlockedAchievementIds.includes(achievement.id)) {
      continue;
    }

    let shouldUnlock = false;

    // Check based on category
    switch (achievement.category) {
      case "tickets":
        shouldUnlock = totalTickets >= achievement.target;
        break;
      case "wins":
        shouldUnlock = totalWins >= achievement.target;
        break;
      case "streak":
        shouldUnlock = (userStreak?.longestStreak || 0) >= achievement.target;
        break;
      case "referrals":
        shouldUnlock = totalReferrals >= achievement.target;
        break;
      case "level":
        shouldUnlock = user.level >= achievement.target;
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

      // Create reward record
      await prisma.userReward.create({
        data: {
          userId,
          source: "achievement",
          sourceId: achievement.id,
          type: "xp",
          value: achievement.rewardXp,
          claimed: false,
        },
      });

      // Create ticket reward if any
      if (achievement.rewardTickets > 0) {
        await prisma.userReward.create({
          data: {
            userId,
            source: "achievement",
            sourceId: achievement.id,
            type: "ticket",
            value: achievement.rewardTickets,
            claimed: false,
          },
        });
      }

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
    include: { achievement: true },
  });

  if (!userAchievement) {
    throw new Error("Achievement not found or already claimed");
  }

  // Mark as claimed
  await prisma.userAchievement.update({
    where: { id: userAchievement.id },
    data: {
      claimed: true,
      claimedAt: new Date(),
    },
  });

  return {
    rewardXp: userAchievement.achievement.rewardXp,
    rewardTickets: userAchievement.achievement.rewardTickets,
  };
}
