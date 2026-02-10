import { Router, Request, Response } from "express";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

/**
 * GET /api/admin/funds
 * List all lottery funds with current balances
 */
router.get("/", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const funds = await prisma.lotteryFund.findMany({
      include: {
        lottery: {
          select: {
            id: true,
            slug: true,
            name: true,
            active: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      success: true,
      funds: funds.map((fund) => ({
        id: fund.id,
        lottery: fund.lottery,
        currency: fund.currency,
        balances: {
          totalCollected: fund.totalCollected,
          prizePool: fund.prizePool,
          jackpotPool: fund.jackpotPool,
          payoutPool: fund.payoutPool,
          platformPool: fund.platformPool,
          reservePool: fund.reservePool,
        },
        stats: {
          totalPaidOut: fund.totalPaidOut,
          totalToReserve: fund.totalToReserve,
          totalToJackpot: fund.totalToJackpot,
        },
        updatedAt: fund.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Admin funds list error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch lottery funds",
    });
  }
});

/**
 * GET /api/admin/funds/:id
 * Get single fund with detailed transaction history
 */
router.get("/:id", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idString = id as string;
    const { limit = "50", page = "1" } = req.query;

    const limitNum = parseInt(limit as string, 10);
    const pageNum = parseInt(page as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const fund = await prisma.lotteryFund.findUnique({
      where: { id: idString },
      include: {
        lottery: {
          select: {
            id: true,
            slug: true,
            name: true,
            active: true,
          },
        },
      },
    });

    if (!fund) {
      res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Fund not found",
      });
      return;
    }

    // Get transactions for this fund
    const [transactions, totalTransactions] = await Promise.all([
      prisma.fundTransaction.findMany({
        where: {
          lotteryId: fund.lotteryId,
          currency: fund.currency,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limitNum,
      }),
      prisma.fundTransaction.count({
        where: {
          lotteryId: fund.lotteryId,
          currency: fund.currency,
        },
      }),
    ]);

    res.json({
      success: true,
      fund: {
        id: fund.id,
        lottery: fund.lottery,
        currency: fund.currency,
        balances: {
          totalCollected: fund.totalCollected,
          prizePool: fund.prizePool,
          jackpotPool: fund.jackpotPool,
          payoutPool: fund.payoutPool,
          platformPool: fund.platformPool,
          reservePool: fund.reservePool,
        },
        stats: {
          totalPaidOut: fund.totalPaidOut,
          totalToReserve: fund.totalToReserve,
          totalToJackpot: fund.totalToJackpot,
        },
        updatedAt: fund.updatedAt.toISOString(),
      },
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        fromPool: tx.fromPool,
        toPool: tx.toPool,
        reference: tx.reference,
        note: tx.note,
        balancesAfter: {
          prizePool: tx.prizePoolAfter,
          jackpotPool: tx.jackpotPoolAfter,
          payoutPool: tx.payoutPoolAfter,
          reservePool: tx.reservePoolAfter,
          platformPool: tx.platformPoolAfter,
        },
        createdAt: tx.createdAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalTransactions,
        totalPages: Math.ceil(totalTransactions / limitNum),
      },
    });
  } catch (error) {
    console.error("Admin fund details error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch fund details",
    });
  }
});

/**
 * POST /api/admin/funds/:id/seed
 * Seed jackpot from reserve fund
 */
router.post(
  "/:id/seed",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idString = id as string;
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Valid amount is required",
        });
        return;
      }

      const fund = await prisma.lotteryFund.findUnique({
        where: { id: idString },
      });

      if (!fund) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Fund not found",
        });
        return;
      }

      // Check if reserve has enough funds
      if (fund.reservePool < amount) {
        res.status(400).json({
          success: false,
          error: "Bad Request",
          message: `Insufficient reserve pool. Available: ${fund.reservePool}, Required: ${amount}`,
        });
        return;
      }

      // Transfer from reserve to jackpot
      const updatedFund = await prisma.lotteryFund.update({
        where: { id: idString },
        data: {
          reservePool: { decrement: amount },
          jackpotPool: { increment: amount },
          totalToJackpot: { increment: amount },
        },
      });

      // Log transaction
      await prisma.fundTransaction.create({
        data: {
          lotteryId: fund.lotteryId,
          currency: fund.currency,
          type: "from_reserve",
          amount,
          fromPool: "reservePool",
          toPool: "jackpotPool",
          prizePoolAfter: updatedFund.prizePool,
          jackpotPoolAfter: updatedFund.jackpotPool,
          payoutPoolAfter: updatedFund.payoutPool,
          reservePoolAfter: updatedFund.reservePool,
          platformPoolAfter: updatedFund.platformPool,
          note: `Jackpot seeded from reserve: ${amount} ${fund.currency}`,
        },
      });

      res.json({
        success: true,
        message: "Jackpot seeded successfully from reserve",
        fund: {
          id: updatedFund.id,
          balances: {
            reservePool: updatedFund.reservePool,
            jackpotPool: updatedFund.jackpotPool,
          },
        },
      });
    } catch (error) {
      console.error("Admin seed jackpot error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to seed jackpot",
      });
    }
  },
);

