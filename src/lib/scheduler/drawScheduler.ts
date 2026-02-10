import cron from "node-cron";
import crypto from "crypto";
import { prisma } from "../prisma.js";
import { sendNotification } from "../telegram/bot.js";

let schedulerTask: cron.ScheduledTask | null = null;
let isExecuting = false;

/**
 * Generate winning numbers using provably fair algorithm
 */
function generateWinningNumbers(
  seed: string,
  count: number,
  max: number,
): number[] {
  const numbers: number[] = [];
  let hash = seed;

  while (numbers.length < count) {
    hash = crypto.createHash("sha256").update(hash).digest("hex");
    const num = (parseInt(hash.slice(0, 8), 16) % max) + 1;
    if (!numbers.includes(num)) {
      numbers.push(num);
    }
  }

  return numbers.sort((a, b) => a - b);
}

/**
 * Calculate prize amount based on matched numbers
 */
function calculatePrize(
  matchedNumbers: number,
  prizeStructure: unknown,
): number {
  // Type guard: ensure prizeStructure is a non-null object
  if (!prizeStructure || typeof prizeStructure !== "object") return 0;

  // Safe cast after validation
  const structure = prizeStructure as Record<string, string | number>;
  const prizeConfig = structure[matchedNumbers.toString()];

  if (!prizeConfig) return 0;
  if (prizeConfig === "free_ticket") return 0;

  // Ensure prizeConfig is a valid number or numeric string
  const numValue =
    typeof prizeConfig === "number"
      ? prizeConfig
      : parseFloat(prizeConfig.toString());
  return isNaN(numValue) ? 0 : numValue;
}

/**
 * Execute draw by ID using existing logic
 */
