import { Router, Request, Response } from "express";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

/**
 * GET /api/admin/dashboard
 * Main dashboard statistics
 */
router.get("/", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalTickets,
      totalRevenue,
      totalPayouts,
      todayTickets,
      todayRevenue,
    ] = await Promise.all([
      // Total users
      prisma.user.count(),

      // Active users (last 7 days)
      prisma.user.count({
        where: {
          lastActiveAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      // Total tickets
      prisma.ticket.count(),

      // Total revenue from ticket sales
      prisma.transaction
        .aggregate({
          where: {
            type: "ticket_purchase",
            status: "confirmed",
          },
          _sum: {
            tonAmount: true,
          },
        })
        .then((result) => result._sum.tonAmount || 0),

      // Total payouts
      prisma.payout
        .aggregate({
          where: {
            status: "completed",
          },
          _sum: {
            amount: true,
          },
        })
        .then((result) => result._sum.amount || 0),

      // Today's tickets
      prisma.ticket.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),

      // Today's revenue
      prisma.transaction
        .aggregate({
          where: {
            type: "ticket_purchase",
            status: "confirmed",
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
          _sum: {
            tonAmount: true,
          },
        })
        .then((result) => result._sum.tonAmount || 0),
    ]);

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
        },
        tickets: {
          total: totalTickets,
          today: todayTickets,
        },
        revenue: {
          total: totalRevenue,
          today: todayRevenue,
        },
        payouts: {
          total: totalPayouts,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch dashboard statistics",
    });
  }
});

/**
 * GET /api/admin/dashboard/revenue
 * Revenue statistics by period with chart data
 */
router.get("/revenue", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { period = "7d" } = req.query;

    let daysCount = 7;
    if (period === "30d") daysCount = 30;
    else if (period === "90d") daysCount = 90;

    const startDate = new Date(Date.now() - daysCount * 24 * 60 * 60 * 1000);

    // Get daily revenue data
    const transactions = await prisma.transaction.findMany({
      where: {
        type: "ticket_purchase",
        status: "confirmed",
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        createdAt: true,
        tonAmount: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Group by date
    const revenueByDate: Record<string, number> = {};
    transactions.forEach((tx) => {
      const dateKey = tx.createdAt.toISOString().split("T")[0];
      revenueByDate[dateKey] = (revenueByDate[dateKey] || 0) + tx.tonAmount;
    });

    // Fill in missing dates
    const chartData = [];
    for (let i = 0; i < daysCount; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split("T")[0];
      chartData.push({
        date: dateKey,
        revenue: revenueByDate[dateKey] || 0,
      });
    }

    // Calculate totals
    const totalRevenue = Object.values(revenueByDate).reduce(
      (sum, val) => sum + val,
      0,
    );
    const avgDailyRevenue = totalRevenue / daysCount;

    res.json({
      success: true,
      period,
      data: {
        total: totalRevenue,
        average: avgDailyRevenue,
        chart: chartData,
      },
    });
  } catch (error) {
    console.error("Dashboard revenue error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch revenue statistics",
    });
  }
});

/**
 * GET /api/admin/dashboard/activity
 * User activity statistics
 */
router.get(
  "/activity",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const now = new Date();
      const today = new Date(now.setHours(0, 0, 0, 0));
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        activeToday,
        activeYesterday,
        active7Days,
        active30Days,
        newUsersToday,
        newUsers7Days,
        newUsers30Days,
      ] = await Promise.all([
        prisma.user.count({
          where: { lastActiveAt: { gte: today } },
        }),
        prisma.user.count({
          where: {
            lastActiveAt: {
              gte: yesterday,
              lt: today,
            },
          },
        }),
        prisma.user.count({
          where: { lastActiveAt: { gte: last7Days } },
        }),
        prisma.user.count({
          where: { lastActiveAt: { gte: last30Days } },
        }),
        prisma.user.count({
          where: { createdAt: { gte: today } },
        }),
        prisma.user.count({
          where: { createdAt: { gte: last7Days } },
        }),
        prisma.user.count({
          where: { createdAt: { gte: last30Days } },
        }),
      ]);

      res.json({
        success: true,
        activity: {
          activeUsers: {
            today: activeToday,
            yesterday: activeYesterday,
            last7Days: active7Days,
            last30Days: active30Days,
          },
          newUsers: {
            today: newUsersToday,
            last7Days: newUsers7Days,
            last30Days: newUsers30Days,
          },
        },
      });
    } catch (error) {
      console.error("Dashboard activity error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to fetch activity statistics",
      });
    }
  },
);

export default router;
