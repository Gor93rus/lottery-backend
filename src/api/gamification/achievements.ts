import { Router, Request, Response } from "express";
import { authMiddleware } from "../../lib/auth/middleware.js";
import {
  getAllAchievements,
  getUserAchievements,
  claimAchievementReward,
} from "../../services/gamification/achievements.js";
import { Achievement } from "../../data/achievements.js";

const router = Router();

/**
 * GET /api/gamification/achievements
 * Get all achievements
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const categoryParam = req.query.category as string | undefined;

    // Validate category if provided
    let category: Achievement["category"] | undefined;
    if (categoryParam) {
      const validCategories: Achievement["category"][] = [
        "beginner",
        "intermediate",
        "advanced",
        "legendary",
      ];
      if (validCategories.includes(categoryParam as Achievement["category"])) {
        category = categoryParam as Achievement["category"];
      }
    }

    const achievements = await getAllAchievements(category);

    res.json({
      success: true,
      achievements,
    });
  } catch (error) {
    console.error("Get achievements error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch achievements",
    });
  }
});

/**
 * GET /api/gamification/achievements/mine
 * Get user's achievements
 */
router.get("/mine", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    const achievements = await getUserAchievements(req.user.userId);

    res.json({
      success: true,
      achievements,
    });
  } catch (error) {
    console.error("Get user achievements error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch user achievements",
    });
  }
});

/**
 * POST /api/gamification/achievements/:id/claim
 * Claim achievement reward
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

      const achievementId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const reward = await claimAchievementReward(
        req.user.userId,
        achievementId,
      );

      res.json({
        success: true,
        reward,
      });
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message === "Achievement not found or already claimed") {
        res.status(404).json({
          error: "Not Found",
          message: err.message,
        });
        return;
      }

      console.error("Claim achievement reward error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to claim achievement reward",
      });
    }
  },
);

export default router;
