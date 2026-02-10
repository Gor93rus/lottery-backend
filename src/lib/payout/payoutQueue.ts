import { prisma } from "../prisma.js";

/**
 * Create a new payout record
 */
export async function createPayout(params: {
  userId: string;
  ticketId?: string;
  drawId?: string;
  amount: number;
  currency: "TON" | "USDT";
  recipientAddress: string;
  totalAmount?: number;
  splitIndex?: number;
  splitTotal?: number;
}): Promise<{
  id: string;
  userId: string;
  ticketId: string | null;
  drawId: string | null;
  amount: number;
  currency: string;
  recipientAddress: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  txHash: string | null;
  totalAmount: number | null;
  splitIndex: number | null;
  splitTotal: number | null;
}> {
  try {
    const payout = await prisma.payout.create({
      data: {
        userId: params.userId,
        ticketId: params.ticketId,
        drawId: params.drawId,
        amount: params.amount,
        currency: params.currency,
        recipientAddress: params.recipientAddress,
        totalAmount: params.totalAmount,
        splitIndex: params.splitIndex,
        splitTotal: params.splitTotal,
        status: "pending",
        attempts: 0,
        maxAttempts: parseInt(process.env.PAYOUT_MAX_ATTEMPTS || "3", 10),
      },
    });

    console.log("✅ Payout created:", payout.id);
    return payout;
  } catch (error) {
    console.error("Failed to create payout:", error);
    throw error;
  }
}

/**
 * Get pending payouts for processing
 */
export async function getPendingPayouts(limit: number = 10): Promise<
  Array<{
    id: string;
    userId: string;
    ticketId: string | null;
    drawId: string | null;
    amount: number;
    currency: string;
    recipientAddress: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
    processedAt: Date | null;
    completedAt: Date | null;
    lastError: string | null;
    txHash: string | null;
    totalAmount: number | null;
    splitIndex: number | null;
    splitTotal: number | null;
    user: {
      id: string;
      telegramId: string | null;
      username: string | null;
      tonWallet: string | null;
    };
    ticket: {
      id: string;
      numbers: number[];
    } | null;
  }>
> {
  try {
    const maxAttempts = parseInt(process.env.PAYOUT_MAX_ATTEMPTS || "3", 10);

    const payouts = await prisma.payout.findMany({
      where: {
        status: "pending",
        attempts: {
          lt: maxAttempts,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            username: true,
            tonWallet: true,
          },
        },
        ticket: {
          select: {
            id: true,
            numbers: true,
          },
        },
      },
    });

    // Filter by maxAttempts from each record
    return payouts.filter((p) => p.attempts < p.maxAttempts);
  } catch (error) {
    console.error("Failed to get pending payouts:", error);
    return [];
  }
}

/**
 * Update payout status to processing
 */
export async function markPayoutAsProcessing(
  payoutId: string,
): Promise<boolean> {
  try {
    await prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: "processing",
        processedAt: new Date(),
        attempts: {
          increment: 1,
        },
      },
    });

    console.log(`📝 Payout ${payoutId} marked as processing`);
    return true;
  } catch (error) {
    console.error("Failed to mark payout as processing:", error);
    return false;
  }
}

/**
 * Mark payout as completed
 */
export async function markPayoutAsCompleted(
  payoutId: string,
  txHash: string,
): Promise<boolean> {
  try {
    await prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: "completed",
        txHash,
        completedAt: new Date(),
        lastError: null,
      },
    });

    console.log(`✅ Payout ${payoutId} completed with tx ${txHash}`);
    return true;
  } catch (error) {
    console.error("Failed to mark payout as completed:", error);
    return false;
  }
}

/**
 * Mark payout as failed
 */
export async function markPayoutAsFailed(
  payoutId: string,
  error: string,
  finalFailure: boolean = false,
): Promise<boolean> {
  try {
    await prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: finalFailure ? "failed" : "pending",
        lastError: error,
      },
    });

    console.log(
      `❌ Payout ${payoutId} ${finalFailure ? "failed permanently" : "failed, will retry"}`,
    );
    return true;
  } catch (error) {
    console.error("Failed to mark payout as failed:", error);
    return false;
  }
}

/**
 * Get total payouts for today
 */
