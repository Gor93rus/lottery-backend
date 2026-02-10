import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";

const router = Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * /api/admin/finance/summary:
 *   get:
 *     summary: Get financial summary
 *     tags: [Admin - Finance]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Financial summary data
 */
router.get("/summary", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const whereClause =
      Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const gmvResult = await prisma.transaction.aggregate({
      where: {
        ...whereClause,
        type: "DEPOSIT",
        status: "COMPLETED",
      },
      _sum: { amount: true },
      _count: true,
    });

    const payoutsResult = await prisma.transaction.aggregate({
      where: {
        ...whereClause,
        type: "PAYOUT",
        status: "COMPLETED",
      },
      _sum: { amount: true },
      _count: true,
    });

    const pendingPayouts = await prisma.transaction.aggregate({
      where: {
        type: "PAYOUT",
        status: "PENDING",
      },
      _sum: { amount: true },
      _count: true,
    });

    const failedTransactions = await prisma.transaction.count({
      where: {
        ...whereClause,
        status: "FAILED",
      },
    });

    const uniquePayers = await prisma.transaction.groupBy({
      by: ["userId"],
      where: {
        ...whereClause,
        type: "DEPOSIT",
        status: "COMPLETED",
      },
    });

    const PLATFORM_FEE_PERCENT = 10;
    const gmv = gmvResult._sum.amount || 0;
    const platformRevenue = gmv * (PLATFORM_FEE_PERCENT / 100);

    res.json({
      success: true,
      data: {
        gmv: {
          total: gmv,
          count: gmvResult._count,
          currency: "TON",
        },
        revenue: {
          total: platformRevenue,
          feePercent: PLATFORM_FEE_PERCENT,
          currency: "TON",
        },
        payouts: {
          completed: {
            total: payoutsResult._sum.amount || 0,
            count: payoutsResult._count,
          },
          pending: {
            total: pendingPayouts._sum.amount || 0,
            count: pendingPayouts._count,
          },
        },
        failedTransactions,
        uniquePayers: uniquePayers.length,
        period: {
          startDate: startDate || "all time",
          endDate: endDate || "now",
        },
      },
    });
  } catch (error) {
    console.error("Finance summary error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch finance summary" });
  }
});

/**
 * @swagger
 * /api/admin/finance/transactions:
 *   get:
 *     summary: Get transaction list with filters
 *     tags: [Admin - Finance]
 *     responses:
 *       200:
 *         description: Paginated transaction list
 */
router.get(
  "/transactions",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const {
        page = "1",
        limit = "50",
        type,
        status,
        userId,
        startDate,
        endDate,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      const take = parseInt(limit as string);

      const where: any = {};
      if (type) where.type = type;
      if (status) where.status = status;
      if (userId) where.userId = parseInt(userId as string);
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          skip,
          take,
          orderBy: { [sortBy as string]: sortOrder },
          include: {
            user: {
              select: {
                id: true,
                telegramId: true,
                username: true,
                firstName: true,
              },
            },
          },
        }),
        prisma.transaction.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            page: parseInt(page as string),
            limit: take,
            total,
            totalPages: Math.ceil(total / take),
          },
        },
      });
    } catch (error) {
      console.error("Transactions list error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch transactions" });
    }
  },
);

/**
 * @swagger
 * /api/admin/finance/revenue:
 *   get:
 *     summary: Get revenue aggregated by period
 *     tags: [Admin - Finance]
 *     responses:
 *       200:
 *         description: Revenue data grouped by time period
 */
