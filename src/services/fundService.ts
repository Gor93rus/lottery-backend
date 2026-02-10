/**
 * Fund Service
 * Manages lottery fund operations including ticket sales, payouts, and fund movements
 */

import { PrismaClient, FundTransaction } from "@prisma/client";
import {
  FundBalances,
  FundTransactionInput,
  PayoutCalculation,
  WinnerCounts,
} from "../types/fund.types.js";
import {
  calculateFundDistribution,
  calculatePayouts,
  canAffordMatch1Payouts,
  calculateTotalPayout,
} from "../utils/fundCalculations.js";

const prisma = new PrismaClient();

export class FundService {
  /**
   * Process ticket sale - distribute funds to pools
   */
  async processTicketSale(
    lotteryId: string,
    currency: string,
    amount: number,
    reference?: string,
  ): Promise<void> {
    // Get or create fund
    let fund = await prisma.lotteryFund.findUnique({
      where: {
        lotteryId_currency: {
          lotteryId,
          currency,
        },
      },
    });

    if (!fund) {
      fund = await prisma.lotteryFund.create({
        data: {
          lotteryId,
          currency,
        },
      });
    }

    // Get payout config
    const config = await prisma.lotteryPayoutConfig.findUnique({
      where: { lotteryId },
    });

    if (!config) {
      throw new Error(`No payout config found for lottery ${lotteryId}`);
    }

    // Calculate distribution
    const distribution = calculateFundDistribution(amount, config);

    // Update fund balances and get the updated state
    const updatedFund = await prisma.lotteryFund.update({
      where: {
        lotteryId_currency: {
          lotteryId,
          currency,
        },
      },
      data: {
        totalCollected: { increment: amount },
        prizePool: { increment: distribution.prizePool },
        jackpotPool: { increment: distribution.jackpotPool },
        payoutPool: { increment: distribution.payoutPool },
        platformPool: { increment: distribution.platformPool },
        reservePool: { increment: distribution.reservePool },
      },
    });

    // Log transaction with updated balances
    await this.logTransaction(
      {
        lotteryId,
        currency,
        type: "ticket_sale",
        amount,
        toPool: "prizePool",
        reference,
        note: `Ticket sale: ${amount} ${currency}`,
      },
      updatedFund,
    );
  }

  /**
   * Calculate payouts for a draw
   */
  async calculateDrawPayouts(
    drawId: string,
    lotteryId: string,
    currency: string,
    winnerCounts: WinnerCounts,
  ): Promise<PayoutCalculation> {
    // Get fund
    const fund = await prisma.lotteryFund.findUnique({
      where: {
        lotteryId_currency: {
          lotteryId,
          currency,
        },
      },
    });

    if (!fund) {
      throw new Error(
        `No fund found for lottery ${lotteryId} and currency ${currency}`,
      );
    }

    // Get config
    const config = await prisma.lotteryPayoutConfig.findUnique({
      where: { lotteryId },
    });

    if (!config) {
      throw new Error(`No payout config found for lottery ${lotteryId}`);
    }

    // Check if we can afford match1 payouts from reserve
    if (
      !canAffordMatch1Payouts(
        fund.reservePool,
        winnerCounts.match1,
        config.match1Fixed,
      )
    ) {
      throw new Error(
        `Insufficient reserve pool for match1 payouts. Need ${
          winnerCounts.match1 * config.match1Fixed
        }, have ${fund.reservePool}`,
      );
    }

    // Calculate payouts
    const result = calculatePayouts(
      fund.payoutPool,
      fund.jackpotPool,
      fund.reservePool,
      winnerCounts,
      config,
    );

    // Build calculation result
    const calculation: PayoutCalculation = {
      drawId,
      lotteryId,
      currency,
      totalPaidOut: calculateTotalPayout(result.payouts),
      jackpotWon: result.jackpotWon,
      jackpotRolledOver: result.jackpotRolledOver,
      toReserve: result.toReserve,
      payouts: Object.entries(result.payouts).map(([matchCount, payout]) => ({
        matchCount: parseInt(matchCount),
        count: payout.count,
        totalAmount: payout.totalAmount,
        perWinner: payout.perWinner,
      })),
    };

    return calculation;
  }

  /**
   * Rollover jackpot to next draw
   */
  async rolloverJackpot(
    lotteryId: string,
    currency: string,
    amount: number,
  ): Promise<void> {
    const updatedFund = await prisma.lotteryFund.update({
      where: {
        lotteryId_currency: {
          lotteryId,
          currency,
        },
      },
      data: {
        totalToJackpot: { increment: amount },
      },
    });

    await this.logTransaction(
      {
        lotteryId,
        currency,
        type: "jackpot_rollover",
        amount,
        fromPool: "jackpotPool",
        toPool: "jackpotPool",
        note: `Jackpot rollover: ${amount} ${currency}`,
      },
      updatedFund,
    );
  }

  /**
   * Transfer unclaimed funds to reserve
   */
  async transferToReserve(
    lotteryId: string,
    currency: string,
    amount: number,
    reason: string,
  ): Promise<void> {
    const updatedFund = await prisma.lotteryFund.update({
      where: {
        lotteryId_currency: {
          lotteryId,
          currency,
        },
      },
      data: {
        payoutPool: { decrement: amount },
        reservePool: { increment: amount },
        totalToReserve: { increment: amount },
      },
    });

    await this.logTransaction(
      {
        lotteryId,
        currency,
        type: "to_reserve",
        amount,
        fromPool: "payoutPool",
        toPool: "reservePool",
        note: reason,
      },
      updatedFund,
    );
  }

