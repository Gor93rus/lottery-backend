import cron from "node-cron";
import { prisma } from "../../lib/prisma.js";
import { telegramNotifications } from "../telegram/notificationService.js";

/**
 * Check for draws starting in ~1 hour and send reminders
 */
async function sendDrawReminders(): Promise<void> {
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  const oneHourFiveMinutes = new Date(now.getTime() + 65 * 60 * 1000);

  // Find draws scheduled in the next hour (with 5 min window)
  const upcomingDraws = await prisma.draw.findMany({
    where: {
      status: "scheduled",
      scheduledAt: {
        gte: oneHourFromNow,
        lte: oneHourFiveMinutes,
      },
    },
    include: {
      lottery: true,
    },
  });

  for (const draw of upcomingDraws) {
    console.log(`Sending reminders for draw ${draw.id}`);

    // Get all users with tickets for this draw
    const ticketsWithUsers = await prisma.ticket.findMany({
      where: { drawId: draw.id },
      include: {
        user: {
          select: {
            telegramId: true,
            notifyDrawReminder: true,
          },
        },
      },
    });

    // Group by user and count tickets
    const userTicketCounts = new Map<string, number>();
    for (const ticket of ticketsWithUsers) {
      if (
        ticket.user &&
        ticket.user.notifyDrawReminder &&
        ticket.user.telegramId
      ) {
        const count = userTicketCounts.get(ticket.user.telegramId) || 0;
        userTicketCounts.set(ticket.user.telegramId, count + 1);
      }
    }

    // Also notify users WITHOUT tickets (who have notifyDrawReminder enabled)
    // Fetch all users with notifications enabled and filter in-memory
    const allUsersWithReminders = await prisma.user.findMany({
      where: {
        notifyDrawReminder: true,
        telegramId: { not: null },
      },
      select: { telegramId: true },
    });

    // Add users who don't have tickets yet
    for (const user of allUsersWithReminders) {
      if (user.telegramId && !userTicketCounts.has(user.telegramId)) {
        userTicketCounts.set(user.telegramId, 0);
      }
    }

    // Send reminders
    for (const [telegramId, ticketCount] of userTicketCounts) {
      try {
        await telegramNotifications.drawReminder(telegramId, {
          lotteryName: draw.lottery.name,
          drawNumber: draw.drawNumber,
          scheduledAt: draw.scheduledAt,
          jackpot: draw.lottery.jackpot,
          ticketCount,
        });

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Failed to send reminder to ${telegramId}:`, error);
      }
    }

    console.log(`Sent ${userTicketCounts.size} reminders for draw ${draw.id}`);
  }
}

/**
 * Start the reminder scheduler
 * Runs every 5 minutes to check for upcoming draws
 */
export function startDrawReminderScheduler(): void {
  if (process.env.ENABLE_NOTIFICATIONS !== "true") {
    console.log(
      "Draw reminder scheduler disabled (ENABLE_NOTIFICATIONS !== true)",
    );
    return;
  }

  // Run every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      await sendDrawReminders();
    } catch (error) {
      console.error("Draw reminder scheduler error:", error);
    }
  });

  console.log("Draw reminder scheduler started");
}

export default startDrawReminderScheduler;
