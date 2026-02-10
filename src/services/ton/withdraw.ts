import { prisma } from "../../lib/prisma.js";
import { TON_CONFIG } from "./client.js";
import { sendTON } from "./wallet.js";
import { Address } from "@ton/ton";

interface WithdrawResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

// Calculate smart withdrawal limit
export async function getWithdrawalLimit(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get today's winnings
  const todayWinnings = await prisma.ticket.aggregate({
    where: {
      userId,
      status: "WON",
      updatedAt: { gte: today },
    },
    _sum: { prizeAmount: true },
  });

  const winningsToday = todayWinnings._sum.prizeAmount || 0;

  // Smart limit: MAX(base limit, today's winnings)
  return Math.max(TON_CONFIG.baseWithdrawalLimit, winningsToday);
}

// Get today's withdrawal total
export async function getTodayWithdrawals(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const withdrawals = await prisma.transaction.aggregate({
    where: {
      userId,
      type: "WITHDRAWAL",
      status: "COMPLETED",
      createdAt: { gte: today },
    },
    _sum: { amount: true },
  });

  return withdrawals._sum.amount || 0;
}

// Request withdrawal
export async function requestWithdrawal(
  userId: string,
  amount: number,
  toAddress: string,
  currency: string = "TON",
): Promise<WithdrawResult> {
  try {
    // Validate address
    try {
      Address.parse(toAddress);
    } catch {
      return { success: false, error: "Invalid TON address" };
    }

    // Get user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Check minimum withdrawal
    const minWithdrawal =
      TON_CONFIG.minWithdrawal[
        currency as keyof typeof TON_CONFIG.minWithdrawal
      ] || 1;
    if (amount < minWithdrawal) {
      return {
        success: false,
        error: `Minimum withdrawal is ${minWithdrawal} ${currency}`,
      };
    }

    // Check balance (amount + fee)
    const totalRequired = amount + TON_CONFIG.withdrawalFee;
    if (user.balance < totalRequired) {
      return {
        success: false,
        error: `Insufficient balance. Required: ${totalRequired} TON (including ${TON_CONFIG.withdrawalFee} TON fee)`,
      };
    }

    // Check daily limit
    const dailyLimit = await getWithdrawalLimit(userId);
    const todayTotal = await getTodayWithdrawals(userId);
    const remainingLimit = dailyLimit - todayTotal;

    if (amount > remainingLimit) {
      return {
        success: false,
        error: `Daily withdrawal limit exceeded. Remaining today: ${remainingLimit} TON (Limit: ${dailyLimit} TON)`,
      };
    }

    // Create pending withdrawal
    const withdrawal = await prisma.transaction.create({
      data: {
        userId,
        type: "WITHDRAWAL",
        amount,
        tonAmount: amount,
        fee: TON_CONFIG.withdrawalFee,
        currency,
        status: "PENDING",
        toAddress,
      },
    });

    // Deduct from balance immediately
    await prisma.user.update({
      where: { id: userId },
      data: { balance: { decrement: totalRequired } },
    });

    // Process withdrawal (send TON)
    try {
      const txHash = await sendTON(
        toAddress,
        amount,
        `Withdrawal ${withdrawal.id}`,
      );

      // Update transaction as completed
      await prisma.transaction.update({
        where: { id: withdrawal.id },
        data: {
          status: "COMPLETED",
          txHash,
          completedAt: new Date(),
        },
      });

      // Create notification
      await prisma.notification.create({
        data: {
          userId,
          type: "WITHDRAWAL",
          title: "✅ Withdrawal Sent!",
          message: `${amount} ${currency} has been sent to your wallet. Fee: ${TON_CONFIG.withdrawalFee} TON`,
          data: {
            amount,
            currency,
            txHash,
            fee: TON_CONFIG.withdrawalFee,
            toAddress,
          },
        },
      });

      console.log(`✅ Withdrawal processed: ${amount} TON to ${toAddress}`);
      return { success: true, txHash: txHash || undefined };
    } catch (sendError) {
      // Refund on failure
      await prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: totalRequired } },
      });

      await prisma.transaction.update({
        where: { id: withdrawal.id },
        data: { status: "FAILED", error: String(sendError) },
      });

      console.error("Withdrawal failed:", sendError);
      return { success: false, error: "Transaction failed. Balance refunded." };
    }
  } catch (error) {
    console.error("Withdrawal error:", error);
    return { success: false, error: "Withdrawal failed" };
  }
}

// Get withdrawal info for user
export async function getWithdrawalInfo(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const dailyLimit = await getWithdrawalLimit(userId);
  const todayTotal = await getTodayWithdrawals(userId);

  return {
    balance: user.balance,
    currency: "TON",
    minWithdrawal: TON_CONFIG.minWithdrawal.TON,
    fee: TON_CONFIG.withdrawalFee,
    dailyLimit,
    usedToday: todayTotal,
    remainingToday: Math.max(0, dailyLimit - todayTotal),
    maxWithdrawable: Math.min(
      user.balance - TON_CONFIG.withdrawalFee,
      dailyLimit - todayTotal,
    ),
  };
}
