import { Prisma } from "@prisma/client";

// Prize distribution percentages
const PRIZE_TIERS = {
  jackpot: { matches: 5, percentage: 50 }, // 50% of pool
  second: { matches: 4, percentage: 25 }, // 25% of pool
  third: { matches: 3, percentage: 15 }, // 15% of pool
  fourth: { matches: 2, percentage: 10 }, // 10% of pool
};

export async function distributePrizes(
  tx: Prisma.TransactionClient,
  draw: Record<string, unknown>,
  ticketResults: Record<string, unknown>[],
  winningNumbers: number[],
) {
  const prizePool = (draw.prizePoolSnapshot as number) || 0;
  const currency =
    ((draw.lottery as Record<string, unknown>)?.currency as string) || "TON";

  // Group winners by tier
  const winnersByTier: Record<string, Record<string, unknown>[]> = {
    jackpot: [],
    second: [],
    third: [],
    fourth: [],
  };

  ticketResults
    .filter((t) => (t as Record<string, unknown>).won)
    .forEach((ticket) => {
      const ticketData = ticket as Record<string, unknown>;
      if (ticketData.tier) {
        winnersByTier[ticketData.tier as string].push(ticket);
      }
    });

  // Calculate and distribute prizes for each tier
  for (const [tier, config] of Object.entries(PRIZE_TIERS)) {
    const winners = winnersByTier[tier];
    if (winners.length === 0) continue;

    const tierPool = prizePool * (config.percentage / 100);
    const prizePerWinner = tierPool / winners.length;

    console.log(
      `💰 ${tier}: ${winners.length} winners, ${prizePerWinner.toFixed(2)} ${currency} each`,
    );

    for (const winner of winners) {
      const winnerData = winner as Record<string, unknown>;
      // Update ticket with prize
      await tx.ticket.update({
        where: { id: winnerData.ticketId as string },
        data: {
          prizeAmount: prizePerWinner,
          currency,
        },
      });

      // Add to user balance
      await tx.user.update({
        where: { id: winnerData.userId as string },
        data: { balance: { increment: prizePerWinner } },
      });

      // Create notification
      await tx.notification.create({
        data: {
          userId: winnerData.userId as string,
          type: "prize_won",
          title: `🎉 Congratulations! You won!`,
          message: `Your ticket matched ${winnerData.matches} numbers in Draw #${draw.drawNumber}. Prize: ${prizePerWinner.toFixed(2)} ${currency}`,
          data: {
            drawId: draw.id as string,
            ticketId: winnerData.ticketId as string,
            tier,
            matches: winnerData.matches as number,
            prize: prizePerWinner,
            currency,
            winningNumbers,
          },
        },
      });
    }
  }

  // Log summary
  const totalWinners = ticketResults.filter((t) => t.won).length;
  console.log(
    `📊 Draw #${draw.drawNumber} complete: ${totalWinners} winners out of ${ticketResults.length} tickets`,
  );
}

export { PRIZE_TIERS };