/**
 * POST /api/admin/funds/:id/seed-manual
 * Manually seed jackpot (external deposit)
 */
router.post(
  "/:id/seed-manual",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idString = id as string;
      const { amount, note } = req.body;

      if (!amount || amount <= 0) {
        res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Valid amount is required",
        });
        return;
      }

      const fund = await prisma.lotteryFund.findUnique({
        where: { id: idString },
      });

      if (!fund) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Fund not found",
        });
        return;
      }

      // Manually add to jackpot pool
      const updatedFund = await prisma.lotteryFund.update({
        where: { id: idString },
        data: {
          jackpotPool: { increment: amount },
          totalToJackpot: { increment: amount },
        },
      });

      // Log transaction
      await prisma.fundTransaction.create({
        data: {
          lotteryId: fund.lotteryId,
          currency: fund.currency,
          type: "manual_adjustment",
          amount,
          toPool: "jackpotPool",
          prizePoolAfter: updatedFund.prizePool,
          jackpotPoolAfter: updatedFund.jackpotPool,
          payoutPoolAfter: updatedFund.payoutPool,
          reservePoolAfter: updatedFund.reservePool,
          platformPoolAfter: updatedFund.platformPool,
          note: note || `Manual jackpot seed: ${amount} ${fund.currency}`,
        },
      });

      res.json({
        success: true,
        message: "Jackpot seeded manually",
        fund: {
          id: updatedFund.id,
          balances: {
            jackpotPool: updatedFund.jackpotPool,
          },
        },
      });
    } catch (error) {
      console.error("Admin manual seed error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to manually seed jackpot",
      });
    }
  },
);

/**
 * POST /api/admin/funds/:id/transfer
 * Transfer funds between pools
 */
router.post(
  "/:id/transfer",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idString = id as string;
      const { amount, fromPool, toPool, note } = req.body;

      if (!amount || amount <= 0) {
        res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Valid amount is required",
        });
        return;
      }

      const validPools = [
        "prizePool",
        "jackpotPool",
        "payoutPool",
        "reservePool",
        "platformPool",
      ];
      if (!fromPool || !validPools.includes(fromPool)) {
        res.status(400).json({
          success: false,
          error: "Bad Request",
          message:
            "Valid fromPool is required (prizePool, jackpotPool, payoutPool, reservePool, platformPool)",
        });
        return;
      }

      if (!toPool || !validPools.includes(toPool)) {
        res.status(400).json({
          success: false,
          error: "Bad Request",
          message:
            "Valid toPool is required (prizePool, jackpotPool, payoutPool, reservePool, platformPool)",
        });
        return;
      }

      if (fromPool === toPool) {
        res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "fromPool and toPool must be different",
        });
        return;
      }

      const fund = await prisma.lotteryFund.findUnique({
        where: { id: idString },
      });

      if (!fund) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Fund not found",
        });
        return;
      }

      // Check if source pool has enough funds
      const currentBalance = (fund as Record<string, unknown>)[
        fromPool
      ] as number;
      if (currentBalance < amount) {
        res.status(400).json({
          success: false,
          error: "Bad Request",
          message: `Insufficient ${fromPool}. Available: ${currentBalance}, Required: ${amount}`,
        });
        return;
      }

      // Transfer funds
      const updatedFund = await prisma.lotteryFund.update({
        where: { id: idString },
        data: {
          [fromPool]: { decrement: amount },
          [toPool]: { increment: amount },
        },
      });

      // Log transaction
      await prisma.fundTransaction.create({
        data: {
          lotteryId: fund.lotteryId,
          currency: fund.currency,
          type: "manual_adjustment",
          amount,
          fromPool,
          toPool,
          prizePoolAfter: updatedFund.prizePool,
          jackpotPoolAfter: updatedFund.jackpotPool,
          payoutPoolAfter: updatedFund.payoutPool,
          reservePoolAfter: updatedFund.reservePool,
          platformPoolAfter: updatedFund.platformPool,
          note:
            note ||
            `Transfer from ${fromPool} to ${toPool}: ${amount} ${fund.currency}`,
        },
      });

      res.json({
        success: true,
        message: "Funds transferred successfully",
        fund: {
          id: updatedFund.id,
          balances: {
            prizePool: updatedFund.prizePool,
            jackpotPool: updatedFund.jackpotPool,
            payoutPool: updatedFund.payoutPool,
            reservePool: updatedFund.reservePool,
            platformPool: updatedFund.platformPool,
          },
        },
      });
    } catch (error) {
      console.error("Admin transfer funds error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to transfer funds",
      });
    }
  },
);

export default router;