router.get("/revenue", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, period = "day" } = req.query;

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const transactions = await prisma.transaction.findMany({
      where: {
        type: "DEPOSIT",
        status: "COMPLETED",
        ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
      },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    const grouped: Record<string, number> = {};

    transactions.forEach((tx) => {
      const date = tx.createdAt;
      let key: string;

      switch (period) {
        case "week": {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split("T")[0];
          break;
        }
        case "month": {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          break;
        }
        default: {
          // day
          key = date.toISOString().split("T")[0];
        }
      }

      grouped[key] = (grouped[key] || 0) + (tx.amount || 0);
    });

    const data = Object.entries(grouped).map(([period, revenue]) => ({
      period,
      revenue,
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error("Revenue aggregation error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to aggregate revenue" });
  }
});

/**
 * @swagger
 * /api/admin/finance/export:
 *   get:
 *     summary: Export transactions as CSV or JSON
 *     tags: [Admin - Finance]
 *     responses:
 *       200:
 *         description: Exported transaction data
 */
router.get("/export", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { format = "csv", type, status, startDate, endDate } = req.query;

    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        user: {
          select: {
            username: true,
            telegramId: true,
          },
        },
      },
    });

    if (format === "csv") {
      const headers = [
        "ID",
        "Date",
        "Type",
        "Status",
        "Amount (TON)",
        "User ID",
        "Username",
        "Telegram ID",
        "TX Hash",
      ].join(",");

      const rows = transactions.map((tx) =>
        [
          tx.id,
          tx.createdAt.toISOString(),
          tx.type,
          tx.status,
          tx.amount || 0,
          tx.userId,
          tx.user?.username || "",
          tx.user?.telegramId || "",
          tx.txHash || "",
        ].join(","),
      );

      const csv = [headers, ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="transactions_${Date.now()}.csv"`,
      );
      res.send(csv);
    } else {
      res.json({ success: true, data: transactions });
    }
  } catch (error) {
    console.error("Export error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to export transactions" });
  }
});

/**
 * @swagger
 * /api/admin/finance/reconciliation:
 *   get:
 *     summary: Check database integrity
 *     tags: [Admin - Finance]
 *     responses:
 *       200:
 *         description: Reconciliation report
 */
router.get(
  "/reconciliation",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const missingTxHash = await prisma.transaction.count({
        where: {
          type: "DEPOSIT",
          status: "COMPLETED",
          txHash: null,
        },
      });

      const duplicateTxHash = await prisma.transaction.groupBy({
        by: ["txHash"],
        where: {
          txHash: { not: null },
        },
        _count: true,
        having: {
          txHash: { _count: { gt: 1 } },
        },
      });

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const stuckTransactions = await prisma.transaction.count({
        where: {
          status: "PENDING",
          createdAt: { lt: oneHourAgo },
        },
      });

      const status =
        missingTxHash === 0 &&
        duplicateTxHash.length === 0 &&
        stuckTransactions === 0
          ? "OK"
          : "NEEDS_ATTENTION";

      res.json({
        success: true,
        data: {
          status,
          issues: {
            missingTxHash,
            duplicateTxHash: duplicateTxHash.length,
            stuckTransactions,
          },
        },
      });
    } catch (error) {
      console.error("Reconciliation error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to run reconciliation" });
    }
  },
);

/**
 * @swagger
 * /api/admin/finance/top-users:
 *   get:
 *     summary: Get top users by spending
 *     tags: [Admin - Finance]
 *     responses:
 *       200:
 *         description: List of top spenders
 */
router.get(
  "/top-users",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { limit = "10" } = req.query;

      const topUsers = await prisma.transaction.groupBy({
        by: ["userId"],
        where: {
          type: "DEPOSIT",
          status: "COMPLETED",
        },
        _sum: {
          amount: true,
        },
        _count: true,
        orderBy: {
          _sum: {
            amount: "desc",
          },
        },
        take: parseInt(limit as string),
      });

      const userIds = topUsers.map((u) => u.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          username: true,
          firstName: true,
          telegramId: true,
        },
      });

      const data = topUsers.map((tu) => {
        const user = users.find((u) => u.id === tu.userId);
        return {
          userId: tu.userId,
          username: user?.username,
          firstName: user?.firstName,
          telegramId: user?.telegramId,
          totalSpent: tu._sum.amount || 0,
          transactionCount: tu._count,
        };
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error("Top users error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch top users" });
    }
  },
);

export default router;
