/**
 * Fund Calculations
 * Implements the exact financial model for lottery fund distribution
 */

import {
  FundDistribution,
  PayoutConfigValues,
  WinnerCounts,
} from "../types/fund.types.js";

/**
 * Calculate fund distribution from ticket sale
 * According to the financial model:
 * - 50% → Prize Pool
 *   - 15% of Prize → Jackpot (5/5)
 *   - 85% of Prize → Payout Pool (for 2/5, 3/5, 4/5 winners)
 * - 50% → Platform
 *   - 10% of Platform → Reserve Pool
 *   - 90% of Platform → Income
 */
export function calculateFundDistribution(
  ticketAmount: number,
  config: PayoutConfigValues,
): FundDistribution {
  // Main split
  const prizePool = ticketAmount * config.prizeShare;
  const platformPool = ticketAmount * config.platformShare;

  // Prize pool split
  const jackpotPool = prizePool * config.jackpotShare;
  const payoutPool = prizePool * config.payoutShare;

  // Platform split
  const reservePool = platformPool * config.reserveShare;
  const income = platformPool * config.incomeShare;

  return {
    prizePool,
    jackpotPool,
    payoutPool,
    platformPool,
    reservePool,
    income,
  };
}

/**
 * Calculate payout amounts for winners
 * - Jackpot (5/5): All jackpot pool if there's a winner, otherwise rollover
 * - 4/5: 60% of payout pool split equally
 * - 3/5: 30% of payout pool split equally
 * - 2/5: 10% of payout pool split equally
 * - 1/5: Fixed 0.1 TON/USDT from reserve pool
 * - Unclaimed categories: go to reserve pool
 */
export function calculatePayouts(
  payoutPool: number,
  jackpotPool: number,
  reservePool: number,
  winnerCounts: WinnerCounts,
  config: PayoutConfigValues,
): {
  payouts: Record<
    string,
    { count: number; totalAmount: number; perWinner: number }
  >;
  jackpotWon: boolean;
  jackpotRolledOver: number;
  toReserve: number;
  usedFromReserve: number;
} {
  const payouts: Record<
    string,
    { count: number; totalAmount: number; perWinner: number }
  > = {};
  let toReserve = 0;
  let usedFromReserve = 0;

  // Jackpot (5/5)
  const jackpotWon = winnerCounts.match5 > 0;
  const jackpotRolledOver = jackpotWon ? 0 : jackpotPool;

  if (jackpotWon) {
    payouts["5"] = {
      count: winnerCounts.match5,
      totalAmount: jackpotPool,
      perWinner: jackpotPool / winnerCounts.match5,
    };
  }

  // 4/5 winners
  const match4Pool = payoutPool * config.match4Share;
  if (winnerCounts.match4 > 0) {
    payouts["4"] = {
      count: winnerCounts.match4,
      totalAmount: match4Pool,
      perWinner: match4Pool / winnerCounts.match4,
    };
  } else {
    toReserve += match4Pool;
  }

  // 3/5 winners
  const match3Pool = payoutPool * config.match3Share;
  if (winnerCounts.match3 > 0) {
    payouts["3"] = {
      count: winnerCounts.match3,
      totalAmount: match3Pool,
      perWinner: match3Pool / winnerCounts.match3,
    };
  } else {
    toReserve += match3Pool;
  }

  // 2/5 winners
  const match2Pool = payoutPool * config.match2Share;
  if (winnerCounts.match2 > 0) {
    payouts["2"] = {
      count: winnerCounts.match2,
      totalAmount: match2Pool,
      perWinner: match2Pool / winnerCounts.match2,
    };
  } else {
    toReserve += match2Pool;
  }

  // 1/5 winners - fixed amount from reserve
  if (winnerCounts.match1 > 0) {
    const fixedAmount = config.match1Fixed;
    const totalForMatch1 = fixedAmount * winnerCounts.match1;
    payouts["1"] = {
      count: winnerCounts.match1,
      totalAmount: totalForMatch1,
      perWinner: fixedAmount,
    };
    usedFromReserve = totalForMatch1;
  }

  return {
    payouts,
    jackpotWon,
    jackpotRolledOver,
    toReserve,
    usedFromReserve,
  };
}

/**
 * Validate that reserve pool has enough funds for match1 payouts
 */
export function canAffordMatch1Payouts(
  reservePool: number,
  match1Count: number,
  match1Fixed: number,
): boolean {
  const required = match1Count * match1Fixed;
  return reservePool >= required;
}

/**
 * Calculate total payout amount from payout details
 */
export function calculateTotalPayout(
  payouts: Record<
    string,
    { count: number; totalAmount: number; perWinner: number }
  >,
): number {
  return Object.values(payouts).reduce(
    (sum, payout) => sum + payout.totalAmount,
    0,
  );
}
