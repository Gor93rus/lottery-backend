import { Router, Request, Response } from "express";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

/**
 * GET /api/admin/reports/daily
 * Daily statistics for last N days
 */
router.get("/daily", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { days = "30" } = req.query;
    const daysCount = parseInt(days as string, 10);

    if (daysCount < 1 || daysCount > 365) {
      res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Days must be between 1 and 365",
      });
      return;
    }

    const startDate = new Date(Date.now() - daysCount * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    // Get all relevant data
    const [tickets, transactions, users] = await Promise.all([
      prisma.ticket.findMany({
        where: {
          createdAt: { gte: startDate },
        },
        select: {
          createdAt: true,
        },
      }),
      prisma.transaction.findMany({
        where: {
          type: "ticket_purchase",
          status: "confirmed",
          createdAt: { gte: startDate },
        },
        select: {
          createdAt: true,
          tonAmount: true,
        },
      }),
      prisma.user.findMany({
        where: {
          createdAt: { gte: startDate },
        },
        select: {
          createdAt: true,
        },
      }),
    ]);

    // Group data by date
    const dailyStats: Record<
      string,
      { tickets: number; revenue: number; newUsers: number }
    > = {};

    // Initialize all dates
    for (let i = 0; i < daysCount; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split("T")[0];
      dailyStats[dateKey] = { tickets: 0, revenue: 0, newUsers: 0 };
    }

    // Aggregate tickets
    tickets.forEach((ticket) => {
      const dateKey = ticket.createdAt.toISOString().split("T")[0];
      if (dailyStats[dateKey]) {
        dailyStats[dateKey].tickets++;
      }
    });

    // Aggregate revenue
    transactions.forEach((tx) => {
      const dateKey = tx.createdAt.toISOString().split("T")[0];
      if (dailyStats[dateKey]) {
        dailyStats[dateKey].revenue += tx.tonAmount;
      }
    });

    // Aggregate new users
    users.forEach((user) => {
      const dateKey = user.createdAt.toISOString().split("T")[0];
      if (dailyStats[dateKey]) {
        dailyStats[dateKey].newUsers++;
      }
    });

    // Convert to array format
    const dailyData = Object.entries(dailyStats).map(([date, stats]) => ({
      date,
      tickets: stats.tickets,
      revenue: stats.revenue,
      newUsers: stats.newUsers,
    }));

    res.json({
      success: true,
      period: {
        days: daysCount,
        startDate: startDate.toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
      },
      data: dailyData,
    });
  } catch (error) {
    console.error("Admin daily report error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch daily report",
    });
  }
});

/**
 * GET /api/admin/reports/lottery/:id
 * Statistics by specific lottery
 */
router.get(
  "/lottery/:id",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idString = id as string;

      const lottery = await prisma.lottery.findUnique({
        where: { id: idString },
      });

      if (!lottery) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Lottery not found",
        });
        return;
      }

      const [
        totalTickets,
        totalDraws,
        completedDraws,
        totalRevenue,
        totalPaidOut,
        recentTickets,
        fund,
      ] = await Promise.all([
        // Total tickets
        prisma.ticket.count({
          where: { lotteryId: idString },
        }),

        // Total draws
        prisma.draw.count({
          where: { lotteryId: idString },
        }),

        // Completed draws
        prisma.draw.count({
          where: {
            lotteryId: idString,
            status: "completed",
          },
        }),

        // Total revenue (tickets sold)
        prisma.ticket
          .aggregate({
            where: {
              lotteryId: idString,
              status: { not: "pending" },
            },
            _sum: {
              price: true,
            },
          })
          .then((result) => result._sum?.price || 0),

        // Total paid out
        prisma.payout
          .aggregate({
            where: {
              ticket: {
                lotteryId: idString,
              },
              status: "completed",
            },
            _sum: {
              amount: true,
            },
          })
          .then((result) => result._sum?.amount || 0),

        // Recent ticket sales (last 30 days)
        prisma.ticket.count({
          where: {
            lotteryId: idString,
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        }),

        // Fund info
        prisma.lotteryFund.findFirst({
          where: { lotteryId: idString },
        }),
      ]);

      res.json({
        success: true,
        lottery: {
          id: lottery.id,
          slug: lottery.slug,
          name: lottery.name,
          active: lottery.active,
        },
        stats: {
          tickets: {
            total: totalTickets,
            last30Days: recentTickets,
          },
          draws: {
            total: totalDraws,
            completed: completedDraws,
          },
          revenue: {
            total: totalRevenue,
          },
          payouts: {
            total: totalPaidOut,
          },
          fund: fund
            ? {
                currency: fund.currency,
                totalCollected: fund.totalCollected,
                jackpotPool: fund.jackpotPool,
                reservePool: fund.reservePool,
              }
            : null,
        },
      });
    } catch (error) {
      console.error("Admin lottery report error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to fetch lottery report",
      });
    }
  },
);

