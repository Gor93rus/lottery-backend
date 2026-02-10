import { prisma } from "../lib/prisma.js";
import { tonWalletService } from "./tonWalletService.js";
import { sanitizeId } from "../lib/utils/sanitize.js";

interface PayoutResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

class PayoutService {
  private readonly GAS_FEE_TON = 0.05;
  private readonly GAS_FEE_USDT = 0.1; // USDT transfers cost more
  private readonly MAX_RETRIES = 3;

  /**
   * Process all pending payouts
   * Called every minute by scheduler
   */
  async processPendingPayouts(): Promise<void> {
    console.log("Processing pending payouts...");

    const pendingPayouts = await prisma.payout.findMany({
      where: {
        status: "pending",
        retryCount: { lt: this.MAX_RETRIES },
      },
      include: {
        draw: {
          include: {
            lottery: true,
          },
        },
        user: true,
      },
      orderBy: { createdAt: "asc" },
      take: 10, // Process 10 at a time
    });

    if (pendingPayouts.length === 0) {
      console.log("No pending payouts to process");
      return;
    }

    console.log("Found pending payouts", { count: pendingPayouts.length });

    for (const payout of pendingPayouts) {
      await this.processSinglePayout(payout);
    }
  }

  /**
   * Process a single payout
   */
  async processSinglePayout(payout: {
    id: string;
    amount: number;
    currency: string;
    recipientAddress: string;
    walletAddress?: string | null;
    retryCount: number;
    draw?: {
      lotteryId: string;
      lottery?: Record<string, unknown>;
    } | null;
    user?: Record<string, unknown>;
  }): Promise<PayoutResult> {
    const { id, amount, currency, recipientAddress, walletAddress, draw } =
      payout;
    const lotteryId = draw?.lotteryId;
    const address = walletAddress || recipientAddress;

    console.log("Processing payout", {
      payoutId: sanitizeId(id),
      amount,
      currency,
      walletAddress: address.substring(0, 10) + "...",
    });

    try {
      // 1. Check wallet balance
      // Note: Only check against payout amount, not gas fee
      // Gas fee is deducted from reserve fund separately
      const walletBalance = await tonWalletService.getBalance();

      if (walletBalance < amount) {
        console.log("Insufficient wallet balance", {
          walletBalance,
          needed: amount,
        });
        return { success: false, error: "Insufficient wallet balance" };
      }

      // 2. Check and deduct from reserve fund (for gas)
      const gasFee = currency === "TON" ? this.GAS_FEE_TON : this.GAS_FEE_USDT;
      if (lotteryId) {
        const reserveDeducted = await this.deductGasFromReserve(
          lotteryId,
          currency,
          gasFee,
        );
        if (!reserveDeducted) {
          console.log("Insufficient reserve fund for gas", {
            lotteryId: sanitizeId(lotteryId),
            gasFee,
          });
          // Alert admin but continue - gas will come from general wallet
        }
      }

      // 3. Send payment
      let txHash: string;
      if (currency === "TON") {
        txHash = await tonWalletService.sendTon(address, amount);
      } else {
        txHash = await tonWalletService.sendUSDT(address, amount);
      }

      // 4. Update payout status
      await prisma.payout.update({
        where: { id },
        data: {
          status: "completed",
          txHash,
          processedAt: new Date(),
        },
      });

      // 5. Log transaction
      if (lotteryId) {
        await this.logTransaction(lotteryId, currency, amount, gasFee, txHash);
      }

      console.log("Payout completed", { payoutId: sanitizeId(id), txHash });
      return { success: true, txHash };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Payout failed", {
        payoutId: sanitizeId(id),
        error: errorMessage,
      });

      // Increment retry count
      await prisma.payout.update({
        where: { id },
        data: {
          retryCount: { increment: 1 },
          lastError: errorMessage,
          status:
            payout.retryCount + 1 >= this.MAX_RETRIES ? "failed" : "pending",
        },
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Deduct gas fee from reserve fund
   */
  private async deductGasFromReserve(
    lotteryId: string,
    currency: string,
    gasFee: number,
  ): Promise<boolean> {
    const fund = await prisma.lotteryFund.findFirst({
      where: { lotteryId, currency },
    });

    if (!fund || fund.reservePool < gasFee) {
      return false;
    }

    await prisma.lotteryFund.update({
      where: { id: fund.id },
      data: {
        reservePool: { decrement: gasFee },
      },
    });

    // Log the deduction
    await prisma.fundTransaction.create({
      data: {
        lotteryId,
        currency,
        type: "gas_fee",
        amount: -gasFee,
        fromPool: "reservePool",
        note: "Gas fee for payout transaction",
        reservePoolAfter: fund.reservePool - gasFee,
      },
    });

    return true;
  }

  /**
   * Log payout transaction
   */
  private async logTransaction(
    lotteryId: string,
    currency: string,
    amount: number,
    gasFee: number,
    txHash: string,
  ): Promise<void> {
    const fund = await prisma.lotteryFund.findFirst({
      where: { lotteryId, currency },
    });

    if (fund) {
      await prisma.fundTransaction.create({
        data: {
          lotteryId,
          currency,
          type: "prize_payout",
          amount: -amount,
          fromPool: "prizePool",
          note: `Payout to winner (tx: ${txHash})`,
          reference: txHash,
          prizePoolAfter: fund.prizePool - amount,
        },
      });
    }
  }

  /**
   * Retry a failed payout (admin action)
   */
  async retryPayout(payoutId: string): Promise<PayoutResult> {
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        draw: { include: { lottery: true } },
        user: true,
      },
    });

    if (!payout) {
      return { success: false, error: "Payout not found" };
    }

    // Reset retry count and status
    await prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: "pending",
        retryCount: 0,
        lastError: null,
      },
    });

    return this.processSinglePayout(payout);
  }

  /**
   * Get payout statistics
   */
  async getPayoutStats(lotteryId?: string): Promise<{
    pending: number;
    completed: number;
    failed: number;
    totalPaid: number;
  }> {
    const where = lotteryId ? { draw: { lotteryId } } : {};

    const [pending, completed, failed, total] = await Promise.all([
      prisma.payout.count({ where: { ...where, status: "pending" } }),
      prisma.payout.count({ where: { ...where, status: "completed" } }),
      prisma.payout.count({ where: { ...where, status: "failed" } }),
      prisma.payout.aggregate({
        where: { ...where, status: "completed" },
        _sum: { amount: true },
      }),
    ]);

    return {
      pending,
      completed,
      failed,
      totalPaid: total._sum.amount || 0,
    };
  }
}

export const payoutService = new PayoutService();
