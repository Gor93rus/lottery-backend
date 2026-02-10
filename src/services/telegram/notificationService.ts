import TelegramBot from "node-telegram-bot-api";

// Initialize bot (send-only mode)
const bot = process.env.TELEGRAM_BOT_TOKEN
  ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN)
  : null;

const WEBAPP_URL = process.env.WEBAPP_URL || "https://t.me/your_bot/app";

/**
 * Format date for Russian locale
 */
function formatDateTime(date: Date): string {
  return (
    date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    }) + " MSK"
  );
}

/**
 * Safe send message with error handling
 */
async function safeSendMessage(
  chatId: string | number,
  text: string,
  options?: TelegramBot.SendMessageOptions,
): Promise<TelegramBot.Message | null> {
  if (!bot) {
    console.warn("Telegram bot not initialized, skipping notification");
    return null;
  }

  try {
    return await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      ...options,
    });
  } catch (error) {
    console.error(`Failed to send Telegram message to ${chatId}:`, error);
    return null;
  }
}

export const telegramNotifications = {
  /**
   * 🎰 Draw Reminder - 1 hour before draw
   */
  async drawReminder(
    telegramId: string,
    draw: {
      lotteryName: string;
      drawNumber: number;
      scheduledAt: Date;
      jackpot: number;
      ticketCount: number;
    },
  ): Promise<void> {
    const message = `
🎰 *Розыгрыш через 1 час!*

*${draw.lotteryName}* #${draw.drawNumber}
🕐 Время: ${formatDateTime(draw.scheduledAt)}
💰 Джекпот: *${draw.jackpot} TON*
🎫 Ваших билетов: ${draw.ticketCount}

${draw.ticketCount === 0 ? "⚠️ У вас нет билетов! Успейте купить!" : "🍀 Удачи в розыгрыше!"}
    `.trim();

    await safeSendMessage(telegramId, message, {
      reply_markup: {
        inline_keyboard: [[{ text: "🎫 Купить билеты", url: WEBAPP_URL }]],
      },
    });
  },

  /**
   * 🏆 You Won!
   */
  async youWon(
    telegramId: string,
    result: {
      lotteryName: string;
      drawNumber: number;
      ticketNumbers: number[];
      winningNumbers: number[];
      matchedCount: number;
      prizeAmount: number;
    },
  ): Promise<void> {
    const ticketStr = result.ticketNumbers.join(" - ");
    const winningStr = result.winningNumbers.join(" - ");

    let emoji = "🎉";
    if (result.matchedCount === 5) emoji = "🎊💎🎊";
    else if (result.matchedCount === 4) emoji = "🥇";
    else if (result.matchedCount === 3) emoji = "🥈";
    else if (result.matchedCount === 2) emoji = "🥉";

    const message = `
${emoji} *ПОЗДРАВЛЯЕМ! ВЫ ВЫИГРАЛИ!* ${emoji}

*${result.lotteryName}* #${result.drawNumber}

🎫 Ваш билет: ${ticketStr}
🎱 Выигрышные: ${winningStr}
✅ Совпало: *${result.matchedCount} из 5*

💰 *Выигрыш: ${result.prizeAmount} TON*

Средства зачислены на ваш баланс!
    `.trim();

    await safeSendMessage(telegramId, message, {
      reply_markup: {
        inline_keyboard: [[{ text: "💰 Мой баланс", url: WEBAPP_URL }]],
      },
    });
  },

  /**
   * 😢 You Lost
   */
  async youLost(
    telegramId: string,
    result: {
      lotteryName: string;
      drawNumber: number;
      ticketNumbers: number[];
      winningNumbers: number[];
      matchedCount: number;
      nextDrawAt?: Date;
      nextJackpot?: number;
    },
  ): Promise<void> {
    const ticketStr = result.ticketNumbers.join(" - ");
    const winningStr = result.winningNumbers.join(" - ");

    let message = `
😔 *К сожалению, в этот раз не повезло*

*${result.lotteryName}* #${result.drawNumber}

🎫 Ваш билет: ${ticketStr}
🎱 Выигрышные: ${winningStr}
❌ Совпало: ${result.matchedCount} из 5

Не расстраивайтесь! Удача обязательно улыбнётся! 🍀
    `.trim();

    if (result.nextDrawAt && result.nextJackpot) {
      message += `

🎰 *Следующий розыгрыш:*
🕐 ${formatDateTime(result.nextDrawAt)}
💰 Джекпот: *${result.nextJackpot} TON*`;
    }

    await safeSendMessage(telegramId, message, {
      reply_markup: {
        inline_keyboard: [[{ text: "🎫 Купить билеты", url: WEBAPP_URL }]],
      },
    });
  },

  /**
   * 👥 Friend Joined (Referral registered)
   */
  async friendJoined(
    telegramId: string,
    referral: {
      username?: string;
      firstName?: string;
    },
  ): Promise<void> {
    const name = referral.username
      ? `@${referral.username}`
      : referral.firstName || "Новый пользователь";

    const message = `
👥 *Новый реферал!*

${name} присоединился по вашей ссылке! 🎉

💡 Вы получите *бонус*, когда друг купит свой первый билет!
    `.trim();

    await safeSendMessage(telegramId, message, {
      reply_markup: {
        inline_keyboard: [[{ text: "👥 Мои рефералы", url: WEBAPP_URL }]],
      },
    });
  },

  /**
   * 💰 Referral Bonus (When referral buys ticket)
   */
  async referralBonus(
    telegramId: string,
    bonus: {
      amount: number;
      referralUsername?: string;
      referralFirstName?: string;
      totalEarned: number;
    },
  ): Promise<void> {
    const name = bonus.referralUsername
      ? `@${bonus.referralUsername}`
      : bonus.referralFirstName || "Ваш реферал";

    const message = `
💰 *Реферальный бонус!*

${name} купил билет!

🎁 Ваш бонус: *+${bonus.amount} TON*
📊 Всего заработано: *${bonus.totalEarned} TON*

Приглашайте больше друзей и зарабатывайте! 🚀
    `.trim();

    await safeSendMessage(telegramId, message, {
      reply_markup: {
        inline_keyboard: [[{ text: "🔗 Пригласить друзей", url: WEBAPP_URL }]],
      },
    });
  },
};

export default telegramNotifications;
