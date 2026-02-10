import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { distributePrizes } from "./prizeDistribution.js";
import { handleJackpotRollover } from "./jackpotRollover.js";

// Generate cryptographically secure winning numbers
export function generateWinningNumbers(
  count: number,
  maxNumber: number,
): number[] {
  const numbers = new Set<number>();

  // Calculate range for rejection sampling to avoid modulo bias
  const range = maxNumber;
  const maxValidValue = Math.floor(0xffffffff / range) * range;

  while (numbers.size < count) {
    const randomBytes = crypto.randomBytes(4);
    const randomValue = randomBytes.readUInt32BE(0);

    // Rejection sampling: only accept values within valid range
    if (randomValue < maxValidValue) {
      const randomNumber = (randomValue % range) + 1;
      numbers.add(randomNumber);
    }
  }

  return Array.from(numbers).sort((a, b) => a - b);
}

// Main draw execution
export async function executeDraw(drawId: string) {
  return await prisma.$transaction(async (tx) => {
    // Get draw with lottery config
    const draw = await tx.draw.findUnique({
      where: { id: drawId },
      include: {
        lottery: true,
        tickets: { where: { status: "active" } },
      },
    });

    if (!draw) throw new Error("Draw not found");
    if (draw.status === "completed") throw new Error("Draw already completed");

    // Generate winning numbers
    const numberCount = draw.lottery.numbersCount || 5;
    const maxNumber = draw.lottery.numbersMax || 36;
    const winningNumbers = generateWinningNumbers(numberCount, maxNumber);

    console.log(`🎲 Winning numbers: ${winningNumbers.join(", ")}`);

    // Find winners and calculate matches
    const ticketResults = await findWinners(tx, draw.tickets, winningNumbers);

    // Check if jackpot was won
    const jackpotWon = ticketResults.some((t) => t.matches === numberCount);

    // Update draw
    await tx.draw.update({
      where: { id: drawId },
      data: {
        status: "completed",
        winningNumbers,
        jackpotWon,
        completedAt: new Date(),
        totalTickets: draw.tickets.length,
      },
    });

    // Distribute prizes
    await distributePrizes(tx, draw, ticketResults, winningNumbers);

    // Handle jackpot rollover if not won
    if (!jackpotWon) {
      await handleJackpotRollover(
        tx,
        draw.lottery.id,
        draw.prizePoolSnapshot || 0,
      );
    }

    return { winningNumbers, jackpotWon, totalTickets: draw.tickets.length };
  });
}

// Find winners and calculate matches for each ticket
async function findWinners(
  tx: Prisma.TransactionClient,
  tickets: Record<string, unknown>[],
  winningNumbers: number[],
) {
  const results = [];

  for (const ticket of tickets) {
    const ticketNumbers = ticket.numbers as number[];
    const matchedNumbers = ticketNumbers.filter((n) =>
      winningNumbers.includes(n),
    );
    const matches = matchedNumbers.length;

    // Determine tier and if won (2+ matches)
    const won = matches >= 2;
    const tier = getTier(matches);

    results.push({
      ticketId: ticket.id as string,
      userId: ticket.userId as string,
      matches,
      matchedNumbers,
      won,
      tier,
    });

    // Update ticket status
    await tx.ticket.update({
      where: { id: ticket.id as string },
      data: {
        status: won ? "won" : "lost",
        matchedNumbers: matches,
      },
    });
  }

  return results;
}

function getTier(matches: number): string | null {
  const tiers: Record<number, string> = {
    5: "jackpot",
    4: "second",
    3: "third",
    2: "fourth",
  };
  return tiers[matches] || null;
}

export { findWinners, getTier };
