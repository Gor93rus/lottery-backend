import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { optionalAuth } from "../../lib/auth/middleware.js";
import { cache } from "../../lib/cache/redis.js";
import { CacheTTL } from "../../middleware/cache.js";

const router = Router();

/**
 * @swagger
 * /api/lottery/list:
 *   get:
 *     summary: Get all active lotteries
 *     tags: [Lotteries]
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by active status
 *       - in: query
 *         name: featured
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by featured status
 *     responses:
 *       200:
 *         description: List of lotteries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 lotteries:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Lottery'
 */

/**
 * GET /api/lottery/list
 * Get list of active lotteries
 */
router.get("/", optionalAuth, async (req: Request, res: Response) => {
  try {
    const { active = "true", featured } = req.query;

    // Generate cache key based on query params
    const cacheKey = `lottery:list:active=${active}:featured=${featured || "any"}`;

    // Try to get from cache
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      res.json(cached);
      return;
    }

    const where: Record<string, unknown> = {};

    if (active === "true") {
      where.active = true;
    }

    if (featured === "true") {
      where.featured = true;
    }

    const lotteries = await prisma.lottery.findMany({
      where,
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      // Optimize: select only needed fields
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        numbersCount: true,
        numbersMax: true,
        ticketPrice: true,
        jackpot: true,
        active: true,
        featured: true,
        prizeStructure: true,
      },
    });

    // Get next draw for each lottery - optimized query
    const lotteriesWithDraws = await Promise.all(
      lotteries.map(async (lottery) => {
        const nextDraw = await prisma.draw.findFirst({
          where: {
            lotteryId: lottery.id,
            status: "scheduled",
            scheduledAt: { gte: new Date() },
          },
          orderBy: { scheduledAt: "asc" },
          // Optimize: select only needed fields
          select: {
            id: true,
            drawNumber: true,
            scheduledAt: true,
          },
        });

        return {
          ...lottery,
          nextDraw: nextDraw
            ? {
                id: nextDraw.id,
                drawNumber: nextDraw.drawNumber,
                scheduledAt: nextDraw.scheduledAt.toISOString(),
              }
            : null,
        };
      }),
    );

    const response = {
      success: true,
      lotteries: lotteriesWithDraws,
    };

    // Cache the response
    await cache.set(cacheKey, response, CacheTTL.LOTTERY_LIST);
    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", `public, max-age=${CacheTTL.LOTTERY_LIST}`);

    res.json(response);
  } catch (error) {
    console.error("Lottery list error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch lottery list",
    });
  }
});

export default router;
