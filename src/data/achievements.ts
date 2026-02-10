/**
 * Achievement Definitions
 * @module data/achievements
 *
 * Central source of truth for all achievements in the system.
 * Exports achievement definitions, TypeScript interfaces, and helper functions
 * for managing and querying achievements throughout the application.
 */

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  target: number;
  type: "tickets" | "wins" | "winnings" | "jackpot" | "streak" | "referrals";
  xpReward: number;
  coinReward: number;
  category: "beginner" | "intermediate" | "advanced" | "legendary";
  prerequisites?: string[]; // IDs of required achievements
}

export interface AchievementProgress {
  achievementId: string;
  userId: string;
  currentValue: number;
  targetValue: number;
  completed: boolean;
  completedAt?: Date;
  claimed: boolean;
  claimedAt?: Date;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Beginner Achievements
  {
    id: "first_ticket",
    name: "First Step",
    description: "Buy your first ticket",
    icon: "🎫",
    target: 1,
    type: "tickets",
    xpReward: 10,
    coinReward: 5,
    category: "beginner",
  },
  {
    id: "first_win",
    name: "Lucky Start",
    description: "Win for the first time",
    icon: "🍀",
    target: 1,
    type: "wins",
    xpReward: 25,
    coinReward: 10,
    category: "beginner",
  },

  // Intermediate Achievements
  {
    id: "ticket_10",
    name: "Regular Player",
    description: "Buy 10 tickets",
    icon: "🎟️",
    target: 10,
    type: "tickets",
    xpReward: 50,
    coinReward: 25,
    category: "intermediate",
    prerequisites: ["first_ticket"],
  },
  {
    id: "win_10",
    name: "Winner",
    description: "Win 10 times",
    icon: "🏅",
    target: 10,
    type: "wins",
    xpReward: 100,
    coinReward: 50,
    category: "intermediate",
    prerequisites: ["first_win"],
  },
  {
    id: "winnings_100",
    name: "Small Fortune",
    description: "Win 100 TON total",
    icon: "💰",
    target: 100,
    type: "winnings",
    xpReward: 150,
    coinReward: 75,
    category: "intermediate",
  },

  // Advanced Achievements
  {
    id: "ticket_100",
    name: "Dedicated Player",
    description: "Buy 100 tickets",
    icon: "🎰",
    target: 100,
    type: "tickets",
    xpReward: 200,
    coinReward: 100,
    category: "advanced",
    prerequisites: ["ticket_10"],
  },
  {
    id: "win_50",
    name: "Champion",
    description: "Win 50 times",
    icon: "🏆",
    target: 50,
    type: "wins",
    xpReward: 300,
    coinReward: 150,
    category: "advanced",
    prerequisites: ["win_10"],
  },
  {
    id: "winnings_1000",
    name: "Big Winner",
    description: "Win 1000 TON total",
    icon: "💎",
    target: 1000,
    type: "winnings",
    xpReward: 500,
    coinReward: 250,
    category: "advanced",
    prerequisites: ["winnings_100"],
  },
  {
    id: "streak_3",
    name: "Hot Streak",
    description: "Win 3 draws in a row",
    icon: "🔥",
    target: 3,
    type: "streak",
    xpReward: 75,
    coinReward: 35,
    category: "advanced",
  },

  // Legendary Achievements
  {
    id: "jackpot",
    name: "Jackpot!",
    description: "Hit the jackpot (5 matches)",
    icon: "🎯",
    target: 1,
    type: "jackpot",
    xpReward: 1000,
    coinReward: 500,
    category: "legendary",
  },
  {
    id: "referral_1",
    name: "Friendly",
    description: "Refer 1 friend",
    icon: "👋",
    target: 1,
    type: "referrals",
    xpReward: 20,
    coinReward: 10,
    category: "beginner",
  },
  {
    id: "referral_10",
    name: "Influencer",
    description: "Refer 10 friends",
    icon: "⭐",
    target: 10,
    type: "referrals",
    xpReward: 200,
    coinReward: 100,
    category: "advanced",
    prerequisites: ["referral_1"],
  },
];

/**
 * Helper function to get achievement by ID
 */
export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/**
 * Helper function to get achievements by type
 */
export function getAchievementsByType(
  type: Achievement["type"],
): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.type === type);
}

/**
 * Helper function to get achievements by category
 */
export function getAchievementsByCategory(
  category: Achievement["category"],
): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.category === category);
}
