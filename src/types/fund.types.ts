/**
 * Fund Management Types
 * Types for lottery fund operations and calculations
 */

export interface FundBalances {
  totalCollected: number;
  prizePool: number;
  jackpotPool: number;
  payoutPool: number;
  platformPool: number;
  reservePool: number;
  totalPaidOut: number;
  totalToReserve: number;
  totalToJackpot: number;
}

export interface FundDistribution {
  prizePool: number;
  jackpotPool: number;
  payoutPool: number;
  platformPool: number;
  reservePool: number;
  income: number;
}

export interface PayoutCalculation {
  drawId: string;
  lotteryId: string;
  currency: string;
  totalPaidOut: number;
  jackpotWon: boolean;
  jackpotRolledOver: number;
  toReserve: number;
  payouts: {
    matchCount: number;
    count: number;
    totalAmount: number;
    perWinner: number;
  }[];
}

export interface FundTransactionInput {
  lotteryId: string;
  currency: string;
  drawId?: string;
  type: FundTransactionType;
  amount: number;
  fromPool?: PoolType;
  toPool?: PoolType;
  reference?: string;
  note?: string;
}

export type FundTransactionType =
  | "ticket_sale"
  | "prize_payout"
  | "jackpot_rollover"
  | "to_reserve"
  | "from_reserve"
  | "to_platform"
  | "manual_adjustment";

export type PoolType =
  | "prizePool"
  | "jackpotPool"
  | "payoutPool"
  | "reservePool"
  | "platformPool";

export interface PayoutConfigValues {
  platformShare: number;
  prizeShare: number;
  reserveShare: number;
  incomeShare: number;
  jackpotShare: number;
  payoutShare: number;
  match5Share: number;
  match4Share: number;
  match3Share: number;
  match2Share: number;
  match1Fixed: number;
}

export interface WinnerCounts {
  match5: number;
  match4: number;
  match3: number;
  match2: number;
  match1: number;
}