/**
 * GET /api/admin/reports/conversion
 * Conversion funnel statistics
 */
router.get(
  "/conversion",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const [
        totalUsers,
        usersWithWallet,
        usersWithTickets,
        usersWithWins,
        repeatBuyers,
      ] = await Promise.all([
        // Total users
        prisma.user.count(),

        // Users with connected wallet
        prisma.user.count({
          where: {
            tonWallet: { not: null },
          },
        }),

        // Users who purchased tickets
        prisma.user.count({
          where: {
            tickets: {
              some: {},
            },
          },
        }),

        // Users who won prizes
        prisma.user.count({
          where: {
            tickets: {
              some: {
                status: "won",
              },
            },
          },
        }),

        // Users with 2+ tickets (repeat buyers)
        prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint as count
        FROM (
          SELECT "userId"
          FROM "Ticket"
          WHERE "userId" IS NOT NULL
          GROUP BY "userId"
          HAVING COUNT(*) >= 2
        ) AS repeat_users
      `.then((result) => (result.length > 0 ? Number(result[0].count) : 0)),
      ]);

      // Calculate conversion rates
      const walletConversion =
        totalUsers > 0 ? (usersWithWallet / totalUsers) * 100 : 0;
      const ticketConversion =
        usersWithWallet > 0 ? (usersWithTickets / usersWithWallet) * 100 : 0;
      const winConversion =
        usersWithTickets > 0 ? (usersWithWins / usersWithTickets) * 100 : 0;
      const repeatRate =
        usersWithTickets > 0 ? (repeatBuyers / usersWithTickets) * 100 : 0;

      res.json({
        success: true,
        funnel: [
          {
            stage: "registered",
            count: totalUsers,
            percentage: 100,
            conversionFromPrevious: null,
          },
          {
            stage: "walletConnected",
            count: usersWithWallet,
            percentage: walletConversion,
            conversionFromPrevious: walletConversion,
          },
          {
            stage: "purchasedTickets",
            count: usersWithTickets,
            percentage:
              totalUsers > 0 ? (usersWithTickets / totalUsers) * 100 : 0,
            conversionFromPrevious: ticketConversion,
          },
          {
            stage: "wonPrizes",
            count: usersWithWins,
            percentage: totalUsers > 0 ? (usersWithWins / totalUsers) * 100 : 0,
            conversionFromPrevious: winConversion,
          },
          {
            stage: "repeatBuyers",
            count: repeatBuyers,
            percentage: totalUsers > 0 ? (repeatBuyers / totalUsers) * 100 : 0,
            conversionFromPrevious: repeatRate,
          },
        ],
      });
    } catch (error) {
      console.error("Admin conversion report error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to fetch conversion report",
      });
    }
  },
);

/**
 * GET /api/admin/reports/export
 * Export data as CSV
 */
router.get("/export", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { type = "users", startDate, endDate } = req.query;

    let csvData = "";

    if (type === "users") {
      const users = await prisma.user.findMany({
        where: {
          ...(startDate && endDate
            ? {
                createdAt: {
                  gte: new Date(startDate as string),
                  lte: new Date(endDate as string),
                },
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      csvData =
        "ID,Telegram ID,Username,First Name,Last Name,Balance,Total Spent,Total Won,Level,Streak,Created At\n";
      users.forEach((user) => {
        csvData += `${user.id},${user.telegramId},"${user.username || ""}","${user.firstName || ""}","${user.lastName || ""}",${user.balance},${user.totalSpent},${user.totalWon},${user.level},${user.streak},${user.createdAt.toISOString()}\n`;
      });
    } else if (type === "tickets") {
      const tickets = await prisma.ticket.findMany({
        where: {
          ...(startDate && endDate
            ? {
                createdAt: {
                  gte: new Date(startDate as string),
                  lte: new Date(endDate as string),
                },
              }
            : {}),
        },
        include: {
          lottery: {
            select: { name: true },
          },
          user: {
            select: { telegramId: true, username: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10000,
      });

      csvData =
        "ID,Lottery,User Telegram ID,User Username,Numbers,Status,Prize Amount,Created At\n";
      tickets.forEach((ticket) => {
        csvData += `${ticket.id},"${ticket.lottery.name}",${ticket.user?.telegramId || ""},"${ticket.user?.username || ""}","${ticket.numbers.join(" ")}",${ticket.status},${ticket.prizeAmount},${ticket.createdAt.toISOString()}\n`;
      });
    } else if (type === "transactions") {
      const transactions = await prisma.transaction.findMany({
        where: {
          ...(startDate && endDate
            ? {
                createdAt: {
                  gte: new Date(startDate as string),
                  lte: new Date(endDate as string),
                },
              }
            : {}),
        },
        include: {
          user: {
            select: { telegramId: true, username: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10000,
      });

      csvData =
        "ID,User Telegram ID,User Username,Type,Amount,Status,Created At\n";
      transactions.forEach((tx) => {
        csvData += `${tx.id},${tx.user.telegramId},"${tx.user.username || ""}",${tx.type},${tx.tonAmount},${tx.status},${tx.createdAt.toISOString()}\n`;
      });
    } else {
      res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Invalid export type. Use: users, tickets, or transactions",
      });
      return;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${type}-export-${new Date().toISOString().split("T")[0]}.csv"`,
    );
    res.send(csvData);
  } catch (error) {
    console.error("Admin export error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to export data",
    });
  }
});

