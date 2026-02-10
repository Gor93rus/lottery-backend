import { Router, Request, Response } from "express";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

/**
 * GET /api/admin/stats
 * Get dashboard statistics
 */
router.get("/", adminMiddleware, async (req: Request, res: Response) => {
  try {
    // Get total users
    const totalUsers = await prisma.user.count();

    // Get total tickets
    const totalTickets = await prisma.ticket.count();

    // Get total revenue (sum of all ticket prices from confirmed transactions)
    const revenueData = await prisma.transaction.aggregate({
      where: {
        type: "ticket_purchase",
        status: "confirmed",
      },
      _sum: {
        tonAmount: true,
      },
    });
    const totalRevenue = revenueData._sum.tonAmount || 0;

    // Get active lotteries count
    const activeLotteries = await prisma.lottery.count({
      where: { active: true },
    });

    // Get pending draws (scheduled and in the future)
    const pendingDraws = await prisma.draw.count({
      where: {
        status: "scheduled",
        scheduledAt: { gt: new Date() },
      },
    });

    // Get today's tickets (tickets created today)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTickets = await prisma.ticket.count({
      where: {
        createdAt: { gte: startOfDay },
      },
    });

    // Get today's revenue
    const todayRevenueData = await prisma.transaction.aggregate({
      where: {
        type: "ticket_purchase",
        status: "confirmed",
        createdAt: { gte: startOfDay },
      },
      _sum: {
        tonAmount: true,
      },
    });
    const todayRevenue = todayRevenueData._sum.tonAmount || 0;

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalTickets,
        totalRevenue,
        activeLotteries,
        pendingDraws,
        todayTickets,
        todayRevenue,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch admin statistics",
    });
  }
});

export default router;
