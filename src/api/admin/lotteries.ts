import { Router, Request, Response } from "express";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

/**
 * GET /api/admin/lotteries
 * List all lotteries (active and inactive)
 */
router.get("/", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const lotteries = await prisma.lottery.findMany({
      orderBy: [
        { featured: "desc" },
        { active: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        _count: {
          select: {
            tickets: true,
            draws: true,
          },
        },
      },
    });

    res.json({
      success: true,
      lotteries: lotteries.map((lottery) => ({
        id: lottery.id,
        slug: lottery.slug,
        name: lottery.name,
        description: lottery.description,
        numbersCount: lottery.numbersCount,
        numbersMax: lottery.numbersMax,
        ticketPrice: lottery.ticketPrice,
        jackpot: lottery.jackpot,
        drawTime: lottery.drawTime,
        drawTimezone: lottery.drawTimezone,
        active: lottery.active,
        featured: lottery.featured,
        prizeStructure: lottery.prizeStructure,
        ticketsCount: lottery._count.tickets,
        drawsCount: lottery._count.draws,
        createdAt: lottery.createdAt.toISOString(),
        updatedAt: lottery.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Admin lotteries list error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch lotteries",
    });
  }
});

/**
 * POST /api/admin/lotteries
 * Create new lottery
 */
router.post("/", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      slug,
      name,
      description,
      numbersCount,
      numbersMax,
      ticketPrice,
      jackpot,
      drawTime,
      active,
      featured,
    } = req.body;

    // Validate required fields
    if (!slug || !name) {
      res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Slug and name are required",
      });
      return;
    }

    // Check if slug already exists
    const existingLottery = await prisma.lottery.findUnique({
      where: { slug },
    });

    if (existingLottery) {
      res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Lottery with this slug already exists",
      });
      return;
    }

    // Create lottery with fund and config
    const lottery = await prisma.lottery.create({
      data: {
        slug,
        name,
        description: description || null,
        numbersCount: numbersCount || 5,
        numbersMax: numbersMax || 36,
        ticketPrice: ticketPrice || 1,
        jackpot: jackpot || 500,
        drawTime: drawTime || "18:00",
        active: active !== undefined ? active : true,
        featured: featured !== undefined ? featured : false,
      },
    });

    // Create default fund
    await prisma.lotteryFund.create({
      data: {
        lotteryId: lottery.id,
        currency: lottery.currency,
      },
    });

    // Create default payout config
    await prisma.lotteryPayoutConfig.create({
      data: {
        lotteryId: lottery.id,
      },
    });

    res.status(201).json({
      success: true,
      lottery: {
        id: lottery.id,
        slug: lottery.slug,
        name: lottery.name,
        description: lottery.description,
        numbersCount: lottery.numbersCount,
        numbersMax: lottery.numbersMax,
        ticketPrice: lottery.ticketPrice,
        jackpot: lottery.jackpot,
        drawTime: lottery.drawTime,
        drawTimezone: lottery.drawTimezone,
        active: lottery.active,
        featured: lottery.featured,
        prizeStructure: lottery.prizeStructure,
        createdAt: lottery.createdAt.toISOString(),
        updatedAt: lottery.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Admin create lottery error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to create lottery",
    });
  }
});

/**
 * PUT /api/admin/lotteries/:id
 * Update lottery
 */
router.put("/:id", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idString = id as string;
    const {
      slug,
      name,
      description,
      numbersCount,
      numbersMax,
      ticketPrice,
      jackpot,
      drawTime,
      active,
      featured,
    } = req.body;

    // Check if lottery exists
    const existingLottery = await prisma.lottery.findUnique({
      where: { id: idString },
    });

    if (!existingLottery) {
      res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Lottery not found",
      });
      return;
    }

    // If slug is being changed, check it's not already in use
    if (slug && slug !== existingLottery.slug) {
      const slugInUse = await prisma.lottery.findUnique({
        where: { slug },
      });

      if (slugInUse) {
        res.status(409).json({
          success: false,
          error: "Conflict",
          message: "Lottery with this slug already exists",
        });
        return;
      }
    }

    // Update lottery
    const data: Record<string, unknown> = {};
    if (slug !== undefined) data.slug = slug;
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (numbersCount !== undefined) data.numbersCount = numbersCount;
    if (numbersMax !== undefined) data.numbersMax = numbersMax;
    if (ticketPrice !== undefined) data.ticketPrice = ticketPrice;
    if (jackpot !== undefined) data.jackpot = jackpot;
    if (drawTime !== undefined) data.drawTime = drawTime;
    if (active !== undefined) data.active = active;
    if (featured !== undefined) data.featured = featured;

    const lottery = await prisma.lottery.update({
      where: { id: idString },
      data,
    });

    res.json({
      success: true,
      lottery: {
        id: lottery.id,
        slug: lottery.slug,
        name: lottery.name,
        description: lottery.description,
        numbersCount: lottery.numbersCount,
        numbersMax: lottery.numbersMax,
        ticketPrice: lottery.ticketPrice,
        jackpot: lottery.jackpot,
        drawTime: lottery.drawTime,
        drawTimezone: lottery.drawTimezone,
        active: lottery.active,
        featured: lottery.featured,
        prizeStructure: lottery.prizeStructure,
        createdAt: lottery.createdAt.toISOString(),
        updatedAt: lottery.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Admin update lottery error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update lottery",
    });
  }
});