/**
 * GET /api/admin/reports/revenue-chart
 * Revenue chart data for specified period
 */
router.get(
  "/revenue-chart",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { period = "30d" } = req.query;

      let days = 30;
      if (period === "7d") days = 7;
      else if (period === "90d") days = 90;
      else if (period === "365d") days = 365;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      // Get daily revenue
      const transactions = await prisma.transaction.findMany({
        where: {
          type: "ticket_purchase",
          status: "confirmed",
          createdAt: { gte: startDate },
        },
        select: {
          createdAt: true,
          tonAmount: true,
        },
      });

      // Group by date
      const revenueByDate: Record<string, number> = {};

      // Initialize all dates with 0
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split("T")[0];
        revenueByDate[dateKey] = 0;
      }

      // Sum revenue by date
      transactions.forEach((tx) => {
        const dateKey = tx.createdAt.toISOString().split("T")[0];
        if (revenueByDate[dateKey] !== undefined) {
          revenueByDate[dateKey] += tx.tonAmount;
        }
      });

      // Convert to array format for charts
      const chartData = Object.entries(revenueByDate).map(
        ([date, revenue]) => ({
          date,
          revenue: Math.round(revenue * 100) / 100,
        }),
      );

      // Calculate totals
      const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0);
      const avgRevenue = totalRevenue / days;

      res.json({
        success: true,
        period,
        days,
        data: chartData,
        summary: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          avgDailyRevenue: Math.round(avgRevenue * 100) / 100,
          maxRevenue: Math.max(...chartData.map((d) => d.revenue)),
          minRevenue: Math.min(...chartData.map((d) => d.revenue)),
        },
      });
    } catch (error) {
      console.error("Revenue chart error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to generate chart data" });
    }
  },
);

/**
 * GET /api/admin/reports/users-chart
 * User registration chart data
 */