  /**
   * Process payout - deduct from appropriate pool
   */
  async processPayout(
    lotteryId: string,
    currency: string,
    amount: number,
    matchCount: number,
    reference?: string,
  ): Promise<void> {
    const fund = await prisma.lotteryFund.findUnique({
      where: {
        lotteryId_currency: {
          lotteryId,
          currency,
        },
      },
    });

    if (!fund) {
      throw new Error(
        `No fund found for lottery ${lotteryId} and currency ${currency}`,
      );
    }

    let fromPool: "jackpotPool" | "payoutPool" | "reservePool";
    const updateData: {
      totalPaidOut: { increment: number };
      jackpotPool?: { decrement: number };
      payoutPool?: { decrement: number };
      reservePool?: { decrement: number };
    } = {
      totalPaidOut: { increment: amount },
    };

    if (matchCount === 5) {
      // Jackpot from jackpot pool
      if (fund.jackpotPool < amount) {
        throw new Error(
          `Insufficient jackpot pool. Need ${amount}, have ${fund.jackpotPool}`,
        );
      }
      fromPool = "jackpotPool";
      updateData.jackpotPool = { decrement: amount };
    } else if (matchCount === 1) {
      // Fixed payout from reserve
      if (fund.reservePool < amount) {
        throw new Error(
          `Insufficient reserve pool. Need ${amount}, have ${fund.reservePool}`,
        );
      }
      fromPool = "reservePool";
      updateData.reservePool = { decrement: amount };
    } else {
      // Dynamic payouts from payout pool
      if (fund.payoutPool < amount) {
        throw new Error(
          `Insufficient payout pool. Need ${amount}, have ${fund.payoutPool}`,
        );
      }
      fromPool = "payoutPool";
      updateData.payoutPool = { decrement: amount };
    }

    const updatedFund = await prisma.lotteryFund.update({
      where: {
        lotteryId_currency: {
          lotteryId,
          currency,
        },
      },
      data: updateData,
    });

    await this.logTransaction(
      {
        lotteryId,
        currency,
        type: "prize_payout",
        amount,
        fromPool,
        reference,
        note: `Payout for ${matchCount} matches: ${amount} ${currency}`,
      },
      updatedFund,
    );
  }

  /**
   * Get current fund balances
   */
  async getFundBalances(
    lotteryId: string,
    currency: string,
  ): Promise<FundBalances | null> {
    const fund = await prisma.lotteryFund.findUnique({
      where: {
        lotteryId_currency: {
          lotteryId,
          currency,
        },
      },
    });

    if (!fund) {
      return null;
    }

    return {
      totalCollected: fund.totalCollected,
      prizePool: fund.prizePool,
      jackpotPool: fund.jackpotPool,
      payoutPool: fund.payoutPool,
      platformPool: fund.platformPool,
      reservePool: fund.reservePool,
      totalPaidOut: fund.totalPaidOut,
      totalToReserve: fund.totalToReserve,
      totalToJackpot: fund.totalToJackpot,
    };
  }

  /**
   * Check if payout is affordable from prize-related pools
   * Note: Platform pool is not included as it's reserved for platform income
   */
  async canAffordPayout(
    lotteryId: string,
    currency: string,
    amount: number,
  ): Promise<boolean> {
    const fund = await prisma.lotteryFund.findUnique({
      where: {
        lotteryId_currency: {
          lotteryId,
          currency,
        },
      },
    });

    if (!fund) {
      return false;
    }

    // Check available funds in prize-related pools only
    // Platform pool is reserved for platform income
    const totalAvailable =
      fund.jackpotPool + fund.payoutPool + fund.reservePool;

    return totalAvailable >= amount;
  }

  /**
   * Log fund transaction with balance snapshots
   * @param data Transaction details
   * @param fund Current fund state (after the transaction)
   */
  async logTransaction(
    data: FundTransactionInput,
    fund?: {
      prizePool: number;
      jackpotPool: number;
      payoutPool: number;
      reservePool: number;
      platformPool: number;
    },
  ): Promise<FundTransaction> {
    // If fund state not provided, fetch it (for legacy compatibility)
    if (!fund) {
      const currentFund = await prisma.lotteryFund.findUnique({
        where: {
          lotteryId_currency: {
            lotteryId: data.lotteryId,
            currency: data.currency,
          },
        },
      });
      fund = currentFund || undefined;
    }

    return await prisma.fundTransaction.create({
      data: {
        lotteryId: data.lotteryId,
        currency: data.currency,
        drawId: data.drawId,
        type: data.type,
        amount: data.amount,
        fromPool: data.fromPool,
        toPool: data.toPool,
        prizePoolAfter: fund?.prizePool,
        jackpotPoolAfter: fund?.jackpotPool,
        payoutPoolAfter: fund?.payoutPool,
        reservePoolAfter: fund?.reservePool,
        platformPoolAfter: fund?.platformPool,
        reference: data.reference,
        note: data.note,
      },
    });
  }
}

export const fundService = new FundService();
