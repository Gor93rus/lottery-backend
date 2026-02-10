import { Router, Request, Response } from "express";
import { authMiddleware } from "../../lib/auth/middleware.js";
import { getUserGamificationProfile } from "../../services/gamificationService.js";

const router = Router();

/**
 * GET /api/gamification/profile
 * Get user's gamification profile
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

    const profile = await getUserGamificationProfile(req.user.userId);

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("Get gamification profile error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch gamification profile",
    });
  }
});

export default router;
