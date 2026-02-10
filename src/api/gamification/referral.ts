import { Router, Request, Response } from "express";
import { authMiddleware } from "../../lib/auth/middleware.js";
import {
  getReferralStats,
  applyReferralCode,
} from "../../services/referralService.js";

const router = Router();

/**
 * GET /api/gamification/referral/stats
 * Get user's referral statistics
 */
router.get("/stats", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    const stats = await getReferralStats(req.user.userId);

    res.json({
      success: true,
      ...stats,
    });
  } catch (error) {
    console.error("Get referral stats error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch referral statistics",
    });
  }
});

/**
 * POST /api/gamification/referral/apply
 * Apply a referral code
 */
router.post("/apply", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    const { referralCode } = req.body;

    if (!referralCode) {
      res.status(400).json({
        error: "Bad Request",
        message: "Referral code is required",
      });
      return;
    }

    await applyReferralCode(req.user.userId, referralCode);

    res.json({
      success: true,
      message: "Referral code applied successfully",
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message === "Invalid referral code" ||
        error.message === "User already has a referrer")
    ) {
      res.status(400).json({
        error: "Bad Request",
        message: error.message,
      });
      return;
    }

    console.error("Apply referral code error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to apply referral code",
    });
  }
});

export default router;
