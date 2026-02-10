import { Router, Request, Response } from "express";
import { authMiddleware } from "../../lib/auth/middleware.js";
import {
  getDailyTasksWithProgress,
  claimDailyTaskReward,
} from "../../services/gamification/dailyTasks.js";

const router = Router();

/**
 * GET /api/gamification/daily-tasks
 * Get all daily tasks with user progress
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

    const tasks = await getDailyTasksWithProgress(req.user.userId);

    res.json({
      success: true,
      tasks,
    });
  } catch (error) {
    console.error("Get daily tasks error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch daily tasks",
    });
  }
});

/**
 * POST /api/gamification/daily-tasks/:taskId/claim
 * Claim daily task reward
 */
router.post(
  "/:taskId/claim",
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

      const taskId = Array.isArray(req.params.taskId)
        ? req.params.taskId[0]
        : req.params.taskId;
      const reward = await claimDailyTaskReward(req.user.userId, taskId);

      res.json({
        success: true,
        reward,
      });
    } catch (error: unknown) {
      const err = error as Error;
      if (
        err.message === "Daily task not found" ||
        err.message === "Task not completed or already claimed"
      ) {
        res.status(404).json({
          error: "Not Found",
          message: err.message,
        });
        return;
      }

      console.error("Claim daily task reward error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to claim daily task reward",
      });
    }
  },
);

export default router;
