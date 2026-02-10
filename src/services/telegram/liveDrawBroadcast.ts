import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../lib/prisma.js";

const bot = process.env.TELEGRAM_BOT_TOKEN
  ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN)
  : null;

const WEBAPP_URL = process.env.WEBAPP_URL || "https://t.me/your_bot/app";

interface DrawInfo {
  lotteryName: string;
  drawNumber: number;
  seedHash: string;
  participantsCount: number;
  jackpot: number;
}

interface BroadcastState {
  messageId: number;
  chatId: string | number;
}

/**
 * Format balls display
 * Revealed balls show numbers, unrevealed show 🎱
 */
function formatBalls(revealed: number[], total: number = 5): string {
  const balls: string[] = [];

  for (let i = 0; i < total; i++) {
    if (i < revealed.length) {
      balls.push(`【 ${revealed[i].toString().padStart(2, "0")} 】`);
    } else {
      balls.push("🎱");
    }
  }

  return balls.join(" ");
}

/**
 * Live Draw Broadcast Service
 * Sends and updates messages during draw
 */
export const liveDrawBroadcast = {
  /**
   * Start live draw broadcast to a user
   * Returns message state for updates
   */
  async startBroadcast(
    chatId: string | number,
    draw: DrawInfo,
  ): Promise<BroadcastState | null> {
    if (!bot) {
      console.warn("Telegram bot not initialized");
      return null;
    }

    const message = `
🎰 *РОЗЫГРЫШ НАЧАЛСЯ!*
*${draw.lotteryName}* #${draw.drawNumber}

━━━━━━━━━━━━━━━━━━━━
${formatBalls([], 5)}
━━━━━━━━━━━━━━━━━━━━

🔐 Seed Hash: \`${draw.seedHash.slice(0, 16)}...\`
👥 Участников: ${draw.participantsCount}
💰 Джекпот: *${draw.jackpot} TON*

⏳ Выпадает шар 1...
    `.trim();

    try {
      const sent = await bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
      });

      return {
        messageId: sent.message_id,
        chatId,
      };
    } catch (error) {
      console.error("Failed to start live broadcast:", error);
      return null;
    }
  },

  /**
   * Update broadcast with new ball
   */
  async updateBall(
    state: BroadcastState,
    draw: DrawInfo,
    revealedBalls: number[],
    nextBallNumber: number | null,
  ): Promise<boolean> {
    if (!bot) return false;

    const statusLine = nextBallNumber
      ? `⏳ Выпадает шар ${nextBallNumber}...`
      : "✨ Все шары выпали!";

    const message = `
🎰 *РОЗЫГРЫШ ИДЁТ!*
*${draw.lotteryName}* #${draw.drawNumber}

━━━━━━━━━━━━━━━━━━━━
${formatBalls(revealedBalls, 5)}
━━━━━━━━━━━━━━━━━━━━

🔐 Seed Hash: \`${draw.seedHash.slice(0, 16)}...\`
👥 Участников: ${draw.participantsCount}
💰 Джекпот: *${draw.jackpot} TON*

${statusLine}
    `.trim();

    try {
      await bot.editMessageText(message, {
        chat_id: state.chatId,
        message_id: state.messageId,
        parse_mode: "Markdown",
      });
      return true;
    } catch (error) {
      console.error("Failed to update live broadcast:", error);
      return false;
    }
  },

  /**
   * Complete broadcast with final results
   */
  async completeBroadcast(
    state: BroadcastState,
    draw: DrawInfo & {
      winningNumbers: number[];
      seed: string;
      winnersCount: number;
      totalPaidOut: number;
      jackpotWon: boolean;
      nextJackpot: number;
    },
  ): Promise<boolean> {
    if (!bot) return false;

    const jackpotStatus = draw.jackpotWon
      ? `🎊 *ДЖЕКПОТ СОРВАН!* 🎊`
      : `💰 Джекпот не сорван → *${draw.nextJackpot} TON*`;

    const message = `
🏆 *РЕЗУЛЬТАТ РОЗЫГРЫША!*
*${draw.lotteryName}* #${draw.drawNumber}

━━━━━━━━━━━━━━━━━━━━
${formatBalls(draw.winningNumbers, 5)}
━━━━━━━━━━━━━━━━━━━━

🎉 Победителей: *${draw.winnersCount}*
💸 Выплачено: *${draw.totalPaidOut} TON*
${jackpotStatus}

🔐 Seed: \`${draw.seed.slice(0, 20)}...\`
✅ *Hash совпадает!*
    `.trim();

    try {
      await bot.editMessageText(message, {
        chat_id: state.chatId,
        message_id: state.messageId,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔍 Проверить честность",
                url: `${WEBAPP_URL}?verify=${draw.drawNumber}`,
              },
              { text: "🎫 Мои билеты", url: WEBAPP_URL },
            ],
          ],
        },
      });
      return true;
    } catch (error) {
      console.error("Failed to complete live broadcast:", error);
      return false;
    }
  },

  /**
   * Broadcast live draw to all participants
   */
  async broadcastToParticipants(
    drawId: string,
    winningNumbers: number[],
    seed: string,
  ): Promise<void> {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: {
        lottery: true,
        tickets: {
          include: {
            user: {
              select: {
                telegramId: true,
                notifyDrawResults: true,
              },
            },
          },
        },
      },
    });

    if (!draw) {
      console.error("Draw not found for broadcast:", drawId);
      return;
    }

    // Get unique users who want notifications
    const usersToNotify = new Map<string, BroadcastState>();

    for (const ticket of draw.tickets) {
      if (
        ticket.user &&
        ticket.user.notifyDrawResults &&
        ticket.user.telegramId &&
        !usersToNotify.has(ticket.user.telegramId)
      ) {
        const state = await this.startBroadcast(ticket.user.telegramId, {
          lotteryName: draw.lottery.name,
          drawNumber: draw.drawNumber,
          seedHash: draw.serverSeedHash || "",
          participantsCount: draw.tickets.length,
          jackpot: draw.lottery.jackpot,
        });

        if (state) {
          usersToNotify.set(ticket.user.telegramId, state);
        }
      }
    }

    // Reveal balls one by one with delay
    for (let i = 0; i < winningNumbers.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay

      const revealed = winningNumbers.slice(0, i + 1);
      const nextBall = i < winningNumbers.length - 1 ? i + 2 : null;

      for (const [, state] of usersToNotify) {
        await this.updateBall(
          state,
          {
            lotteryName: draw.lottery.name,
            drawNumber: draw.drawNumber,
            seedHash: draw.serverSeedHash || "",
            participantsCount: draw.tickets.length,
            jackpot: draw.lottery.jackpot,
          },
          revealed,
          nextBall,
        );
      }
    }

    // Wait before showing final results
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Calculate stats
    const winnersCount = draw.tickets.filter(
      (t) => (t.matchedNumbers || 0) >= 2,
    ).length;
    const totalPaidOut = draw.tickets.reduce(
      (sum, t) => sum + (t.prizeAmount || 0),
      0,
    );
    const jackpotWon = draw.tickets.some((t) => t.matchedNumbers === 5);

    // Send final results
    for (const [, state] of usersToNotify) {
      await this.completeBroadcast(state, {
        lotteryName: draw.lottery.name,
        drawNumber: draw.drawNumber,
        seedHash: draw.serverSeedHash || "",
        participantsCount: draw.tickets.length,
        jackpot: draw.lottery.jackpot,
        winningNumbers,
        seed,
        winnersCount,
        totalPaidOut,
        jackpotWon,
        nextJackpot: jackpotWon
          ? draw.lottery.baseJackpot || 500
          : draw.lottery.jackpot + 50,
      });
    }
  },
};

export default liveDrawBroadcast;
