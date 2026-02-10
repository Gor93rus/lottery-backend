import { prisma } from "../lib/prisma.js";
import {
  GAMIFICATION_CONFIG,
  getLevelFromXp,
  getXpProgressInLevel,
} from "../config/gamification.js";
import * as questService from "./questService.js";
import * as achievementService from "./gamification/achievements.js";
import * as streakService from "./streakService.js";
import * as rewardService from "./rewardService.js";
import * as referralService from "./referralService.js";
import * as leaderboardService from "./leaderboardService.js";
import { updateDailyTaskProgress } from "./gamification/dailyTasks.js";

/**
 * Gamification Service
 * Main orchestrator for all gamification features
 */

/**
 * Get user's complete gamification profile
 */
export async function getUserGamificationProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Calculate level info
  const currentLevel = getLevelFromXp(user.experience);
  const levelProgress = getXpProgressInLevel(user.experience, currentLevel);

  // Get streak info
  const streakInfo = await streakService.getUserStreak(userId);

  // Get unclaimed rewards
  const unclaimedRewards = await rewardService.getUnclaimedRewards(userId);

  // Get referral stats
  const referralStats = await referralService.getReferralStats(userId);

  // Get user's position in leaderboards
  const leaderboardPositions = {
    xp: await leaderboardService.getUserLeaderboardPosition(
      userId,
      "xp",
      "alltime",
    ),
    tickets: await leaderboardService.getUserLeaderboardPosition(
      userId,
      "tickets",
      "monthly",
    ),
    wins: await leaderboardService.getUserLeaderboardPosition(
      userId,
      "wins",
      "monthly",
    ),
    streak: await leaderboardService.getUserLeaderboardPosition(
      userId,
      "streak",
      "alltime",
    ),
  };

  return {
    user: {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl,
    },
    level: {
      current: currentLevel,
      progress: levelProgress,
    },
    experience: user.experience,
    streak: streakInfo,
    referrals: referralStats,
    unclaimedRewards: unclaimedRewards.length,
    leaderboardPositions,
  };
}

/**
 * Process ticket purchase (trigger gamification)
 */
export async function processTicketPurchase(userId: string): Promise<void> {
  // Award XP for ticket purchase
  const xpEarned = GAMIFICATION_CONFIG.xp.perTicketPurchase;

  await prisma.user.update({
    where: { id: userId },
    data: {
      experience: { increment: xpEarned },
      lastActiveAt: new Date(),
    },
  });

  // Update quests
  await questService.updateQuestProgress(userId, "daily_first_ticket", 1);
  await questService.updateQuestProgress(userId, "daily_active_player", 1);
  await questService.updateQuestProgress(userId, "weekly_tickets", 1);
  await questService.updateQuestProgress(userId, "monthly_marathon", 1);
  await questService.updateQuestProgress(userId, "onboarding_first_ticket", 1);

  // Update daily tasks
  await updateDailyTaskProgress(userId, "BUY_TICKETS", 1);

  // Check achievements
  await achievementService.checkAchievements(userId);

  // Process referral first purchase
  await referralService.processReferralFirstPurchase(userId);

  // Check for level up
  await checkLevelUp(userId);
}

/**
 * Process win (trigger gamification)
 */
export async function processWin(userId: string): Promise<void> {
  // Award XP for win
  const xpEarned = GAMIFICATION_CONFIG.xp.perWin;

  await prisma.user.update({
    where: { id: userId },
    data: {
      experience: { increment: xpEarned },
      lastActiveAt: new Date(),
    },
  });

  // Check achievements
  await achievementService.checkAchievements(userId);

  // Check for level up
  await checkLevelUp(userId);
}

/**
 * Process user registration (trigger gamification)
 */
export async function processUserRegistration(userId: string): Promise<void> {
  // Create streak record
  await prisma.userStreak.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      currentStreak: 0,
      longestStreak: 0,
      totalCheckIns: 0,
    },
  });

  // Complete onboarding welcome quest
  await questService.updateQuestProgress(userId, "onboarding_welcome", 1);

  // Complete telegram quest (assuming they registered via Telegram)
  await questService.updateQuestProgress(userId, "onboarding_telegram", 1);
}

/**
 * Process wallet connection (trigger gamification)
 */
export async function processWalletConnection(userId: string): Promise<void> {
  // Complete wallet quest
  await questService.updateQuestProgress(userId, "onboarding_wallet", 1);

  // Check achievements
  await achievementService.checkAchievements(userId);
}

/**
 * Check and process level up
 */
async function checkLevelUp(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return;
  }

  const newLevel = getLevelFromXp(user.experience);

  if (newLevel > user.level) {
    // Update user level
    await prisma.user.update({
      where: { id: userId },
      data: { level: newLevel },
    });

    // Check for level rewards
    for (let level = user.level + 1; level <= newLevel; level++) {
      const reward = GAMIFICATION_CONFIG.levels.rewards[level];
      if (reward) {
        // Create reward records
        if (reward.tickets) {
          await rewardService.createReward(
            userId,
            "ticket",
            reward.tickets,
            "level",
            level.toString(),
          );
        }
      }
    }

    // Check achievements (level category)
    await achievementService.checkAchievements(userId);
  }
}

// Export all sub-services
export {
  questService,
  achievementService,
  streakService,
  rewardService,
  referralService,
  leaderboardService,
};