export async function executeDrawById(drawId: string): Promise<{
  success: boolean;
  message?: string;
  draw?: unknown;
  winners?: unknown[];
}> {
  try {
    console.log(`🎰 Executing draw ${drawId}...`);

    // Get draw with lottery info
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: {
        lottery: true,
        tickets: {
          include: {
            user: {
              select: {
                id: true,
                telegramId: true,
                username: true,
                tonWallet: true,
              },
            },
          },
        },
      },
    });

    if (!draw) {
      throw new Error("Draw not found");
    }

    // Check if draw can be executed
    if (draw.status === "completed") {
      console.log(`⏭️  Draw ${drawId} already completed`);
      return { success: true, message: "Draw already completed", draw };
    }

    if (draw.status === "cancelled") {
      throw new Error("Draw is cancelled");
    }

    // Generate server seed if not already set
    let seed = draw.seed;
    if (!seed) {
      seed = crypto.randomBytes(32).toString("hex");
    }

    const winningNumbers = generateWinningNumbers(
      seed,
      draw.lottery.numbersCount,
      draw.lottery.numbersMax,
    );

    // Update draw status to in_progress
    await prisma.draw.update({
      where: { id: drawId },
      data: {
        status: "in_progress",
        seed,
        winningNumbers,
        executedAt: new Date(),
      },
    });

    // Calculate winners and prepare updates
    interface Winner {
      ticketId: string;
      userId: string;
      username: string;
      telegramId: string;
      numbers: number[];
      matchedNumbers: number;
      prizeAmount: number;
    }

    interface TicketUpdate {
      id: string;
      matchedNumbers: number;
      prizeAmount: number;
      status: string;
    }

    interface Notification {
      userId: string;
      type: string;
      title: string;
      message: string;
      read: boolean;
    }

    interface PayoutToQueue {
      userId: string;
      ticketId: string;
      drawId: string;
      amount: number;
      currency: string;
      recipientAddress: string;
    }

    const winners: Winner[] = [];
    let totalWinners = 0;
    let totalPaid = 0;
    const ticketUpdates: TicketUpdate[] = [];
    const userBalanceUpdates: Map<string, number> = new Map();
    const notifications: Notification[] = [];
    const payoutsToQueue: PayoutToQueue[] = [];

    for (const ticket of draw.tickets) {
      // Calculate matched numbers
      const matchedNumbers = ticket.numbers.filter((num: number) =>
        winningNumbers.includes(num),
      ).length;

      // Calculate prize
      const prizeAmount = calculatePrize(
        matchedNumbers,
        draw.lottery.prizeStructure,
      );
      const isWinner = matchedNumbers > 0 && prizeAmount > 0;

      if (isWinner) {
        totalWinners++;
        totalPaid += prizeAmount;

        winners.push({
          ticketId: ticket.id,
          userId: ticket.userId || "anonymous",
          username: ticket.user?.username || "Anonymous",
          telegramId: ticket.user?.telegramId || "",
          numbers: ticket.numbers,
          matchedNumbers,
          prizeAmount,
        });

        // Queue payout if user has a wallet
        if (ticket.userId && ticket.user?.tonWallet) {
          payoutsToQueue.push({
            userId: ticket.userId,
            ticketId: ticket.id,
            drawId: draw.id,
            amount: prizeAmount,
            currency: draw.lottery.currency || "TON",
            recipientAddress: ticket.user.tonWallet,
          });
        } else {
          // Accumulate balance updates for users without wallet (legacy)
          if (ticket.userId) {
            const currentBalance = userBalanceUpdates.get(ticket.userId) || 0;
            userBalanceUpdates.set(ticket.userId, currentBalance + prizeAmount);
          }
        }

        // Prepare notification
        if (ticket.userId) {
          notifications.push({
            userId: ticket.userId,
            type: "prize_won",
            title: "Congratulations! You won!",
            message: `You matched ${matchedNumbers} numbers and won ${prizeAmount} ${draw.lottery.currency || "TON"}!`,
            read: false,
          });
        }
      }

      // Prepare ticket update
      ticketUpdates.push({
        id: ticket.id,
        matchedNumbers,
        prizeAmount,
        status: isWinner ? "won" : "lost",
      });
    }

    // Perform all updates in a transaction
    await prisma.$transaction(async (tx) => {
      // Update all tickets
      for (const update of ticketUpdates) {
        await tx.ticket.update({
          where: { id: update.id },
          data: {
            matchedNumbers: update.matchedNumbers,
            prizeAmount: update.prizeAmount,
            status: update.status,
          },
        });
      }

      // Update user balances (only for users without wallet)
      for (const [userId, prizeAmount] of userBalanceUpdates.entries()) {
        await tx.user.update({
          where: { id: userId },
          data: {
            balance: { increment: prizeAmount },
            totalWon: { increment: prizeAmount },
          },
        });
      }

      // Create all notifications
      if (notifications.length > 0) {
        await tx.notification.createMany({
          data: notifications,
        });
      }

      // Queue all payouts
      if (payoutsToQueue.length > 0) {
        for (const payoutData of payoutsToQueue) {
          await tx.payout.create({
            data: {
              userId: payoutData.userId,
              ticketId: payoutData.ticketId,
              drawId: payoutData.drawId,
              amount: payoutData.amount,
              currency: payoutData.currency,
              recipientAddress: payoutData.recipientAddress,
              status: "pending",
              attempts: 0,
              maxAttempts: parseInt(process.env.PAYOUT_MAX_ATTEMPTS || "3", 10),
            },
          });
        }
      }

      // Update draw with final statistics
      await tx.draw.update({
        where: { id: drawId },
        data: {
          status: "completed",
          totalTickets: draw.tickets.length,
          totalPrizePool: draw.lottery.jackpot,
          totalWinners,
          totalPaid,
        },
      });
    });

    console.log(`✅ Draw ${drawId} executed successfully:`, {
      totalTickets: draw.tickets.length,
      totalWinners,
      totalPaid,
      payoutsQueued: payoutsToQueue.length,
    });

    // Send Telegram notifications to all participants
    for (const ticket of draw.tickets) {
      if (ticket.user?.telegramId) {
        const matchedNumbers = ticket.numbers.filter((num: number) =>
          winningNumbers.includes(num),
        ).length;

        const prizeAmount = calculatePrize(
          matchedNumbers,
          draw.lottery.prizeStructure,
        );
        const isWinner = matchedNumbers > 0 && prizeAmount > 0;

        const winningStr = winningNumbers.join(", ");
        const yourStr = ticket.numbers.join(", ");

        let message = `
🎰 <b>Результаты розыгрыша</b>

Лотерея: ${draw.lottery.name}
Выигрышные числа: <b>${winningStr}</b>
Ваши числа: ${yourStr}
Совпадений: ${matchedNumbers}
        `.trim();

        if (isWinner && prizeAmount) {
          if (ticket.user.tonWallet) {
            message += `\n\n🎉 Вы выиграли <b>${prizeAmount} ${draw.lottery.currency || "TON"}</b>!\nВыплата будет отправлена на ваш кошелек.`;
          } else {
            message += `\n\n🎉 Вы выиграли <b>${prizeAmount} ${draw.lottery.currency || "TON"}</b>!\nВыигрыш зачислен на баланс.`;
          }
        } else if (matchedNumbers > 0) {
          message +=
            "\n\nК сожалению, в этот раз не повезло. Попробуйте еще раз!";
        } else {
          message += "\n\nВ следующий раз обязательно повезет! 🍀";
        }

        await sendNotification(ticket.user.telegramId, message);
      }
    }

    return {
      success: true,
      draw: {
        id: draw.id,
        winningNumbers,
        totalTickets: draw.tickets.length,
        totalWinners,
        totalPaid,
      },
      winners,
    };
  } catch (error) {
    console.error(`❌ Failed to execute draw ${drawId}:`, error);

    // Try to revert draw status
    try {
      await prisma.draw.update({
        where: { id: drawId },
        data: { status: "scheduled" },
      });
    } catch (revertError) {
      console.error("Failed to revert draw status:", revertError);
    }

    throw error;
  }
}

