/**
 * Gamification System Configuration
 * All gamification constants in one place
 */

export const GAMIFICATION_CONFIG = {
  // XP & Levels
  xp: {
    perTicketPurchase: 15,
    perWin: 50,
    perReferralSignup: 100,
    perReferralPurchase: 25,
    dailyCheckInBase: 20,
    dailyCheckInMax: 50,
  },

  levels: {
    max: 50,
    // Balanced level system with specific XP requirements
    xpRequirements: {
      1: 0,
      2: 100,
      3: 300,
      4: 600,
      5: 1000,
      6: 1500,
      7: 2100,
      8: 2800,
      9: 3600,
      10: 4500,
      11: 5100,
      12: 5400,
      13: 5600,
      14: 5800,
      15: 6000,
      16: 6500,
      17: 7000,
      18: 8000,
      19: 9000,
      20: 10000,
      21: 11000,
      22: 12000,
      23: 13500,
      24: 14000,
      25: 15000,
      26: 16500,
      27: 18000,
      28: 19500,
      29: 21000,
      30: 22500,
      31: 24000,
      32: 26000,
      33: 28000,
      34: 30000,
      35: 32000,
      36: 34000,
      37: 36000,
      38: 38000,
      39: 40000,
      40: 42000,
      41: 44000,
      42: 45000,
      43: 46000,
      44: 47000,
      45: 48000,
      46: 49000,
      47: 49500,
      48: 49700,
      49: 49900,
      50: 50000,
    } as Record<number, number>,
    // Rewards given at specific levels (balanced economy - total 9 free tickets)
    rewards: {
      5: { tickets: 1 }, // 1 free ticket
      10: { withdrawalFeeDiscount: 0.03 }, // -3% withdrawal fee
      15: { tickets: 1, withdrawalFeeDiscount: 0.05 }, // 1 ticket + -5% fee
      20: { withdrawalFeeDiscount: 0.07 }, // -7% withdrawal fee
      25: { tickets: 2, withdrawalFeeDiscount: 0.1 }, // 2 tickets + -10% fee
      50: { tickets: 5, withdrawalFeeDiscount: 0.15 }, // 5 tickets + -15% fee
    } as Record<number, { tickets?: number; withdrawalFeeDiscount?: number }>,
  },

  // Streak
  streak: {
    resetHours: 36, // Hours before streak resets
    milestones: {
      3: { xp: 50 },
      7: { tickets: 1 },
      14: { xp: 200, badge: "two_weeks" },
      30: { tickets: 2, badge: "month" },
      60: { tickets: 3 },
      100: { tickets: 5, vip: "silver", badge: "legend" },
    } as Record<
      number,
      { xp?: number; tickets?: number; vip?: string; badge?: string }
    >,
  },

  // Referrals
  referral: {
    maxReferrals: 50,
    codeExpiryDays: 90,
    bonusXpDays: 30,
    rewards: {
      onSignup: { xp: 100 },
      onFirstPurchase: { tickets: 1, referredTickets: 1 },
      onPurchase: { xp: 10 },
    },
  },

  // Leaderboard
  leaderboard: {
    monthlyRewards: {
      1: { tickets: 5, badge: "champion" },
      2: { tickets: 3 },
      3: { tickets: 3 },
      "4-10": { tickets: 1 },
    } as Record<string | number, { tickets?: number; badge?: string }>,
  },
};

/**
 * Calculate total XP required to reach a specific level
 */
export function getTotalXpForLevel(level: number): number {
  if (level < 1) return 0;
  if (level > GAMIFICATION_CONFIG.levels.max) {
    return GAMIFICATION_CONFIG.levels.xpRequirements[
      GAMIFICATION_CONFIG.levels.max
    ];
  }
  return GAMIFICATION_CONFIG.levels.xpRequirements[level] || 0;
}

/**
 * Calculate level from total XP
 */
export function getLevelFromXp(xp: number): number {
  let level = 1;

  for (let i = GAMIFICATION_CONFIG.levels.max; i >= 1; i--) {
    if (xp >= GAMIFICATION_CONFIG.levels.xpRequirements[i]) {
      level = i;
      break;
    }
  }

  return level;
}

/**
 * Calculate XP progress within current level
 */
export function getXpProgressInLevel(
  xp: number,
  currentLevel: number,
): {
  current: number;
  required: number;
  percentage: number;
} {
  const currentLevelXp =
    GAMIFICATION_CONFIG.levels.xpRequirements[currentLevel] || 0;
  const nextLevelXp =
    GAMIFICATION_CONFIG.levels.xpRequirements[currentLevel + 1] ||
    currentLevelXp;
  const xpRequiredForNextLevel = nextLevelXp - currentLevelXp;
  const currentXpInLevel = xp - currentLevelXp;

  return {
    current: currentXpInLevel,
    required: xpRequiredForNextLevel,
    percentage:
      xpRequiredForNextLevel > 0
        ? Math.min(
            100,
            Math.floor((currentXpInLevel / xpRequiredForNextLevel) * 100),
          )
        : 100,
  };
}
