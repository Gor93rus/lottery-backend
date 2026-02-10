/**
 * Winner Calculator Service
 * Handles winner counting and payout calculation for lottery draws
 */

import { prisma } from "../lib/prisma.js";
import { sanitizeId } from "../lib/utils/sanitize.js";

interface WinnerStats {
  winners5: number;
  winners4: number;
  winners3: number;
  winners2: number;
  winners1: number;
}

interface PayoutAmounts {
  jackpotAmount: number | null;
  payout4Amount: number | null;
  payout3Amount: number | null;
  payout2Amount: number | null;
  payout1Amount: number;
}

interface WinnerCalculationResult {
  winnerStats: WinnerStats;
  payoutAmounts: PayoutAmounts;
  totalPaidOut: number;
  toJackpot: number;
  toReserve: number;
}

/**
 * Count how many numbers matched between ticket and winning numbers
 */
export function countMatches(
  ticketNumbers: number[],
  winningNumbers: number[],
): number {
  return ticketNumbers.filter((num) => winningNumbers.includes(num)).length;
}

/**
 * Calculate winner statistics for a draw
 * Counts how many winners for each match level (1-5)
 */
export async function calculateWinnerStats(
  drawId: string,
  winningNumbers: number[],
): Promise<WinnerStats> {
  try {
    // Get all tickets for this draw
    const tickets = await prisma.ticket.findMany({
      where: { drawId },
      select: { id: true, numbers: true },
    });

    const stats: WinnerStats = {
      winners5: 0,
      winners4: 0,
      winners3: 0,
      winners2: 0,
      winners1: 0,
    };

    // Count winners for each match level
    for (const ticket of tickets) {
      const matches = countMatches(ticket.numbers, winningNumbers);

      if (matches === 5) stats.winners5++;
      else if (matches === 4) stats.winners4++;
      else if (matches === 3) stats.winners3++;
      else if (matches === 2) stats.winners2++;
      else if (matches === 1) stats.winners1++;
    }

    return stats;
  } catch (error) {
    console.error("Error calculating winner stats", {
      drawId: sanitizeId(drawId),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("Failed to calculate winner stats");
  }
}

/**
 * Calculate payout amounts based on winner counts and prize pool
 * Implements the financial model:
 * - 5/5: Jackpot pool (15% of prize pool, accumulates)
 * - 4/5: 60% of payout pool (85% of prize pool)
 * - 3/5: 30% of payout pool
 * - 2/5: 10% of payout pool
 * - 1/5: Fixed 0.1 TON/USDT from reserve
 */
export async function calculatePayoutAmounts(
  lotteryId: string,
  currency: string,
  winnerStats: WinnerStats,
): Promise<PayoutAmounts & { toJackpot: number; toReserve: number }> {
  try {
    // Get lottery fund
    const fund = await prisma.lotteryFund.findUnique({
      where: {
        lotteryId_currency: {
          lotteryId,
          currency,
        },
      },
    });

    if (!fund) {
      throw new Error("Lottery fund not found");
    }

    // Get payout configuration
    const config = await prisma.lotteryPayoutConfig.findUnique({
      where: { lotteryId },
    });

    if (!config) {
      throw new Error("Payout configuration not found");
    }

    const payoutAmounts: PayoutAmounts = {
      jackpotAmount: null,
      payout4Amount: null,
      payout3Amount: null,
      payout2Amount: null,
      payout1Amount: config.match1Fixed,
    };

    // toJackpot: Additional funds to add to jackpot from unclaimed prizes
    // Note: Jackpot accumulation from ticket sales (15% of prize pool) happens
    // during ticket purchase, not here. This tracks only unclaimed prize redistribution.
    const toJackpot = 0;

    // toReserve: Unclaimed prizes from match levels with no winners
    let toReserve = 0;

    // Calculate 5/5 (Jackpot)
    if (winnerStats.winners5 > 0) {
      // Split jackpot among winners
      payoutAmounts.jackpotAmount = fund.jackpotPool / winnerStats.winners5;
    } else {
      // No jackpot winner - jackpot rolls over (stays in jackpotPool)
      payoutAmounts.jackpotAmount = 0;
    }

    // Available payout pool for 4/5, 3/5, 2/5
    const availablePayoutPool = fund.payoutPool;

    // Calculate 4/5 (60% of payout pool)
    if (winnerStats.winners4 > 0) {
      const total4 = availablePayoutPool * config.match4Share;
      payoutAmounts.payout4Amount = total4 / winnerStats.winners4;
    } else {
      // No 4/5 winners - send to reserve
      toReserve += availablePayoutPool * config.match4Share;
      payoutAmounts.payout4Amount = 0;
    }

    // Calculate 3/5 (30% of payout pool)
    if (winnerStats.winners3 > 0) {
      const total3 = availablePayoutPool * config.match3Share;
      payoutAmounts.payout3Amount = total3 / winnerStats.winners3;
    } else {
      // No 3/5 winners - send to reserve
      toReserve += availablePayoutPool * config.match3Share;
      payoutAmounts.payout3Amount = 0;
    }

    // Calculate 2/5 (10% of payout pool)
    if (winnerStats.winners2 > 0) {
      const total2 = availablePayoutPool * config.match2Share;
      payoutAmounts.payout2Amount = total2 / winnerStats.winners2;
    } else {
      // No 2/5 winners - send to reserve
      toReserve += availablePayoutPool * config.match2Share;
      payoutAmounts.payout2Amount = 0;
    }

    return {
      ...payoutAmounts,
      toJackpot,
      toReserve,
    };
  } catch (error) {
    console.error("Error calculating payout amounts", {
      lotteryId: sanitizeId(lotteryId),
      currency,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("Failed to calculate payout amounts");
  }
}

/**
 * Calculate complete winner information and payouts for a draw
 */
export async function calculateWinnersAndPayouts(
  drawId: string,
  lotteryId: string,
  currency: string,
  winningNumbers: number[],
): Promise<WinnerCalculationResult> {
  try {
    // Calculate winner statistics
    const winnerStats = await calculateWinnerStats(drawId, winningNumbers);

    // Calculate payout amounts
    const payoutInfo = await calculatePayoutAmounts(
      lotteryId,
      currency,
      winnerStats,
    );

    // Calculate total paid out
    const totalPaidOut =
      (payoutInfo.jackpotAmount || 0) * winnerStats.winners5 +
      (payoutInfo.payout4Amount || 0) * winnerStats.winners4 +
      (payoutInfo.payout3Amount || 0) * winnerStats.winners3 +
      (payoutInfo.payout2Amount || 0) * winnerStats.winners2 +
      payoutInfo.payout1Amount * winnerStats.winners1;

    return {
      winnerStats,
      payoutAmounts: {
        jackpotAmount: payoutInfo.jackpotAmount,
        payout4Amount: payoutInfo.payout4Amount,
        payout3Amount: payoutInfo.payout3Amount,
        payout2Amount: payoutInfo.payout2Amount,
        payout1Amount: payoutInfo.payout1Amount,
      },
      totalPaidOut,
      toJackpot: payoutInfo.toJackpot,
      toReserve: payoutInfo.toReserve,
    };
  } catch (error) {
    console.error("Error calculating winners and payouts", {
      drawId: sanitizeId(drawId),
      lotteryId: sanitizeId(lotteryId),
      currency,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("Failed to calculate winners and payouts");
  }
}

/**
 * Update ticket statuses based on draw results
 * Sets matchedNumbers, prizeAmount, and status for each ticket
 */
export async function updateTicketResults(
  drawId: string,
  winningNumbers: number[],
  payoutAmounts: PayoutAmounts,
): Promise<void> {
  try {
    // Get all tickets for this draw
    const tickets = await prisma.ticket.findMany({
      where: { drawId },
      select: { id: true, numbers: true },
    });

    // Prepare updates
    const updates = tickets.map((ticket) => {
      const matches = countMatches(ticket.numbers, winningNumbers);
      let prizeAmount = 0;
      let status = "lost";

      if (matches === 5 && payoutAmounts.jackpotAmount) {
        prizeAmount = payoutAmounts.jackpotAmount;
        status = "won";
      } else if (matches === 4 && payoutAmounts.payout4Amount) {
        prizeAmount = payoutAmounts.payout4Amount;
        status = "won";
      } else if (matches === 3 && payoutAmounts.payout3Amount) {
        prizeAmount = payoutAmounts.payout3Amount;
        status = "won";
      } else if (matches === 2 && payoutAmounts.payout2Amount) {
        prizeAmount = payoutAmounts.payout2Amount;
        status = "won";
      } else if (matches === 1) {
        prizeAmount = payoutAmounts.payout1Amount;
        status = "won";
      }

      return {
        id: ticket.id,
        matchedNumbers: matches,
        prizeAmount,
        status,
      };
    });

    // Update all tickets
    await prisma.$transaction(
      updates.map((update) =>
        prisma.ticket.update({
          where: { id: update.id },
          data: {
            matchedNumbers: update.matchedNumbers,
            prizeAmount: update.prizeAmount,
            status: update.status,
          },
        }),
      ),
    );

    console.log("Updated ticket results", {
      drawId: sanitizeId(drawId),
      ticketCount: tickets.length,
      winnersCount: updates.filter((u) => u.status === "won").length,
    });
  } catch (error) {
    console.error("Error updating ticket results", {
      drawId: sanitizeId(drawId),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("Failed to update ticket results");
  }
}
