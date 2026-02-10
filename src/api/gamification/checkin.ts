import { Router, Request, Response } from "express";
import { authMiddleware } from "../../lib/auth/middleware.js";
import { processCheckIn, getUserStreak } from "../../services/streakService.js";

const router = Router();

/**
 * POST /api/gamification/checkin
 * Process daily check-in
 */
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    const result = await processCheckIn(req.user.userId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "Already checked in today"
    ) {
      res.status(400).json({
        error: "Bad Request",
        message: error.message,
      });
      return;
    }

    console.error("Check-in error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to process check-in",
    });
  }
});

/**
 * GET /api/gamification/checkin
 * Get user's streak info
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

    const streakInfo = await getUserStreak(req.user.userId);

    res.json({
      success: true,
      streak: streakInfo,
    });
  } catch (error) {
    console.error("Get streak error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch streak info",
    });
  }
});

export default router;
