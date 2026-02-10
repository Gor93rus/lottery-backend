import { Router, Request, Response } from "express";
import { authMiddleware } from "../../lib/auth/middleware.js";
import {
  getLevelInfo,
  getLevelMilestones,
} from "../../services/gamification/levels.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

/**
 * GET /api/gamification/level
 * Get user's level information and milestones
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

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        level: true,
        experience: true,
      },
    });

    if (!user) {
      res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
      return;
    }

    const levelInfo = getLevelInfo(user.experience);
    const milestones = getLevelMilestones();

    res.json({
      success: true,
      level: levelInfo,
      milestones,
    });
  } catch (error) {
    console.error("Get level info error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch level information",
    });
  }
});

export default router;
