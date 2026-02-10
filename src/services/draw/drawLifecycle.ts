import { prisma } from "../../lib/prisma.js";
import {
  calculateNextJackpot,
  resetAccumulatedJackpot,
} from "./jackpotRollover.js";
import { generateServerSeed, hashServerSeed } from "../provablyFair.js";

export async function createNextDraw(
  lotteryId: string,
  previousDrawNumber: number,
) {
  return await prisma.$transaction(async (tx) => {
    const lottery = await tx.lottery.findUnique({
      where: { id: lotteryId },
    });

    if (!lottery) throw new Error("Lottery not found");

    // Calculate next draw time based on lottery frequency
    const nextDrawTime = calculateNextDrawTime(lottery);

    // Calculate prize pool including any rollover
    const nextJackpot = await calculateNextJackpot(lotteryId);

    // Generate server seed and hash for provably fair draw
    const serverSeed = generateServerSeed();
    const serverSeedHash = hashServerSeed(serverSeed);

    // Create new draw with incremented number
    const newDraw = await tx.draw.create({
      data: {
        lotteryId,
        drawNumber: previousDrawNumber + 1,
        status: "open",
        drawTime: nextDrawTime,
        prizePoolSnapshot: nextJackpot,
        totalTickets: 0,
        salesOpenAt: new Date(),
        salesCloseAt: new Date(nextDrawTime.getTime() - 30 * 60 * 1000), // 30 min before
        scheduledAt: nextDrawTime,
        currency: lottery.currency,
        serverSeedHash,
      },
    });

    // Reset accumulated jackpot after applying to new draw
    await resetAccumulatedJackpot(tx, lotteryId);

    console.log(
      `🆕 Draw #${newDraw.drawNumber} created for ${lottery.name}, opens now, draws at ${nextDrawTime.toISOString()}`,
    );

    return newDraw;
  });
}

function calculateNextDrawTime(lottery: Record<string, unknown>): Date {
  const now = new Date();
  const frequency = lottery.drawFrequency || "DAILY";

  switch (frequency) {
    case "HOURLY":
      now.setHours(now.getHours() + 1);
      now.setMinutes(0, 0, 0);
      break;
    case "DAILY":
      now.setDate(now.getDate() + 1);
      now.setHours((lottery.drawHour as number) || 18, 0, 0, 0);
      break;
    case "WEEKLY":
      now.setDate(now.getDate() + 7);
      now.setHours((lottery.drawHour as number) || 18, 0, 0, 0);
      break;
    default:
      now.setDate(now.getDate() + 1);
      now.setHours(18, 0, 0, 0);
  }

  return now;
}

export { calculateNextDrawTime };