export async function getTodayPayoutTotal(
  currency: "TON" | "USDT",
): Promise<number> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await prisma.payout.aggregate({
      where: {
        currency,
        status: "completed",
        completedAt: {
          gte: today,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount || 0;
  } catch (error) {
    console.error("Failed to get today payout total:", error);
    return 0;
  }
}

/**
 * Check if daily limit would be exceeded
 */
export async function wouldExceedDailyLimit(
  currency: "TON" | "USDT",
  amount: number,
): Promise<boolean> {
  try {
    const todayTotal = await getTodayPayoutTotal(currency);
    const limit =
      currency === "TON"
        ? parseFloat(process.env.PAYOUT_MAX_DAILY_TOTAL_TON || "500")
        : parseFloat(process.env.PAYOUT_MAX_DAILY_TOTAL_USDT || "2500");

    const wouldExceed = todayTotal + amount > limit;

    if (wouldExceed) {
      console.warn(
        `⚠️  Payout would exceed daily limit: ${todayTotal} + ${amount} > ${limit} ${currency}`,
      );
    }

    return wouldExceed;
  } catch (error) {
    console.error("Failed to check daily limit:", error);
    return true; // Fail safe - assume limit would be exceeded
  }
}

/**
 * Split large payout into multiple smaller payouts
 */
export async function splitLargePayout(
  userId: string,
  totalAmount: number,
  currency: "TON" | "USDT",
  recipientAddress: string,
  ticketId?: string,
  drawId?: string,
): Promise<
  Array<{
    id: string;
    userId: string;
    ticketId: string | null;
    drawId: string | null;
    amount: number;
    currency: string;
    recipientAddress: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
    processedAt: Date | null;
    completedAt: Date | null;
    lastError: string | null;
    txHash: string | null;
    totalAmount: number | null;
    splitIndex: number | null;
    splitTotal: number | null;
  }>
> {
  try {
    const maxSingleAmount =
      currency === "TON"
        ? parseFloat(process.env.PAYOUT_MAX_SINGLE_AMOUNT_TON || "50")
        : parseFloat(process.env.PAYOUT_MAX_SINGLE_AMOUNT_USDT || "250");

    const numSplits = Math.ceil(totalAmount / maxSingleAmount);
    const splitAmount = totalAmount / numSplits;

    console.log(
      `📊 Splitting payout: ${totalAmount} ${currency} into ${numSplits} parts of ${splitAmount} each`,
    );

    const payouts = [];
    for (let i = 1; i <= numSplits; i++) {
      const payout = await createPayout({
        userId,
        ticketId,
        drawId,
        amount: splitAmount,
        currency,
        recipientAddress,
        totalAmount,
        splitIndex: i,
        splitTotal: numSplits,
      });
      payouts.push(payout);
    }

    return payouts;
  } catch (error) {
    console.error("Failed to split large payout:", error);
    throw error;
  }
}

/**
 * Queue a payout for processing
 */
export async function queuePayout(params: {
  userId: string;
  ticketId?: string;
  drawId?: string;
  amount: number;
  currency: "TON" | "USDT";
  recipientAddress: string;
}): Promise<
  Array<{
    id: string;
    userId: string;
    ticketId: string | null;
    drawId: string | null;
    amount: number;
    currency: string;
    recipientAddress: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
    processedAt: Date | null;
    completedAt: Date | null;
    lastError: string | null;
    txHash: string | null;
    totalAmount: number | null;
    splitIndex: number | null;
    splitTotal: number | null;
  }>
> {
  try {
    const maxSingleAmount =
      params.currency === "TON"
        ? parseFloat(process.env.PAYOUT_MAX_SINGLE_AMOUNT_TON || "50")
        : parseFloat(process.env.PAYOUT_MAX_SINGLE_AMOUNT_USDT || "250");

    // Check if payout needs to be split
    if (params.amount > maxSingleAmount) {
      console.log(
        `💰 Large payout detected (${params.amount} ${params.currency}), splitting...`,
      );
      return await splitLargePayout(
        params.userId,
        params.amount,
        params.currency,
        params.recipientAddress,
        params.ticketId,
        params.drawId,
      );
    }

    // Create single payout
    const payout = await createPayout(params);
    return [payout];
  } catch (error) {
    console.error("Failed to queue payout:", error);
    throw error;
  }
}
