import { prisma } from "../../lib/prisma.js";
import { getTonClient, TON_CONFIG } from "./client.js";
import { fromNano, Address } from "@ton/ton";
import crypto from "crypto";

// Generate unique deposit memo for user
export function generateDepositMemo(userId: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${userId}:${Date.now()}`)
    .digest("hex");
  return `dep_${hash.substring(0, 12)}`;
}

// Get deposit address and memo for user
export async function getDepositInfo(userId: string) {
  // Check if user already has a pending deposit memo
  let depositMemo = await prisma.depositMemo.findFirst({
    where: { userId, used: false },
  });

  if (!depositMemo) {
    // Create new memo
    const memo = generateDepositMemo(userId);
    depositMemo = await prisma.depositMemo.create({
      data: {
        userId,
        memo,
        used: false,
        createdAt: new Date(),
      },
    });
  }

  return {
    address: TON_CONFIG.projectWallet,
    memo: depositMemo.memo,
    minDeposit: TON_CONFIG.minDeposit,
    instructions: [
      `1. Open your TON wallet (Tonkeeper, Telegram Wallet, etc.)`,
      `2. Send TON or USDT to: ${TON_CONFIG.projectWallet}`,
      `3. IMPORTANT: Add this memo/comment: ${depositMemo.memo}`,
      `4. Minimum deposit: ${TON_CONFIG.minDeposit.TON} TON or ${TON_CONFIG.minDeposit.USDT} USDT`,
      `5. Your balance will be updated within 1-2 minutes after confirmation`,
    ],
  };
}

// Monitor incoming transactions (run periodically via cron)
export async function checkDeposits() {
  const client = getTonClient();

  try {
    const lastBlock = await client.getLastBlock();
    const projectAddress = Address.parse(TON_CONFIG.projectWallet);

    // Get account lite to get current LT
    const accountInfo = await client.getAccountLite(
      lastBlock.last.seqno,
      projectAddress,
    );

    if (!accountInfo.account.last) {
      return; // No transactions yet
    }

    // Get recent transactions - using LT and hash from account
    const transactions = await client.getAccountTransactions(
      projectAddress,
      BigInt(accountInfo.account.last.lt),
      Buffer.from(accountInfo.account.last.hash, "base64"),
    );

    for (const tx of transactions) {
      await processTransaction(tx);
    }
  } catch (error) {
    console.error("Error checking deposits:", error);
  }
}

async function processTransaction(tx: Record<string, unknown>) {
  try {
    // Validate transaction structure
    if (!tx || !tx.hash) {
      console.log("Invalid transaction structure");
      return;
    }

    // Check if already processed
    const existing = await prisma.transaction.findUnique({
      where: { txHash: tx.hash as string },
    });
    if (existing) return;

    // Parse transaction details
    const inMsg = tx.inMessage as Record<string, unknown> | undefined;
    if (!inMsg) return;

    const inMsgInfo = inMsg.info as Record<string, unknown> | undefined;
    if (!inMsgInfo || inMsgInfo.type !== "internal") return;

    const inMsgValue = inMsgInfo.value as { coins: string } | undefined;
    const inMsgBody = inMsg.body as { toString: () => string } | undefined;
    const inMsgSrc = inMsgInfo.src as { toString: () => string } | undefined;

    const amount = parseFloat(fromNano(inMsgValue?.coins || "0"));
    const memo = inMsgBody?.toString() || "";
    const fromAddress = inMsgSrc?.toString() || "";

    // Check minimum deposit
    if (amount < TON_CONFIG.minDeposit.TON) {
      console.log(`Deposit too small: ${amount} TON from ${fromAddress}`);
      return;
    }

    // Find user by memo
    const depositMemo = await prisma.depositMemo.findFirst({
      where: { memo, used: false },
    });

    if (!depositMemo) {
      console.log(`Unknown memo: ${memo} from ${fromAddress}`);
      return;
    }

    // Process deposit
    await prisma.$transaction(async (prismaClient) => {
      // Update user balance
      await prismaClient.user.update({
        where: { id: depositMemo.userId },
        data: { balance: { increment: amount } },
      });

      // Mark memo as used
      await prismaClient.depositMemo.update({
        where: { id: depositMemo.id },
        data: { used: true },
      });

      // Create transaction record
      await prismaClient.transaction.create({
        data: {
          userId: depositMemo.userId,
          type: "DEPOSIT",
          amount,
          tonAmount: amount,
          currency: "TON",
          status: "COMPLETED",
          txHash: tx.hash as string,
          fromAddress,
          toAddress: TON_CONFIG.projectWallet,
          memo,
          completedAt: new Date(),
        },
      });

      // Create notification
      await prismaClient.notification.create({
        data: {
          userId: depositMemo.userId,
          type: "DEPOSIT",
          title: "💰 Deposit Received!",
          message: `Your deposit of ${amount} TON has been credited to your account.`,
          data: { amount, currency: "TON", txHash: tx.hash as string },
        },
      });
    });

    console.log(
      `✅ Deposit processed: ${amount} TON for user ${depositMemo.userId}`,
    );
  } catch (error) {
    console.error("Error processing transaction:", error);
  }
}