/**
 * Check for and execute scheduled draws
 */
async function checkScheduledDraws(): Promise<void> {
  if (isExecuting) {
    console.log("⏭️  Draw scheduler already running, skipping...");
    return;
  }

  isExecuting = true;

  try {
    console.log("\n🔍 Checking for scheduled draws...");

    // Find draws that are scheduled and past their scheduled time
    const now = new Date();
    const scheduledDraws = await prisma.draw.findMany({
      where: {
        status: "scheduled",
        scheduledAt: {
          lte: now,
        },
      },
      orderBy: {
        scheduledAt: "asc",
      },
      take: 5, // Process up to 5 draws at a time
    });

    if (scheduledDraws.length === 0) {
      console.log("✅ No scheduled draws to execute");
      return;
    }

    console.log(
      `📋 Found ${scheduledDraws.length} scheduled draw(s) to execute`,
    );

    // Execute each draw
    for (const draw of scheduledDraws) {
      try {
        await executeDrawById(draw.id);
      } catch (error) {
        console.error(`❌ Failed to execute draw ${draw.id}:`, error);
        // Continue with next draw
      }
    }

    console.log("✅ Scheduled draws processing complete\n");
  } catch (error) {
    console.error("❌ Error checking scheduled draws:", error);
  } finally {
    isExecuting = false;
  }
}

/**
 * Initialize draw scheduler cron job
 */
export function initDrawScheduler(): void {
  if (schedulerTask) {
    console.log("⚠️  Draw scheduler already initialized");
    return;
  }

  // Run every 5 minutes
  schedulerTask = cron.schedule("*/5 * * * *", async () => {
    await checkScheduledDraws();
  });

  console.log("✅ Draw scheduler initialized (runs every 5 minutes)");
}

/**
 * Stop draw scheduler
 */
export function stopDrawScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log("🛑 Draw scheduler stopped");
  }
}

/**
 * Manually trigger draw check
 */
export async function triggerDrawCheck(): Promise<void> {
  await checkScheduledDraws();
}
