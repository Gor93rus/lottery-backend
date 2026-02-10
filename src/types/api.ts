/**
 * Common API Types
 * Shared type definitions for API requests and responses
 */

// Common API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Lottery types
export interface Lottery {
  id: string;
  slug: string;
  name: string;
  description?: string;
  ticketPrice: number;
  ticketPriceUsdt?: number;
  jackpot: number;
  active: boolean;
  featured?: boolean;
  numbersCount: number;
  numbersMax: number;
  prizeStructure: Record<string, number | string>;
}

// Draw types
export interface Draw {
  id: string;
  lotteryId: string;
  drawNumber: number;
  status: "scheduled" | "open" | "closed" | "executed";
  scheduledAt: Date;
  executedAt?: Date;
  winningNumbers?: number[];
  prizePool: number;
  totalTickets: number;
  totalWinners?: number;
  totalPaid?: number;
}

// Ticket types
export interface Ticket {
  id: string;
  userId: string;
  lotteryId: string;
  drawId?: string;
  numbers: number[];
  status: "active" | "won" | "lost" | "pending";
  price: number;
  prizeAmount?: number;
  prizeClaimed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// User types
export interface User {
  id: string;
  telegramId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  level: number;
  experience: number;
  streak: number;
  createdAt: Date;
  lastActiveAt?: Date;
}

// Admin types
export interface AdminUser {
  id: string;
  username: string;
  email?: string;
  role: "admin" | "moderator";
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
}

// Financial types
export interface FinancialTransaction {
  id: string;
  lotteryId?: string;
  drawId?: string;
  type: "ticket_sale" | "prize_payout" | "jackpot_rollover" | "fee_collection";
  amount: number;
  currency: "TON" | "USDT";
  description?: string;
  createdAt: Date;
}

// Notification types
export interface Notification {
  id: string;
  userId: string;
  type: "draw_result" | "prize_won" | "jackpot_update" | "system";
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

// Request types for specific endpoints
export interface DrawResultRequest {
  lotteryId: string;
  drawNumber?: number;
  includeTickets?: boolean;
}

export interface FundOperationRequest {
  lotteryId: string;
  currency: string;
  operation: "add" | "deduct" | "transfer";
  amount: number;
  description?: string;
}

export interface LotteryAdminRequest {
  name?: string;
  slug?: string;
  description?: string;
  ticketPrice?: number;
  ticketPriceUsdt?: number;
  active?: boolean;
  featured?: boolean;
  numbersCount?: number;
  numbersMax?: number;
  prizeStructure?: Record<string, number | string>;
}

export interface NotificationAdminRequest {
  userId?: string;
  type: "draw_result" | "prize_won" | "jackpot_update" | "system";
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface PayoutAdminRequest {
  ticketId: string;
  amount: number;
  currency: "TON" | "USDT";
  status?: "pending" | "processing" | "completed" | "failed";
}

export interface TicketAdminRequest {
  userId?: string;
  lotteryId?: string;
  drawId?: string;
  status?: "active" | "won" | "lost" | "pending";
}

export interface UserAdminRequest {
  username?: string;
  telegramId?: string;
  level?: number;
  experience?: number;
  isActive?: boolean;
}

// Response data types
export interface DrawCurrentResponse {
  draw: Draw & {
    lottery: Lottery;
  };
  timeUntilDraw?: number;
}

export interface DrawResultsResponse {
  draws: (Draw & {
    lottery: Lottery;
    winners?: {
      matchCount: number;
      count: number;
      totalPrize: number;
    }[];
  })[];
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface LotteryListResponse {
  lotteries: Lottery[];
}

export interface MyTicketsResponse {
  tickets: (Ticket & {
    lottery: Lottery;
    draw?: Draw;
  })[];
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface UserNotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

export interface UserProfileResponse {
  user: User & {
    stats?: {
      totalTickets: number;
      totalWins: number;
      totalPrizes: number;
      currentStreak: number;
    };
  };
}

export interface UserStatsResponse {
  stats: {
    totalTickets: number;
    totalWins: number;
    totalPrizes: number;
    winRate: number;
    level: number;
    experience: number;
    streak: number;
    achievements?: {
      id: string;
      name: string;
      description: string;
      unlockedAt: Date;
    }[];
  };
}

// Service data types
export interface AchievementData {
  userId: string;
  achievementType: string;
  progress?: number;
  unlocked?: boolean;
}

export interface DrawExecutionData {
  drawId: string;
  lotteryId: string;
  winningNumbers: number[];
  prizePool: number;
}

export interface DrawConfigData {
  lotteryId: string;
  scheduledAt: Date;
  prizePool?: number;
  autoExecute?: boolean;
}

export interface JackpotData {
  lotteryId: string;
  currentJackpot: number;
  rolloverAmount?: number;
  jackpotWon?: boolean;
}

export interface PrizeData {
  ticketId: string;
  drawId: string;
  matchCount: number;
  prizeAmount: number;
  currency: "TON" | "USDT";
}

export interface LeaderboardData {
  userId: string;
  score: number;
  rank?: number;
  timeframe?: "daily" | "weekly" | "monthly" | "alltime";
}

export interface PayoutData {
  ticketId: string;
  userId: string;
  amount: number;
  currency: "TON" | "USDT";
  status: "pending" | "processing" | "completed" | "failed";
  transactionHash?: string;
}

export interface QuestData {
  userId: string;
  questType: string;
  progress: number;
  completed?: boolean;
  reward?: number;
}

// Auth middleware types
export interface AdminRequest {
  user?: AdminUser;
  adminId?: string;
  isAdmin?: boolean;
}

export interface FlexibleAuthData {
  userId: string;
  authMethod: "telegram" | "wallet" | "jwt";
  telegramId?: string;
  walletAddress?: string;
}

export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

// Library/Config types
export interface SentryConfigData {
  dsn?: string;
  environment?: string;
  tracesSampleRate?: number;
  enabled?: boolean;
}

export interface TonApiResponseData {
  success: boolean;
  result?: unknown;
  error?: string;
  transactions?: unknown[];
}

export interface ServerConfigData {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}

// Gamification types
export interface CheckinData {
  userId: string;
  date: Date;
  streak: number;
  reward: number;
}

export interface QuestProgressData {
  userId: string;
  questId: string;
  progress: number;
  total: number;
  completed: boolean;
}

export interface ReferralData {
  userId: string;
  referrerId?: string;
  referralCode: string;
  referralCount: number;
  rewards: number;
}

export interface RewardData {
  userId: string;
  rewardType: string;
  amount: number;
  description?: string;
  claimed?: boolean;
}

// TON-related types
export interface DepositData {
  userId: string;
  amount: number;
  currency: "TON" | "USDT";
  transactionHash: string;
  walletAddress: string;
  status: "pending" | "confirmed" | "failed";
}

export interface TransactionData {
  hash: string;
  from: string;
  to: string;
  amount: number;
  currency: "TON" | "USDT";
  timestamp: Date;
  status: "pending" | "confirmed" | "failed";
}
