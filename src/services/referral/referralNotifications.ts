import { prisma } from "../../lib/prisma.js";
import { telegramNotifications } from "../telegram/notificationService.js";

/**
 * Notify referrer when a new user joins with their code
 */
export async function notifyReferrerOnJoin(
  referrerId: string,
  newUser: { username?: string; firstName?: string },
): Promise<void> {
  const referrer = await prisma.user.findUnique({
    where: { id: referrerId },
    select: { telegramId: true, notifyReferrals: true },
  });

  if (!referrer || !referrer.notifyReferrals || !referrer.telegramId) return;

  await telegramNotifications.friendJoined(referrer.telegramId, {
    username: newUser.username,
    firstName: newUser.firstName,
  });
}

/**
 * Notify referrer when they earn a bonus from referral's ticket purchase
 */
export async function notifyReferrerOnBonus(
  referrerId: string,
  bonusAmount: number,
  referral: { username?: string; firstName?: string },
): Promise<void> {
  const referrer = await prisma.user.findUnique({
    where: { id: referrerId },
    select: {
      telegramId: true,
      notifyReferrals: true,
      balance: true, // Use balance as a proxy for total earned
    },
  });

  if (!referrer || !referrer.notifyReferrals || !referrer.telegramId) return;

  await telegramNotifications.referralBonus(referrer.telegramId, {
    amount: bonusAmount,
    referralUsername: referral.username,
    referralFirstName: referral.firstName,
    totalEarned: referrer.balance || 0, // Show current balance instead
  });
}

export default { notifyReferrerOnJoin, notifyReferrerOnBonus };
