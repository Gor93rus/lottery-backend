import { prisma } from "../lib/prisma.js";

/**
 * Reward Service
 * Manages reward distribution and claiming
 */

/**
 * Get user's unclaimed rewards
 */
export async function getUnclaimedRewards(userId: string) {
  const now = new Date();

  return await prisma.userReward.findMany({
    where: {
      userId,
      claimed: false,
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    },
    include: {
      reward: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get user's reward history
 */
export async function getRewardHistory(userId: string, limit: number = 50) {
  return await prisma.userReward.findMany({
    where: { userId },
    include: {
      reward: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Claim a reward
 */
export async function claimReward(userId: string, rewardId: string) {
  const now = new Date();

  const userReward = await prisma.userReward.findFirst({
    where: {
      id: rewardId,
      userId,
      claimed: false,
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    },
  });

  if (!userReward) {
    throw new Error("Reward not found or already claimed");
  }

  // Mark as claimed
  await prisma.userReward.update({
    where: { id: rewardId },
    data: {
      claimed: true,
      claimedAt: now,
    },
  });

  // Apply reward based on type
  if (userReward.type === "xp") {
    await prisma.user.update({
      where: { id: userId },
      data: {
        experience: { increment: userReward.value },
      },
    });
  } else if (userReward.type === "ticket") {
    // Free tickets are tracked as balance or special field
    // For now, we'll add to user balance (in future, could be separate free ticket count)
    await prisma.user.update({
      where: { id: userId },
      data: {
        balance: { increment: userReward.value },
      },
    });
  }

  return {
    type: userReward.type,
    value: userReward.value,
  };
}

/**
 * Claim all unclaimed rewards
 */
export async function claimAllRewards(userId: string) {
  const rewards = await getUnclaimedRewards(userId);

  const claimed = [];
  for (const reward of rewards) {
    try {
      const result = await claimReward(userId, reward.id);
      claimed.push(result);
    } catch (error) {
      console.error(`Failed to claim reward ${reward.id}:`, error);
    }
  }

  return claimed;
}

/**
 * Create a reward for a user
 */
export async function createReward(
  userId: string,
  type: string,
  value: number,
  source: string,
  sourceId?: string,
  expiresAt?: Date,
) {
  return await prisma.userReward.create({
    data: {
      userId,
      type,
      value,
      source,
      sourceId,
      expiresAt,
    },
  });
}
