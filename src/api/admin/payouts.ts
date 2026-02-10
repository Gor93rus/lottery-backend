import { Router, Request, Response } from "express";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";
import { prisma } from "../../lib/prisma.js";
import { payoutService } from "../../services/payoutService.js";
import { tonWalletService } from "../../services/tonWalletService.js";
import { sanitizeId } from "../../lib/utils/sanitize.js";

const router = Router();

// All routes require admin
router.use(adminMiddleware);

// GET /api/admin/payouts - List all payouts
router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, lotteryId, page = "1", limit = "20" } = req.query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (lotteryId) where.draw = { lotteryId: lotteryId as string };

    const [payouts, total] = await Promise.all([
      prisma.payout.findMany({
        where,
        include: {
          user: { select: { id: true, username: true, tonWallet: true } },
          draw: {
            select: {
              id: true,
              drawTime: true,
              lottery: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
        take: parseInt(limit as string),
      }),
      prisma.payout.count({ where }),
    ]);

    res.json({
      success: true,
      data: payouts,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error("Failed to get payouts", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    res.status(500).json({ success: false, error: "Failed to get payouts" });
  }
});

// GET /api/admin/payouts/pending - Pending payouts
router.get("/pending", async (req: Request, res: Response) => {
  try {
    const payouts = await prisma.payout.findMany({
      where: { status: "pending" },
      include: {
        user: { select: { id: true, username: true, tonWallet: true } },
        draw: {
          select: {
            id: true,
            lottery: { select: { name: true, currency: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({ success: true, data: payouts });
  } catch (error) {
    console.error("Failed to get pending payouts", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    res
      .status(500)
      .json({ success: false, error: "Failed to get pending payouts" });
  }
});

// GET /api/admin/payouts/stats - Payout statistics
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const lotteryId = req.query.lotteryId as string | undefined;
    const stats = await payoutService.getPayoutStats(lotteryId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Failed to get payout stats", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    res.status(500).json({ success: false, error: "Failed to get stats" });
  }
});

// POST /api/admin/payouts/:id/retry - Retry failed payout
router.post("/:id/retry", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    console.log("Admin retrying payout", { payoutId: sanitizeId(id) });

    const result = await payoutService.retryPayout(id);

    if (result.success) {
      res.json({ success: true, txHash: result.txHash });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Failed to retry payout", {
      payoutId: sanitizeId(req.params.id as string),
      error: error instanceof Error ? error.message : "Unknown",
    });
    res.status(500).json({ success: false, error: "Failed to retry payout" });
  }
});

// GET /api/admin/payouts/wallet/balance - Platform wallet balance
router.get("/wallet/balance", async (req: Request, res: Response) => {
  try {
    const [tonBalance, usdtBalance] = await Promise.all([
      tonWalletService.getBalance(),
      tonWalletService.getUSDTBalance(),
    ]);

    res.json({
      success: true,
      data: {
        address: tonWalletService.getAddress(),
        ton: tonBalance,
        usdt: usdtBalance,
      },
    });
  } catch (error) {
    console.error("Failed to get wallet balance", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    res.status(500).json({ success: false, error: "Failed to get balance" });
  }
});

// POST /api/admin/payouts/process - Manually trigger payout processing
router.post("/process", async (req: Request, res: Response) => {
  try {
    console.log("Admin triggered manual payout processing");
    await payoutService.processPendingPayouts();
    res.json({ success: true, message: "Payout processing triggered" });
  } catch (error) {
    console.error("Failed to process payouts", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    res
      .status(500)
      .json({ success: false, error: "Failed to process payouts" });
  }
});

export default router;
