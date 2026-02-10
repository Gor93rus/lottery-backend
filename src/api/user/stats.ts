import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { unifiedAuthMiddleware } from "../../lib/auth/unifiedAuth.js";
import { cache } from "../../lib/cache/redis.js";
import { CacheTTL } from "../../middleware/cache.js";

const router = Router();

// GET /api/user/stats
router.get(
  "/stats",
  unifiedAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: "Not authenticated" });
        return;
      }

      // Try to get from cache
      const cacheKey = `user:stats:${req.user.userId}`;
      const cached = await cache.get<unknown>(cacheKey);
      if (cached) {
        res.setHeader("X-Cache", "HIT");
        res.json(cached);
        return;
      }

      // Fetch user data for streak and timestamps
      const userData = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: {
          streak: true,
          createdAt: true,
          lastActiveAt: true,
        },
      });

      // Optimized query: get tickets with only needed fields
      const tickets = await prisma.ticket.findMany({
        where: { userId: req.user.userId },
        select: {
          status: true,
          price: true,
          prizeAmount: true,
          numbers: true,
          draw: {
            select: {
              lottery: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      const totalTicketsBought = tickets.length;
      const totalSpent = tickets.reduce((sum, t) => sum + (t.price || 0), 0);
      const wonTickets = tickets.filter((t) => t.status === "won");
      const totalWins = wonTickets.length;
      const totalWinnings = wonTickets.reduce(
        (sum, t) => sum + (t.prizeAmount || 0),
        0,
      );
      const biggestWin = Math.max(
        ...wonTickets.map((t) => t.prizeAmount || 0),
        0,
      );

      // Calculate favorite numbers
      const numberCounts: Record<number, number> = {};
      tickets.forEach((t) => {
        const nums = t.numbers as number[];
        nums.forEach((n) => {
          numberCounts[n] = (numberCounts[n] || 0) + 1;
        });
      });
      const favoriteNumbers = Object.entries(numberCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([n]) => parseInt(n));

      const response = {
        success: true,
        stats: {
          totalTicketsBought,
          totalSpent,
          totalWins,
          totalWinnings,
          netProfit: totalWinnings - totalSpent,
          currency: "TON",
          biggestWin,
          currentStreak: userData?.streak || 0,
          winRate:
            totalTicketsBought > 0
              ? parseFloat(((totalWins / totalTicketsBought) * 100).toFixed(2))
              : 0,
          favoriteNumbers,
          memberSince: userData?.createdAt || new Date(),
          lastActivity:
            userData?.lastActiveAt || userData?.createdAt || new Date(),
        },
      };

      // Cache the response
      await cache.set(cacheKey, response, CacheTTL.USER_DATA);
      res.setHeader("X-Cache", "MISS");
      res.setHeader("Cache-Control", `private, max-age=${CacheTTL.USER_DATA}`);

      res.json(response);
    } catch (error) {
      console.error("Get user stats error:", error);
      res.status(500).json({ success: false, error: "Failed to get stats" });
    }
  },
);

// GET /api/user/history
router.get(
  "/history",
  unifiedAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: "Not authenticated" });
        return;
      }

      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const type = req.query.type as string;
      const lotterySlug = req.query.lotterySlug as string;

      const where: Record<string, unknown> = { userId: req.user.userId };

      if (type === "win") {
        where.status = "won";
      } else if (type === "purchase") {
        where.status = { not: "won" };
      }

      if (lotterySlug) {
        where.lotterySlug = lotterySlug;
      }

      const [tickets, total] = await Promise.all([
        prisma.ticket.findMany({
          where,
          // Optimize: select only needed fields
          select: {
            id: true,
            status: true,
            numbers: true,
            price: true,
            currency: true,
            prizeAmount: true,
            createdAt: true,
            lotterySlug: true,
            draw: {
              select: {
                drawNumber: true,
                drawTime: true,
                lottery: {
                  select: {
                    slug: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.ticket.count({ where }),
      ]);

      res.json({
        success: true,
        history: tickets.map((t) => ({
          id: t.id,
          type: t.status === "won" ? "win" : "purchase",
          lotterySlug: t.draw?.lottery.slug || t.lotterySlug,
          lotteryName: t.draw?.lottery.name || "",
          drawNumber: t.draw?.drawNumber || 0,
          numbers: t.numbers,
          amount: t.price,
          currency: t.currency || "TON",
          status: t.status.toUpperCase(),
          prize: t.prizeAmount || 0,
          createdAt: t.createdAt,
          drawTime: t.draw?.drawTime || null,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get user history error:", error);
      res.status(500).json({ success: false, error: "Failed to get history" });
    }
  },
);

export default router;
