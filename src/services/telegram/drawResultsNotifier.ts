import { prisma } from "../../lib/prisma.js";
import { telegramNotifications } from "./notificationService.js";

/**
 * Send personalized results to all participants after draw
 */
export async function notifyDrawResults(drawId: string): Promise<void> {
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: {
      lottery: true,
      tickets: {
        include: {
          user: {
            select: {
              id: true,
              telegramId: true,
              notifyDrawResults: true,
            },
          },
        },
      },
    },
  });

  if (!draw || !draw.winningNumbers) {
    console.error("Draw not found or no winning numbers:", drawId);
    return;
  }

  // Get next draw for "try again" message
  const nextDraw = await prisma.draw.findFirst({
    where: {
      lotteryId: draw.lotteryId,
      status: "scheduled",
      scheduledAt: { gt: new Date() },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // Group tickets by user
  const userTickets = new Map<string, typeof draw.tickets>();

  for (const ticket of draw.tickets) {
    if (
      !ticket.user ||
      !ticket.user.notifyDrawResults ||
      !ticket.user.telegramId
    )
      continue;

    const existing = userTickets.get(ticket.user.telegramId) || [];
    existing.push(ticket);
    userTickets.set(ticket.user.telegramId, existing);
  }

  // Send notifications to each user
  for (const [telegramId, tickets] of userTickets) {
    // Find best winning ticket
    const winningTicket = tickets
      .filter((t) => (t.matchedNumbers || 0) >= 2)
      .sort((a, b) => (b.matchedNumbers || 0) - (a.matchedNumbers || 0))[0];

    if (winningTicket) {
      // User won!
      await telegramNotifications.youWon(telegramId, {
        lotteryName: draw.lottery.name,
        drawNumber: draw.drawNumber,
        ticketNumbers: winningTicket.numbers as number[],
        winningNumbers: draw.winningNumbers as number[],
        matchedCount: winningTicket.matchedNumbers || 0,
        prizeAmount: winningTicket.prizeAmount || 0,
      });
    } else {
      // User lost - send for best ticket
      const bestTicket = tickets.sort(
        (a, b) => (b.matchedNumbers || 0) - (a.matchedNumbers || 0),
      )[0];

      // Calculate next jackpot (increases if not won, resets if won)
      const jackpotWon = draw.tickets.some((t) => t.matchedNumbers === 5);
      const calculatedNextJackpot = jackpotWon
        ? draw.lottery.baseJackpot || 500
        : draw.lottery.jackpot + 50;

      await telegramNotifications.youLost(telegramId, {
        lotteryName: draw.lottery.name,
        drawNumber: draw.drawNumber,
        ticketNumbers: bestTicket.numbers as number[],
        winningNumbers: draw.winningNumbers as number[],
        matchedCount: bestTicket.matchedNumbers || 0,
        nextDrawAt: nextDraw?.scheduledAt,
        nextJackpot: calculatedNextJackpot,
      });
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export default notifyDrawResults;
