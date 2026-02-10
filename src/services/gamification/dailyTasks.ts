/**
 * Daily Tasks Service
 * Handles daily task progress tracking and reward claiming
 */

import { prisma } from "../../lib/prisma.js";

/**
 * Get all daily tasks with user progress
 */
export async function getDailyTasksWithProgress(userId: string) {
  const dailyTasks = await prisma.dailyTask.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  // Get today's reset time (start of next day UTC)
  const now = new Date();
  const resetAt = new Date(now);
  resetAt.setUTCHours(24, 0, 0, 0); // Next midnight UTC

  const userTasks = await prisma.userDailyTask.findMany({
    where: {
      userId,
      resetAt: {
        gte: now, // Only tasks that haven't reset yet
      },
    },
    include: { dailyTask: true },
  });

  return dailyTasks.map((task) => {
    const userTask = userTasks.find((ut) => ut.dailyTaskId === task.id);

    return {
      id: task.id,
      taskId: task.taskId,
      name: task.name,
      nameEn: task.nameEn,
      type: task.type,
      target: task.target,
      rewardXp: task.rewardXp,
      rewardTon: task.rewardTon,
      progress: userTask?.progress || 0,
      completed: userTask?.completed || false,
      claimed: userTask?.claimed || false,
      claimedAt: userTask?.claimedAt || null,
      resetAt: userTask?.resetAt || resetAt,
    };
  });
}

/**
 * Update daily task progress
 */
export async function updateDailyTaskProgress(
  userId: string,
  taskType: string,
  amount: number = 1,
): Promise<void> {
  const tasks = await prisma.dailyTask.findMany({
    where: { type: taskType, isActive: true },
  });

  const now = new Date();
  const resetAt = new Date(now);
  resetAt.setUTCHours(24, 0, 0, 0); // Next midnight UTC

  for (const task of tasks) {
    // Get or create user task for today
    const userTask = await prisma.userDailyTask.findFirst({
      where: {
        userId,
        dailyTaskId: task.id,
        resetAt: {
          gte: now,
        },
      },
    });

    if (!userTask) {
      // Create new task progress for today
      await prisma.userDailyTask.create({
        data: {
          userId,
          dailyTaskId: task.id,
          progress: Math.min(amount, task.target),
          completed: amount >= task.target,
          resetAt,
        },
      });
    } else if (!userTask.completed) {
      // Update existing task progress
      const newProgress = Math.min(userTask.progress + amount, task.target);
      await prisma.userDailyTask.update({
        where: { id: userTask.id },
        data: {
          progress: newProgress,
          completed: newProgress >= task.target,
          completedAt: newProgress >= task.target ? new Date() : null,
        },
      });
    }
  }
}

/**
 * Claim daily task reward
 */
export async function claimDailyTaskReward(userId: string, taskId: string) {
  const task = await prisma.dailyTask.findUnique({
    where: { taskId },
  });

  if (!task) {
    throw new Error("Daily task not found");
  }

  const now = new Date();
  const userTask = await prisma.userDailyTask.findFirst({
    where: {
      userId,
      dailyTaskId: task.id,
      completed: true,
      claimed: false,
      resetAt: {
        gte: now,
      },
    },
  });

  if (!userTask) {
    throw new Error("Task not completed or already claimed");
  }

  // Use transaction to update task and user atomically
  const [, updatedUser] = await prisma.$transaction([
    // Mark task as claimed
    prisma.userDailyTask.update({
      where: { id: userTask.id },
      data: {
        claimed: true,
        claimedAt: new Date(),
      },
    }),
    // Award XP to user
    prisma.user.update({
      where: { id: userId },
      data: {
        experience: { increment: task.rewardXp },
        balance: { increment: task.rewardTon },
      },
    }),
  ]);

  return {
    rewardXp: task.rewardXp,
    rewardTon: task.rewardTon,
    newXp: updatedUser.experience,
    newBalance: updatedUser.balance,
  };
}

/**
 * Reset expired daily tasks (called by cron)
 */
export async function resetExpiredDailyTasks(): Promise<void> {
  const now = new Date();

  // Delete all user tasks that have passed their reset time
  await prisma.userDailyTask.deleteMany({
    where: {
      resetAt: {
        lt: now,
      },
    },
  });

  console.log("✅ Expired daily tasks reset");
}
