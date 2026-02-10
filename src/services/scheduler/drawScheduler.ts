import cron from "node-cron";
import { prisma } from "../../lib/prisma.js";
import { executeDraw } from "../draw/drawExecution.js";
import { createNextDraw } from "../draw/drawLifecycle.js";

const LOCK_BEFORE_DRAW_MINUTES = 30;

// Run every minute to check for draws
export function startDrawScheduler() {
  console.log("🕐 Draw Scheduler started");

  // Check every minute
  cron.schedule("* * * * *", async () => {
    await checkAndLockDraws();
    await checkAndExecuteDraws();
  });
}

// Lock sales 30 minutes before draw
async function checkAndLockDraws() {
  const lockTime = new Date();
  lockTime.setMinutes(lockTime.getMinutes() + LOCK_BEFORE_DRAW_MINUTES);

  const drawsToLock = await prisma.draw.findMany({
    where: {
      status: "open",
      drawTime: { lte: lockTime },
    },
  });

  for (const draw of drawsToLock) {
    await prisma.draw.update({
      where: { id: draw.id },
      data: { status: "locked" },
    });
    console.log(`🔒 Draw #${draw.drawNumber} locked - sales closed`);
  }
}

// Execute draws at their scheduled time
async function checkAndExecuteDraws() {
  const now = new Date();

  const drawsToExecute = await prisma.draw.findMany({
    where: {
      status: "locked",
      drawTime: { lte: now },
    },
    include: { lottery: true },
  });

  for (const draw of drawsToExecute) {
    try {
      console.log(`🎰 Executing Draw #${draw.drawNumber}...`);
      await executeDraw(draw.id);
      await createNextDraw(draw.lottery.id, draw.drawNumber);
      console.log(`✅ Draw #${draw.drawNumber} completed, next draw created`);
    } catch (error) {
      console.error(`❌ Error executing draw #${draw.drawNumber}:`, error);
    }
  }
}

export { checkAndLockDraws, checkAndExecuteDraws };
