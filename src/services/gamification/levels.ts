/**
 * Level System Service
 * Handles level calculations and rewards
 */

import {
  GAMIFICATION_CONFIG,
  getLevelFromXp,
  getXpProgressInLevel,
  getTotalXpForLevel,
} from "../../config/gamification.js";

/**
 * Level configuration interface
 */
export interface LevelInfo {
  level: number;
  xpRequired: number;
  xpProgress: {
    current: number;
    required: number;
    percentage: number;
  };
  rewards?: {
    tickets?: number;
    withdrawalFeeDiscount?: number;
  };
  nextLevelRewards?: {
    tickets?: number;
    withdrawalFeeDiscount?: number;
  };
}

/**
 * Get all level milestones with rewards
 */
export function getLevelMilestones() {
  const milestones = [];

  for (let level = 1; level <= GAMIFICATION_CONFIG.levels.max; level++) {
    const xpRequired = GAMIFICATION_CONFIG.levels.xpRequirements[level];
    const rewards = GAMIFICATION_CONFIG.levels.rewards[level];

    if (rewards || level === 1) {
      milestones.push({
        level,
        xpRequired,
        rewards: rewards || {},
      });
    }
  }

  return milestones;
}

/**
 * Get level info for a user based on their XP
 */
export function getLevelInfo(userXp: number): LevelInfo {
  const level = getLevelFromXp(userXp);
  const xpRequired = getTotalXpForLevel(level);
  const xpProgress = getXpProgressInLevel(userXp, level);
  const rewards = GAMIFICATION_CONFIG.levels.rewards[level];

  // Find next level with rewards
  let nextLevelRewards;
  for (
    let nextLevel = level + 1;
    nextLevel <= GAMIFICATION_CONFIG.levels.max;
    nextLevel++
  ) {
    if (GAMIFICATION_CONFIG.levels.rewards[nextLevel]) {
      nextLevelRewards = GAMIFICATION_CONFIG.levels.rewards[nextLevel];
      break;
    }
  }

  return {
    level,
    xpRequired,
    xpProgress,
    rewards,
    nextLevelRewards,
  };
}

/**
 * Get user's total withdrawal fee discount based on level
 */
export function getWithdrawalFeeDiscount(userLevel: number): number {
  let totalDiscount = 0;

  // Accumulate all discounts from levels user has reached
  for (let level = 1; level <= userLevel; level++) {
    const reward = GAMIFICATION_CONFIG.levels.rewards[level];
    if (reward?.withdrawalFeeDiscount) {
      totalDiscount = reward.withdrawalFeeDiscount; // Use the latest/highest discount
    }
  }

  return totalDiscount;
}

/**
 * Calculate total free tickets earned from levels
 */
export function getTotalTicketsFromLevels(userLevel: number): number {
  let totalTickets = 0;

  for (let level = 1; level <= userLevel; level++) {
    const reward = GAMIFICATION_CONFIG.levels.rewards[level];
    if (reward?.tickets) {
      totalTickets += reward.tickets;
    }
  }

  return totalTickets;
}

export { getLevelFromXp, getXpProgressInLevel, getTotalXpForLevel };
