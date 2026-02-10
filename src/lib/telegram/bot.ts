import TelegramBot from "node-telegram-bot-api";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "";

let bot: TelegramBot | null = null;

/**
 * Initialize Telegram Bot
 */
export function initTelegramBot(): TelegramBot | null {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "⚠️  TELEGRAM_BOT_TOKEN not configured - bot notifications disabled",
    );
    return null;
  }

  if (bot) {
    return bot;
  }

  try {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
    console.log("✅ Telegram bot initialized");
    return bot;
  } catch (error) {
    console.error("Failed to initialize Telegram bot:", error);
    return null;
  }
}

/**
 * Get bot instance
 */
export function getTelegramBot(): TelegramBot | null {
  if (!bot) {
    return initTelegramBot();
  }
  return bot;
}

/**
 * Send notification to user
 */
export async function sendNotification(
  telegramId: string,
  message: string,
  options?: TelegramBot.SendMessageOptions,
): Promise<boolean> {
  try {
    const telegramBot = getTelegramBot();

    if (!telegramBot) {
      console.warn("Telegram bot not configured - skipping notification");
      return false;
    }

    await telegramBot.sendMessage(telegramId, message, {
      parse_mode: "HTML",
      ...options,
    });

    return true;
  } catch (error) {
    console.error("Failed to send Telegram notification:", error);
    return false;
  }
}

/**
 * Send prize won notification
 */
export async function notifyPrizeWon(
  telegramId: string,
  lotteryName: string,
  prizeAmount: number,
  matchedNumbers: number,
): Promise<boolean> {
  const message = `
🎉 <b>Поздравляем! Вы выиграли!</b>

Лотерея: ${lotteryName}
Совпадений: ${matchedNumbers} из 5
Приз: <b>${prizeAmount} TON</b>

Ваш выигрыш уже зачислен на баланс!
  `.trim();

  return sendNotification(telegramId, message);
}

/**
 * Send ticket purchased notification
 */
export async function notifyTicketPurchased(
  telegramId: string,
  lotteryName: string,
  numbers: number[],
  drawDate: Date,
): Promise<boolean> {
  const numbersStr = numbers.join(", ");
  const dateStr = drawDate.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "short",
  });

  const message = `
🎫 <b>Билет успешно приобретен!</b>

Лотерея: ${lotteryName}
Ваши числа: <b>${numbersStr}</b>
Розыгрыш: ${dateStr} МСК

Удачи! 🍀
  `.trim();

  return sendNotification(telegramId, message);
}

/**
 * Send draw result notification
 */
export async function notifyDrawResult(
  telegramId: string,
  lotteryName: string,
  winningNumbers: number[],
  yourNumbers: number[],
  matchedCount: number,
  won: boolean,
  prizeAmount?: number,
): Promise<boolean> {
  const winningStr = winningNumbers.join(", ");
  const yourStr = yourNumbers.join(", ");

  let message = `
🎰 <b>Результаты розыгрыша</b>

Лотерея: ${lotteryName}
Выигрышные числа: <b>${winningStr}</b>
Ваши числа: ${yourStr}
Совпадений: ${matchedCount}
  `.trim();

  if (won && prizeAmount) {
    message += `\n\n🎉 Вы выиграли <b>${prizeAmount} TON</b>!`;
  } else if (matchedCount > 0) {
    message += "\n\nК сожалению, в этот раз не повезло. Попробуйте еще раз!";
  } else {
    message += "\n\nВ следующий раз обязательно повезет! 🍀";
  }

  return sendNotification(telegramId, message);
}

/**
 * Send welcome message to new user
 */
export async function sendWelcomeMessage(
  telegramId: string,
  firstName?: string,
): Promise<boolean> {
  const name = firstName || "друг";
  const message = `
👋 Привет, ${name}!

Добро пожаловать в <b>Weekend Special Lottery</b>!

🎫 Покупайте билеты за TON
🎰 Участвуйте в ежедневных розыгрышах
💰 Выигрывайте до 500 TON!

Розыгрыши проходят каждый день в 18:00 МСК.

Удачи! 🍀
  `.trim();

  return sendNotification(telegramId, message);
}

/**
 * Send payout notification
 */
export async function notifyPayoutSent(
  telegramId: string,
  amount: number,
  currency: string,
  txHash: string,
): Promise<boolean> {
  const message = `
💸 <b>Выплата отправлена!</b>

Сумма: <b>${amount} ${currency}</b>
Транзакция: <code>${txHash}</code>

Средства поступят на ваш кошелек в ближайшее время.

Поздравляем с выигрышем! 🎉
  `.trim();

  return sendNotification(telegramId, message);
}

/**
 * Send payout failed notification
 */
export async function notifyPayoutFailed(
  telegramId: string,
  amount: number,
  currency: string,
  reason: string,
): Promise<boolean> {
  const message = `
⚠️ <b>Ошибка выплаты</b>

К сожалению, не удалось отправить выплату автоматически.

Сумма: <b>${amount} ${currency}</b>
Причина: ${reason}

Пожалуйста, свяжитесь с поддержкой для решения вопроса.
  `.trim();

  return sendNotification(telegramId, message);
}

/**
 * Get bot username
 */
export function getBotUsername(): string {
  return TELEGRAM_BOT_USERNAME;
}

export default {
  initTelegramBot,
  getTelegramBot,
  sendNotification,
  notifyPrizeWon,
  notifyTicketPurchased,
  notifyDrawResult,
  sendWelcomeMessage,
  notifyPayoutSent,
  notifyPayoutFailed,
  getBotUsername,
};
