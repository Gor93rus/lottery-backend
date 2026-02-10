import { Router, Request, Response } from "express";
import { authMiddleware } from "../../lib/auth/middleware.js";
import {
  getActiveQuests,
  getUserQuests,
  claimQuestReward,
} from "../../services/questService.js";

const router = Router();

/**
 * GET /api/gamification/quests
 * Get all active quests
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const quests = await getActiveQuests(type);

    res.json({
      success: true,
      quests,
    });
  } catch (error) {
    console.error("Get quests error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch quests",
    });
  }
});

/**
 * GET /api/gamification/quests/mine
 * Get user's quest progress
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

    const type = req.query.type as string | undefined;
    const quests = await getUserQuests(req.user.userId, type);

    res.json({
      success: true,
      quests,
    });
  } catch (error) {
    console.error("Get user quests error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch user quests",
    });
  }
});

/**
 * POST /api/gamification/quests/:id/claim
 * Claim quest reward
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

      const questId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const reward = await claimQuestReward(req.user.userId, questId);

      res.json({
        success: true,
        reward,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message === "Quest not found or already claimed"
      ) {
        res.status(404).json({
          error: "Not Found",
          message: error.message,
        });
        return;
      }

      console.error("Claim quest reward error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to claim quest reward",
      });
    }
  },
);

export default router;
