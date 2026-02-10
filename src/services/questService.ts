import { prisma } from "../lib/prisma.js";

/**
 * Quest Service
 * Manages quests and user quest progress
 */

/**
 * Get all active quests
 */
export async function getActiveQuests(type?: string) {
  const where: Record<string, unknown> = { active: true };
  if (type) {
    where.type = type;
  }

  return await prisma.quest.findMany({
    where,
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * Get user's quests with progress
 */
export async function getUserQuests(userId: string, type?: string) {
  const now = new Date();

  // Get active quests
  const quests = await getActiveQuests(type);

  // Get user progress
  const userQuests = await prisma.userQuest.findMany({
    where: {
      userId,
      questId: { in: quests.map((q) => q.id) },
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    },
    include: { quest: true },
  });

  // Map quests with progress
  return quests.map((quest) => {
    const userQuest = userQuests.find((uq) => uq.questId === quest.id);

    return {
      ...quest,
      progress: userQuest?.progress || 0,
      completed: userQuest?.completed || false,
      completedAt: userQuest?.completedAt || null,
      claimed: userQuest?.claimed || false,
      claimedAt: userQuest?.claimedAt || null,
      userQuestId: userQuest?.id || null,
    };
  });
}

/**
 * Update quest progress
 */
export async function updateQuestProgress(
  userId: string,
  questSlug: string,
  increment: number = 1,
): Promise<boolean> {
  const quest = await prisma.quest.findFirst({
    where: { slug: questSlug, active: true },
  });

  if (!quest) {
    return false;
  }

  // Calculate expiry based on quest type
  let expiresAt: Date | null = null;
  const now = new Date();

  if (quest.type === "daily") {
    expiresAt = new Date(now);
    expiresAt.setHours(23, 59, 59, 999);
  } else if (quest.type === "weekly") {
    expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + (7 - expiresAt.getDay()));
    expiresAt.setHours(23, 59, 59, 999);
  } else if (quest.type === "monthly") {
    expiresAt = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
  }

  // Get or create user quest
  let userQuest = await prisma.userQuest.findFirst({
    where: {
      userId,
      questId: quest.id,
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    },
  });

  if (!userQuest) {
    userQuest = await prisma.userQuest.create({
      data: {
        userId,
        questId: quest.id,
        progress: 0,
        expiresAt,
      },
    });
  }

  // Don't update if already completed
  if (userQuest.completed) {
    return false;
  }

  // Update progress
  const newProgress = Math.min(userQuest.progress + increment, quest.target);
  const completed = newProgress >= quest.target;

  await prisma.userQuest.update({
    where: { id: userQuest.id },
    data: {
      progress: newProgress,
      completed,
      completedAt: completed ? new Date() : null,
    },
  });

  return completed;
}

/**
 * Claim quest reward
 */
export async function claimQuestReward(userId: string, questId: string) {
  const userQuest = await prisma.userQuest.findFirst({
    where: {
      userId,
      questId,
      completed: true,
      claimed: false,
    },
    include: { quest: true },
  });

  if (!userQuest) {
    throw new Error("Quest not found or already claimed");
  }

  // Mark as claimed
  await prisma.userQuest.update({
    where: { id: userQuest.id },
    data: {
      claimed: true,
      claimedAt: new Date(),
    },
  });

  // Create reward record
  await prisma.userReward.create({
    data: {
      userId,
      source: "quest",
      sourceId: questId,
      type: userQuest.quest.rewardType,
      value: userQuest.quest.rewardValue,
      claimed: false,
    },
  });

  return {
    rewardType: userQuest.quest.rewardType,
    rewardValue: userQuest.quest.rewardValue,
  };
}
