import cron from "node-cron";
import {
  getPendingPayouts,
  markPayoutAsProcessing,
  markPayoutAsCompleted,
  markPayoutAsFailed,
  wouldExceedDailyLimit,
} from "./payoutQueue.js";
import { sendTonPayout } from "./tonPayoutService.js";
import { sendUsdtPayout } from "./usdtPayoutService.js";
import { sendNotification } from "../telegram/bot.js";

let processorTask: cron.ScheduledTask | null = null;
let isProcessing = false;

/**
 * Process a single payout
 */
async function processPayout(payout: {
  id: string;
  amount: number;
  currency: string;
  recipientAddress: string;
  attempts: number;
  maxAttempts: number;
  splitIndex?: number | null;
  splitTotal?: number | null;
  user?: {
    telegramId?: string | null;
  } | null;
}): Promise<void> {
  console.log(`\n💰 Processing payout ${payout.id}:`, {
    amount: payout.amount,
    currency: payout.currency,
    recipient: payout.recipientAddress,
    attempt: payout.attempts + 1,
  });

  // Check daily limit - validate currency type before assertion
  if (payout.currency !== "TON" && payout.currency !== "USDT") {
    console.error(`❌ Invalid currency type: ${payout.currency}`);
    await markPayoutAsFailed(
      payout.id,
      `Unsupported currency: ${payout.currency}`,
      true,
    );
    return;
  }

  const wouldExceed = await wouldExceedDailyLimit(
    payout.currency as "TON" | "USDT",
    payout.amount,
  );
  if (wouldExceed) {
    console.warn(
      `⚠️  Daily limit would be exceeded, postponing payout ${payout.id}`,
    );
    await markPayoutAsFailed(payout.id, "Daily limit would be exceeded", false);
    return;
  }

  // Mark as processing
  const marked = await markPayoutAsProcessing(payout.id);
  if (!marked) {
    console.error(`❌ Failed to mark payout ${payout.id} as processing`);
    return;
  }

  // Send payout based on currency
  let result: { success: boolean; txHash?: string; error?: string };

  if (payout.currency === "TON") {
    result = await sendTonPayout(
      payout.recipientAddress,
      payout.amount,
      `Lottery prize payout${payout.splitIndex ? ` (${payout.splitIndex}/${payout.splitTotal})` : ""}`,
    );
  } else if (payout.currency === "USDT") {
    result = await sendUsdtPayout(
      payout.recipientAddress,
      payout.amount,
      `Lottery prize payout${payout.splitIndex ? ` (${payout.splitIndex}/${payout.splitTotal})` : ""}`,
    );
  } else {
    result = {
      success: false,
      error: `Unsupported currency: ${payout.currency}`,
    };
  }

  // Handle result
  if (result.success && result.txHash) {
    // Mark as completed
    await markPayoutAsCompleted(payout.id, result.txHash);

    // Send Telegram notification to user
    if (payout.user?.telegramId) {
      const message = `
🎉 <b>Выплата получена!</b>

Сумма: <b>${payout.amount} ${payout.currency}</b>
${payout.splitIndex ? `Часть ${payout.splitIndex} из ${payout.splitTotal}` : ""}

Транзакция: <code>${result.txHash}</code>

Поздравляем с выигрышем! 🎰
      `.trim();

      await sendNotification(payout.user.telegramId, message);
    }
  } else {
    // Determine if this is final failure
    const isFinalFailure = payout.attempts + 1 >= payout.maxAttempts;
    await markPayoutAsFailed(
      payout.id,
      result.error || "Unknown error",
      isFinalFailure,
    );

    // Notify admins on final failure
    if (isFinalFailure) {
      console.error(
        `❌ CRITICAL: Payout ${payout.id} failed permanently:`,
        result.error,
      );

      // Send notification to user about failure
      if (payout.user?.telegramId) {
        const message = `
⚠️ <b>Ошибка выплаты</b>

К сожалению, не удалось отправить выплату автоматически.

Сумма: ${payout.amount} ${payout.currency}
Адрес: ${payout.recipientAddress}

Пожалуйста, свяжитесь с поддержкой.
        `.trim();

        await sendNotification(payout.user.telegramId, message);
      }
    }
  }
}

/**
 * Process all pending payouts
 */
async function processPendingPayouts(): Promise<void> {
  if (isProcessing) {
    console.log("⏭️  Payout processor already running, skipping...");
    return;
  }

  isProcessing = true;

  try {
    console.log("\n🔄 Checking for pending payouts...");

    const pendingPayouts = await getPendingPayouts(1); // Process one at a time

    if (pendingPayouts.length === 0) {
      console.log("✅ No pending payouts to process");
      return;
    }

    console.log(`📋 Found ${pendingPayouts.length} pending payout(s)`);

    // Process payouts one at a time to avoid race conditions
    for (const payout of pendingPayouts) {
      await processPayout(payout);
    }

    console.log("✅ Payout processing complete\n");
  } catch (error) {
    console.error("❌ Error processing payouts:", error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Initialize payout processor cron job
 */
export function initPayoutProcessor(): void {
  if (processorTask) {
    console.log("⚠️  Payout processor already initialized");
    return;
  }

  // Run every minute
  processorTask = cron.schedule("* * * * *", async () => {
    await processPendingPayouts();
  });

  console.log("✅ Payout processor initialized (runs every 1 minute)");
}

/**
 * Stop payout processor
 */
export function stopPayoutProcessor(): void {
  if (processorTask) {
    processorTask.stop();
    processorTask = null;
    console.log("🛑 Payout processor stopped");
  }
}

/**
 * Manually trigger payout processing
 */
export async function triggerPayoutProcessing(): Promise<void> {
  await processPendingPayouts();
}