/**
 * DELETE /api/admin/lotteries/:id
 * Soft delete lottery (set active = false)
 */
router.delete("/:id", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idString = id as string;

    // Check if lottery exists
    const existingLottery = await prisma.lottery.findUnique({
      where: { id: idString },
    });

    if (!existingLottery) {
      res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Lottery not found",
      });
      return;
    }

    // Soft delete - set active to false
    const lottery = await prisma.lottery.update({
      where: { id: idString },
      data: { active: false },
    });

    res.json({
      success: true,
      message: "Lottery deactivated successfully",
      lottery: {
        id: lottery.id,
        slug: lottery.slug,
        name: lottery.name,
        active: lottery.active,
      },
    });
  } catch (error) {
    console.error("Admin delete lottery error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to delete lottery",
    });
  }
});

/**
 * GET /api/admin/lotteries/:id/config
 * Get lottery payout configuration
 */
router.get(
  "/:id/config",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idString = id as string;

      const config = await prisma.lotteryPayoutConfig.findUnique({
        where: { lotteryId: idString },
        include: {
          lottery: {
            select: {
              id: true,
              slug: true,
              name: true,
            },
          },
        },
      });

      if (!config) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Payout config not found for this lottery",
        });
        return;
      }

      res.json({
        success: true,
        config: {
          id: config.id,
          lottery: config.lottery,
          platformShare: config.platformShare,
          prizeShare: config.prizeShare,
          reserveShare: config.reserveShare,
          incomeShare: config.incomeShare,
          jackpotShare: config.jackpotShare,
          payoutShare: config.payoutShare,
          match5Share: config.match5Share,
          match4Share: config.match4Share,
          match3Share: config.match3Share,
          match2Share: config.match2Share,
          match1Fixed: config.match1Fixed,
          createdAt: config.createdAt.toISOString(),
          updatedAt: config.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      console.error("Admin get payout config error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to fetch payout config",
      });
    }
  },
);

/**
 * PUT /api/admin/lotteries/:id/config
 * Update lottery payout configuration
 */
router.put(
  "/:id/config",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idString = id as string;
      const {
        platformShare,
        prizeShare,
        reserveShare,
        incomeShare,
        jackpotShare,
        payoutShare,
        match4Share,
        match3Share,
        match2Share,
        match1Fixed,
      } = req.body;

      // Check if lottery exists
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

      // Check if config exists, create if not
      let config = await prisma.lotteryPayoutConfig.findUnique({
        where: { lotteryId: idString },
      });

      if (!config) {
        config = await prisma.lotteryPayoutConfig.create({
          data: { lotteryId: idString },
        });
      }

      // Update config
      const data: Record<string, unknown> = {};
      if (platformShare !== undefined) data.platformShare = platformShare;
      if (prizeShare !== undefined) data.prizeShare = prizeShare;
      if (reserveShare !== undefined) data.reserveShare = reserveShare;
      if (incomeShare !== undefined) data.incomeShare = incomeShare;
      if (jackpotShare !== undefined) data.jackpotShare = jackpotShare;
      if (payoutShare !== undefined) data.payoutShare = payoutShare;
      if (match4Share !== undefined) data.match4Share = match4Share;
      if (match3Share !== undefined) data.match3Share = match3Share;
      if (match2Share !== undefined) data.match2Share = match2Share;
      if (match1Fixed !== undefined) data.match1Fixed = match1Fixed;

      const updatedConfig = await prisma.lotteryPayoutConfig.update({
        where: { lotteryId: idString },
        data,
      });

      res.json({
        success: true,
        config: {
          id: updatedConfig.id,
          platformShare: updatedConfig.platformShare,
          prizeShare: updatedConfig.prizeShare,
          reserveShare: updatedConfig.reserveShare,
          incomeShare: updatedConfig.incomeShare,
          jackpotShare: updatedConfig.jackpotShare,
          payoutShare: updatedConfig.payoutShare,
          match5Share: updatedConfig.match5Share,
          match4Share: updatedConfig.match4Share,
          match3Share: updatedConfig.match3Share,
          match2Share: updatedConfig.match2Share,
          match1Fixed: updatedConfig.match1Fixed,
          updatedAt: updatedConfig.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      console.error("Admin update payout config error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to update payout config",
      });
    }
  },
);

export default router;
