import { Router, Request, Response } from "express";
import { authMiddleware } from "../../lib/auth/middleware.js";
import {
  getUnclaimedRewards,
  claimReward,
  claimAllRewards,
} from "../../services/rewardService.js";

const router = Router();

/**
 * GET /api/gamification/rewards
 * Get user's unclaimed rewards
 */
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    const rewards = await getUnclaimedRewards(req.user.userId);

    res.json({
      success: true,
      rewards,
    });
  } catch (error) {
    console.error("Get rewards error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch rewards",
    });
  }
});

/**
 * POST /api/gamification/rewards/:id/claim
 * Claim a specific reward
 */
router.post(
  "/:id/claim",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      const rewardId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const result = await claimReward(req.user.userId, rewardId);

      res.json({
        success: true,
        reward: result,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message === "Reward not found or already claimed"
      ) {
        res.status(404).json({
          error: "Not Found",
          message: error.message,
        });
        return;
      }

      console.error("Claim reward error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to claim reward",
      });
    }
  },
);

/**
 * POST /api/gamification/rewards/claim-all
 * Claim all unclaimed rewards
 */
router.post(
  "/claim-all",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      const claimed = await claimAllRewards(req.user.userId);

      res.json({
        success: true,
        claimed,
        total: claimed.length,
      });
    } catch (error) {
      console.error("Claim all rewards error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to claim all rewards",
      });
    }
  },
);

export default router;
