import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

const JACKPOT_ROLLOVER_PERCENTAGE = 50; // 50% of unclaimed jackpot rolls over

export async function handleJackpotRollover(
  tx: Prisma.TransactionClient,
  lotteryId: string,
  currentPrizePool: number,
) {
  // Calculate rollover amount (50% of jackpot portion that wasn't won)
  const jackpotPortion = currentPrizePool * 0.5; // 50% was jackpot
  const rolloverAmount = jackpotPortion * (JACKPOT_ROLLOVER_PERCENTAGE / 100);

  // Update lottery's accumulated jackpot
  await tx.lottery.update({
    where: { id: lotteryId },
    data: {
      accumulatedJackpot: { increment: rolloverAmount },
    },
  });

  console.log(
    `🎰 Jackpot rollover: +${rolloverAmount.toFixed(2)} TON added to next draw`,
  );

  return rolloverAmount;
}

export async function calculateNextJackpot(lotteryId: string): Promise<number> {
  const lottery = await prisma.lottery.findUnique({
    where: { id: lotteryId },
  });

  if (!lottery) return 0;

  const baseJackpot = lottery.baseJackpot || 1000;
  const accumulated = lottery.accumulatedJackpot || 0;

  return baseJackpot + accumulated;
}

export async function resetAccumulatedJackpot(
  tx: Prisma.TransactionClient,
  lotteryId: string,
) {
  await tx.lottery.update({
    where: { id: lotteryId },
    data: { accumulatedJackpot: 0 },
  });
}

export { JACKPOT_ROLLOVER_PERCENTAGE };
