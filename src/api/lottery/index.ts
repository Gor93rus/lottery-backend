import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

const router = Router();

// GET /api/lottery/list - Список всех активных лотерей
router.get("/list", async (_req, res) => {
  try {
    const lotteries = await prisma.lottery.findMany({
      where: { active: true },
      include: {
        draws: {
          where: { status: "scheduled" },
          orderBy: { scheduledAt: "asc" },
          take: 1,
        },
        _count: {
          select: { tickets: true },
        },
      },
    });

    const formattedLotteries = lotteries.map((lottery) => ({
      id: lottery.id,
      name: lottery.name,
      slug: lottery.slug,
      description: lottery.description,
      numbersCount: lottery.numbersCount,
      numbersMax: lottery.numbersMax,
      ticketPrice: lottery.ticketPrice.toString(),
      jackpot: lottery.jackpot.toString(),
      prizeStructure: lottery.prizeStructure,
      drawTime: lottery.drawTime,
      drawTimezone: lottery.drawTimezone,
      active: lottery.active,
      featured: lottery.featured,
      nextDraw: lottery.draws[0] || null,
      totalParticipants: lottery._count.tickets,
      createdAt: lottery.createdAt,
      updatedAt: lottery.updatedAt,
    }));

    res.json({
      success: true,
      lotteries: formattedLotteries,
    });
  } catch (error) {
    console.error("Error fetching lotteries:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch lotteries",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /api/lottery/:slug/info - Информация о конкретной лотерее
router.get("/:slug/info", async (req, res) => {
  try {
    const { slug } = req.params;

    const lottery = await prisma.lottery.findUnique({
      where: { slug },
      include: {
        draws: {
          where: { status: "scheduled" },
          orderBy: { scheduledAt: "asc" },
          take: 1,
        },
        _count: {
          select: { tickets: true },
        },
      },
    });

    if (!lottery) {
      return res.status(404).json({
        success: false,
        error: "Lottery not found",
      });
    }

    res.json({
      success: true,
      lottery: {
        id: lottery.id,
        name: lottery.name,
        slug: lottery.slug,
        description: lottery.description,
        numbersCount: lottery.numbersCount,
        numbersMax: lottery.numbersMax,
        ticketPrice: lottery.ticketPrice.toString(),
        jackpot: lottery.jackpot.toString(),
        prizeStructure: lottery.prizeStructure,
        drawTime: lottery.drawTime,
        drawTimezone: lottery.drawTimezone,
        active: lottery.active,
        featured: lottery.featured,
        nextDraw: lottery.draws[0] || null,
        totalParticipants: lottery._count.tickets,
        createdAt: lottery.createdAt,
        updatedAt: lottery.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching lottery:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch lottery",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
