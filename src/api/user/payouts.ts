import { Router, Request, Response } from "express";
import { unifiedAuthMiddleware } from "../../lib/auth/unifiedAuth.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

router.use(unifiedAuthMiddleware);

// GET /api/user/payouts - User's payout history
router.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const userId = req.user.userId;

    const payouts = await prisma.payout.findMany({
      where: { userId },
      include: {
        draw: {
          select: {
            id: true,
            drawTime: true,
            winningNumbers: true,
            lottery: { select: { name: true, currency: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: payouts });
  } catch (error) {
    console.error("Failed to get user payouts", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    res.status(500).json({ success: false, error: "Failed to get payouts" });
  }
});

// GET /api/user/payouts/:id - Single payout details
router.get("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const userId = req.user.userId;
    const id = req.params.id as string;

    const payout = await prisma.payout.findFirst({
      where: { id, userId },
      include: {
        draw: {
          select: {
            id: true,
            drawTime: true,
            winningNumbers: true,
            lottery: { select: { name: true, currency: true } },
          },
        },
      },
    });

    if (!payout) {
      return res
        .status(404)
        .json({ success: false, error: "Payout not found" });
    }

    res.json({ success: true, data: payout });
  } catch (error) {
    console.error("Failed to get payout", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    res.status(500).json({ success: false, error: "Failed to get payout" });
  }
});

export default router;
