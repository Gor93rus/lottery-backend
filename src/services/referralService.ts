import { prisma } from "../lib/prisma.js";
import { GAMIFICATION_CONFIG } from "../config/gamification.js";
import { updateDailyTaskProgress } from "./gamification/dailyTasks.js";
import {
  notifyReferrerOnJoin,
  notifyReferrerOnBonus,
} from "./referral/referralNotifications.js";

/**
 * Referral Service
 * Manages referral system and rewards
 */

/**
 * Apply referral code (when new user signs up)
 */
export async function applyReferralCode(
  referredUserId: string,
  referralCode: string,
): Promise<boolean> {
  // Find referrer by code
  const referrer = await prisma.user.findUnique({
    where: { referralCode },
  });

  if (!referrer || referrer.id === referredUserId) {
    throw new Error("Invalid referral code");
  }

  // Check if user already has a referrer
  const existingReferral = await prisma.user.findUnique({
    where: { id: referredUserId },
    select: { referredBy: true },
  });

  if (existingReferral?.referredBy) {
    throw new Error("User already has a referrer");
  }

  // Update user's referredBy field
  await prisma.user.update({
    where: { id: referredUserId },
    data: { referredBy: referralCode },
  });

  // Create referral relation
  await prisma.referralRelation.create({
    data: {
      referrerId: referrer.id,
      referredId: referredUserId,
      status: "registered",
    },
  });

  // Give signup bonus to referrer
  const signupReward = GAMIFICATION_CONFIG.referral.rewards.onSignup;
  if (signupReward.xp) {
    await prisma.user.update({
      where: { id: referrer.id },
      data: {
        experience: { increment: signupReward.xp },
      },
    });

    // Create reward record
    await prisma.userReward.create({
      data: {
        userId: referrer.id,
        source: "referral",
        sourceId: referredUserId,
        type: "xp",
        value: signupReward.xp,
        claimed: false,
      },
    });
  }

  // Update daily task for referral (async, don't wait)
  updateDailyTaskProgress(referrer.id, "REFERRAL", 1).catch((err) =>
    console.error("Failed to update REFERRAL task:", err),
  );

  // Send notification to referrer
  if (process.env.ENABLE_NOTIFICATIONS === "true") {
    const newUser = await prisma.user.findUnique({
      where: { id: referredUserId },
      select: { username: true, firstName: true },
    });

    if (newUser) {
      notifyReferrerOnJoin(referrer.id, {
        username: newUser.username || undefined,
        firstName: newUser.firstName || undefined,
      }).catch((err) =>
        console.error("Failed to send referral notification:", err),
      );
    }
  }

  return true;
}

/**
 * Process referral first purchase (give rewards to both users)
 */
export async function processReferralFirstPurchase(
  userId: string,
): Promise<void> {
  // Get user's referral relation
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredBy: true },
  });

  if (!user?.referredBy) {
    return; // No referrer
  }

  // Find referrer
  const referrer = await prisma.user.findUnique({
    where: { referralCode: user.referredBy },
  });

  if (!referrer) {
    return;
  }

  // Check if this is first purchase
  const previousPurchases = await prisma.ticket.count({
    where: { userId },
  });

  // Only process on first purchase (previousPurchases should be 1, the current one just made)
  if (previousPurchases !== 1) {
    return; // Not first purchase
  }

  // Get referral relation
  const referralRelation = await prisma.referralRelation.findFirst({
    where: {
      referrerId: referrer.id,
      referredId: userId,
    },
  });

  if (!referralRelation) {
    return;
  }

  // Update referral status
  await prisma.referralRelation.update({
    where: { id: referralRelation.id },
    data: { status: "first_purchase" },
  });

  // Give rewards
  const firstPurchaseReward =
    GAMIFICATION_CONFIG.referral.rewards.onFirstPurchase;

  // Reward to referrer
  if (firstPurchaseReward.tickets) {
    await prisma.userReward.create({
      data: {
        userId: referrer.id,
        source: "referral",
        sourceId: userId,
        type: "ticket",
        value: firstPurchaseReward.tickets,
        claimed: false,
      },
    });
  }

  // Reward to referred user
  if (firstPurchaseReward.referredTickets) {
    await prisma.userReward.create({
      data: {
        userId,
        source: "referral",
        sourceId: referrer.id,
        type: "ticket",
        value: firstPurchaseReward.referredTickets,
        claimed: false,
      },
    });
  }

  // Send notification to referrer about bonus
  if (process.env.ENABLE_NOTIFICATIONS === "true") {
    const referredUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, firstName: true },
    });

    if (referredUser && firstPurchaseReward.tickets) {
      notifyReferrerOnBonus(referrer.id, firstPurchaseReward.tickets, {
        username: referredUser.username || undefined,
        firstName: referredUser.firstName || undefined,
      }).catch((err) =>
        console.error("Failed to send bonus notification:", err),
      );
    }
  }
}

/**
 * Get referral statistics for a user
 */
export async function getReferralStats(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true, referredBy: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Get referrals made by this user
  const referrals = await prisma.referralRelation.findMany({
    where: { referrerId: userId },
    orderBy: { createdAt: "desc" },
  });

  // Get referral stats
  const totalReferrals = referrals.length;
  const activeReferrals = referrals.filter((r) => r.status === "active").length;
  const firstPurchaseReferrals = referrals.filter(
    (r) => r.status === "first_purchase" || r.status === "active",
  ).length;

  // Get referrer info if user was referred
  let referrer = null;
  if (user.referredBy) {
    referrer = await prisma.user.findUnique({
      where: { referralCode: user.referredBy },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
      },
    });
  }

  return {
    referralCode: user.referralCode,
    totalReferrals,
    activeReferrals,
    firstPurchaseReferrals,
    referredBy: referrer,
  };
}