router.get(
  "/users-chart",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { period = "30d" } = req.query;

      let days = 30;
      if (period === "7d") days = 7;
      else if (period === "90d") days = 90;
      else if (period === "365d") days = 365;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const users = await prisma.user.findMany({
        where: {
          createdAt: { gte: startDate },
        },
        select: {
          createdAt: true,
        },
      });

      // Group by date
      const usersByDate: Record<string, number> = {};

      for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split("T")[0];
        usersByDate[dateKey] = 0;
      }

      users.forEach((user) => {
        const dateKey = user.createdAt.toISOString().split("T")[0];
        if (usersByDate[dateKey] !== undefined) {
          usersByDate[dateKey]++;
        }
      });

      const chartData = Object.entries(usersByDate).map(([date, count]) => ({
        date,
        newUsers: count,
      }));

      const totalNewUsers = chartData.reduce((sum, d) => sum + d.newUsers, 0);

      res.json({
        success: true,
        period,
        days,
        data: chartData,
        summary: {
          totalNewUsers,
          avgDailyUsers: Math.round((totalNewUsers / days) * 100) / 100,
        },
      });
    } catch (error) {
      console.error("Users chart error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to generate chart data" });
    }
  },
);

/**
 * GET /api/admin/reports/tickets-chart
 * Ticket sales chart data
 */
router.get(
  "/tickets-chart",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { period = "30d" } = req.query;

      let days = 30;
      if (period === "7d") days = 7;
      else if (period === "90d") days = 90;
      else if (period === "365d") days = 365;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const tickets = await prisma.ticket.findMany({
        where: {
          createdAt: { gte: startDate },
        },
        select: {
          createdAt: true,
        },
      });

      const ticketsByDate: Record<string, number> = {};

      for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split("T")[0];
        ticketsByDate[dateKey] = 0;
      }

      tickets.forEach((ticket) => {
        const dateKey = ticket.createdAt.toISOString().split("T")[0];
        if (ticketsByDate[dateKey] !== undefined) {
          ticketsByDate[dateKey]++;
        }
      });

      const chartData = Object.entries(ticketsByDate).map(([date, count]) => ({
        date,
        tickets: count,
      }));

      const totalTickets = chartData.reduce((sum, d) => sum + d.tickets, 0);

      res.json({
        success: true,
        period,
        days,
        data: chartData,
        summary: {
          totalTickets,
          avgDailyTickets: Math.round((totalTickets / days) * 100) / 100,
        },
      });
    } catch (error) {
      console.error("Tickets chart error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to generate chart data" });
    }
  },
);

/**
 * GET /api/admin/reports/overview
 * Comprehensive overview report
 */
router.get(
  "/overview",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);

      const [
        totalUsers,
        todayUsers,
        weekUsers,
        monthUsers,
        totalTickets,
        todayTickets,
        weekTickets,
        monthTickets,
        totalRevenue,
        todayRevenue,
        weekRevenue,
        monthRevenue,
        totalPayouts,
        pendingPayouts,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
        prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
        prisma.ticket.count(),
        prisma.ticket.count({ where: { createdAt: { gte: today } } }),
        prisma.ticket.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.ticket.count({ where: { createdAt: { gte: monthAgo } } }),
        prisma.transaction.aggregate({
          where: { type: "ticket_purchase", status: "confirmed" },
          _sum: { tonAmount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            type: "ticket_purchase",
            status: "confirmed",
            createdAt: { gte: today },
          },
          _sum: { tonAmount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            type: "ticket_purchase",
            status: "confirmed",
            createdAt: { gte: weekAgo },
          },
          _sum: { tonAmount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            type: "ticket_purchase",
            status: "confirmed",
            createdAt: { gte: monthAgo },
          },
          _sum: { tonAmount: true },
        }),
        prisma.payout.aggregate({
          where: { status: "completed" },
          _sum: { amount: true },
        }),
        prisma.payout.aggregate({
          where: { status: "pending" },
          _sum: { amount: true },
        }),
      ]);

      res.json({
        success: true,
        overview: {
          users: {
            total: totalUsers,
            today: todayUsers,
            week: weekUsers,
            month: monthUsers,
          },
          tickets: {
            total: totalTickets,
            today: todayTickets,
            week: weekTickets,
            month: monthTickets,
          },
          revenue: {
            total: totalRevenue._sum.tonAmount || 0,
            today: todayRevenue._sum.tonAmount || 0,
            week: weekRevenue._sum.tonAmount || 0,
            month: monthRevenue._sum.tonAmount || 0,
          },
          payouts: {
            total: totalPayouts._sum.amount || 0,
            pending: pendingPayouts._sum.amount || 0,
          },
        },
      });
    } catch (error) {
      console.error("Overview report error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to generate overview" });
    }
  },
);

export default router;
