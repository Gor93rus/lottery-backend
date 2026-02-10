import { Router, Request, Response } from "express";
import { optionalAuth } from "../../lib/auth/middleware.js";
import {
  getLeaderboard,
  LeaderboardType,
  LeaderboardPeriod,
} from "../../services/leaderboardService.js";

const router = Router();

/**
 * GET /api/gamification/leaderboard
 * Get leaderboard
 * Query params: type (xp|tickets|wins|streak), period (daily|weekly|monthly|alltime), limit
 */
router.get("/", optionalAuth, async (req: Request, res: Response) => {
  try {
    const type = (req.query.type as string) || "xp";
    const period = (req.query.period as string) || "alltime";
    const limit = parseInt(req.query.limit as string) || 100;

    // Validate type
    if (!["xp", "tickets", "wins", "streak"].includes(type)) {
      res.status(400).json({
        error: "Bad Request",
        message: "Invalid type. Must be one of: xp, tickets, wins, streak",
      });
      return;
    }

    // Validate period
    if (!["daily", "weekly", "monthly", "alltime"].includes(period)) {
      res.status(400).json({
        error: "Bad Request",
        message:
          "Invalid period. Must be one of: daily, weekly, monthly, alltime",
      });
      return;
    }

    // Validate limit
    if (limit < 1 || limit > 1000) {
      res.status(400).json({
        error: "Bad Request",
        message: "Limit must be between 1 and 1000",
      });
      return;
    }

    const leaderboard = await getLeaderboard(
      type as LeaderboardType,
      period as LeaderboardPeriod,
      limit,
    );

    res.json({
      success: true,
      type,
      period,
      leaderboard,
    });
  } catch (error) {
    console.error("Get leaderboard error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch leaderboard",
    });
  }
});

export default router;
