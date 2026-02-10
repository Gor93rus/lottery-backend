import { Router, Request, Response } from "express";
import { unifiedAuthMiddleware } from "../../lib/auth/unifiedAuth.js";
import { prisma } from "../../lib/prisma.js";
import { getUserGamificationProfile } from "../../services/gamificationService.js";
import { getUserStreak, processCheckIn } from "../../services/streakService.js";
import {
  getLevelFromXp,
  getXpProgressInLevel,
} from "../../config/gamification.js";

const router = Router();

// All routes require authentication
router.use(unifiedAuthMiddleware); // 2. Применяем НОВЫЙ middleware ко всем роутам в этом файле

/**
 * GET /api/gamification/profile
 * Get user's gamification profile (level, XP, etc.)
 */
router.get("/profile", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const userId = req.user.userId;
    const profile = await getUserGamificationProfile(userId);

    res.json({
      success: true,
      ...profile,
    });
  } catch (error) {
    console.error("Get gamification profile error:", error);
    res.status(500).json({ success: false, error: "Failed to get profile" });
  }
});

/**
 * GET /api/gamification/progress
 * Get level progress information
 */
router.get("/progress", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        level: true,
        experience: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const currentLevel = getLevelFromXp(user.experience);
    const levelProgress = getXpProgressInLevel(user.experience, currentLevel);

    res.json({
      success: true,
      level: currentLevel,
      experience: user.experience,
      progress: levelProgress,
    });
  } catch (error) {
    console.error("Get progress error:", error);
    res.status(500).json({ success: false, error: "Failed to get progress" });
  }
});

/**
 * GET /api/gamification/streak
 * Get user's current streak info
 */
router.get("/streak", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const userId = req.user.userId;
    const streakInfo = await getUserStreak(userId);

    res.json({
      success: true,
      streak: streakInfo,
    });
  } catch (error) {
    console.error("Get streak error:", error);
    res.status(500).json({ success: false, error: "Failed to get streak" });
  }
});

/**
 * POST /api/gamification/check-in
 * Daily check-in to maintain streak
 */
router.post("/check-in", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const userId = req.user.userId;
    const result = await processCheckIn(userId);

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
        success: false,
        error: "Already checked in today",
      });
      return;
    }

    console.error("Check-in error:", error);
    res.status(500).json({ success: false, error: "Failed to check in" });
  }
});

/**
 * GET /api/gamification/mine
 * Get user's gamification summary (combined data)
 */
router.get("/mine", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        level: true,
        experience: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    // Get streak info
    const streakInfo = await getUserStreak(userId);

    // Get achievements count
    const achievementsCount = await prisma.userAchievement.count({
      where: { userId },
    });

    const totalAchievements = await prisma.achievement.count();

    // Get current level info
    const currentLevel = getLevelFromXp(user.experience);
    const levelProgress = getXpProgressInLevel(user.experience, currentLevel);

    res.json({
      success: true,
      level: {
        level: currentLevel,
        experience: user.experience,
        progress: levelProgress,
      },
      streak: streakInfo,
      achievements: {
        unlocked: achievementsCount,
        total: totalAchievements,
      },
    });
  } catch (error) {
    console.error("Get gamification mine error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to get gamification data" });
  }
});

/**
 * GET /api/gamification/achievements
 * Get all achievements with user's progress
 */
router.get("/achievements", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const userId = req.user.userId;

    // Get all available achievements
    const allAchievements = await prisma.achievement.findMany({
      orderBy: { createdAt: "asc" },
    });

    // Get user's unlocked achievements
    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true, unlockedAt: true },
    });

    const unlockedMap = new Map(
      userAchievements.map((ua) => [ua.achievementId, ua.unlockedAt]),
    );

    const achievements = allAchievements.map((a) => ({
      id: a.id,
      slug: a.slug,
      category: a.category,
      tier: a.tier,
      rarity: a.rarity,
      name: a.name,
      description: a.description,
      icon: a.icon,
      xpReward: a.rewardXp,
      tonReward: a.rewardTon,
      unlockedAt: unlockedMap.get(a.id) || null,
    }));

    res.json({
      success: true,
      achievements,
      unlocked: userAchievements.length,
      total: allAchievements.length,
    });
  } catch (error) {
    console.error("Get achievements error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to get achievements" });
  }
});

/**
 * GET /api/gamification/quests
 * Get active quests
 */
router.get("/quests", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const userId = req.user.userId;

    // Get active quests
    const quests = await prisma.quest.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });

    // Get user progress on quests
    const userQuests = await prisma.userQuest.findMany({
      where: { userId },
    });

    const userProgressMap = new Map(userQuests.map((uq) => [uq.questId, uq]));

    const questsWithProgress = quests.map((q) => {
      const userProgress = userProgressMap.get(q.id);
      return {
        id: q.id,
        slug: q.slug,
        type: q.type,
        title: q.title,
        description: q.description,
        target: q.target,
        rewardType: q.rewardType,
        rewardValue: q.rewardValue,
        progress: userProgress?.progress || 0,
        completed: userProgress?.completed || false,
        claimed: userProgress?.claimed || false,
      };
    });

    res.json({
      success: true,
      quests: questsWithProgress,
      completed: questsWithProgress.filter((q) => q.completed).length,
      total: questsWithProgress.length,
    });
  } catch (error) {
    console.error("Get quests error:", error);
    res.status(500).json({ success: false, error: "Failed to get quests" });
  }
});

export default router;
