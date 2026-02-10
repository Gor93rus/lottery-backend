import { Router, Request, Response } from "express";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

// All routes require admin authentication
router.use(adminMiddleware);

// ==================== DAILY TASKS ====================

/**
 * GET /api/admin/gamification/daily-tasks
 * List all daily tasks
 */
router.get("/daily-tasks", async (req: Request, res: Response) => {
  try {
    const tasks = await prisma.dailyTask.findMany({
      orderBy: { sortOrder: "asc" },
    });

    res.json({
      success: true,
      tasks,
    });
  } catch (error) {
    console.error("Get daily tasks error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch daily tasks" });
  }
});

/**
 * POST /api/admin/gamification/daily-tasks
 * Create new daily task
 */
router.post("/daily-tasks", async (req: Request, res: Response) => {
  try {
    const {
      taskId,
      name,
      nameEn,
      description,
      descriptionEn,
      type,
      target,
      rewardXp,
      rewardTon,
      sortOrder,
      isActive,
    } = req.body;

    if (!taskId || !name || !type || !target) {
      res.status(400).json({
        success: false,
        error: "taskId, name, type, and target are required",
      });
      return;
    }

    const task = await prisma.dailyTask.create({
      data: {
        taskId,
        name,
        nameEn: nameEn || name,
        description: description || "",
        descriptionEn: descriptionEn || description || "",
        type,
        target,
        rewardXp: rewardXp || 0,
        rewardTon: rewardTon || 0,
        sortOrder: sortOrder || 0,
        isActive: isActive !== false,
      },
    });

    res.status(201).json({
      success: true,
      task,
    });
  } catch (error) {
    console.error("Create daily task error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to create daily task" });
  }
});

/**
 * PUT /api/admin/gamification/daily-tasks/:id
 * Update daily task
 */
router.put("/daily-tasks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idString = String(id);
    const {
      name,
      nameEn,
      description,
      descriptionEn,
      type,
      target,
      rewardXp,
      rewardTon,
      sortOrder,
      isActive,
    } = req.body;

    // Build update data with only allowed fields
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (nameEn !== undefined) updateData.nameEn = nameEn;
    if (description !== undefined) updateData.description = description;
    if (descriptionEn !== undefined) updateData.descriptionEn = descriptionEn;
    if (type !== undefined) updateData.type = type;
    if (target !== undefined) updateData.target = target;
    if (rewardXp !== undefined) updateData.rewardXp = rewardXp;
    if (rewardTon !== undefined) updateData.rewardTon = rewardTon;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isActive !== undefined) updateData.isActive = isActive;

    const task = await prisma.dailyTask.update({
      where: { id: idString },
      data: updateData,
    });

    res.json({
      success: true,
      task,
    });
  } catch (error) {
    console.error("Update daily task error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to update daily task" });
  }
});

/**
 * DELETE /api/admin/gamification/daily-tasks/:id
 * Delete daily task (soft delete - set isActive = false)
 */
router.delete("/daily-tasks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idString = String(id);

    await prisma.dailyTask.update({
      where: { id: idString },
      data: { isActive: false },
    });

    res.json({
      success: true,
      message: "Daily task deactivated",
    });
  } catch (error) {
    console.error("Delete daily task error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to delete daily task" });
  }
});

// ==================== ACHIEVEMENTS ====================

/**
 * GET /api/admin/gamification/achievements
 * List all achievements
 */
router.get("/achievements", async (req: Request, res: Response) => {
  try {
    const achievements = await prisma.achievement.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    });

    res.json({
      success: true,
      achievements,
    });
  } catch (error) {
    console.error("Get achievements error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch achievements" });
  }
});

/**
 * POST /api/admin/gamification/achievements
 * Create new achievement
 */
router.post("/achievements", async (req: Request, res: Response) => {
  try {
    const {
      slug,
      name,
      nameEn,
      title,
      description,
      descriptionEn,
      category,
      type,
      target,
      tier,
      rarity,
      icon,
      rewardXp,
      rewardTon,
      rewardTickets,
      sortOrder,
      isActive,
    } = req.body;

    if (!slug || !name || !category || !type || !target) {
      res.status(400).json({
        success: false,
        error: "slug, name, category, type, and target are required",
      });
      return;
    }

    const achievement = await prisma.achievement.create({
      data: {
        slug,
        name,
        nameEn: nameEn || name,
        title: title || name,
        description: description || "",
        descriptionEn: descriptionEn || description || "",
        category,
        type,
        target,
        tier: tier || 1,
        rarity: rarity || "COMMON",
        icon: icon || "🏆",
        rewardXp: rewardXp || 0,
        rewardTon: rewardTon || 0,
        rewardTickets: rewardTickets || 0,
        sortOrder: sortOrder || 0,
        isActive: isActive !== false,
      },
    });

    res.status(201).json({
      success: true,
      achievement,
    });
  } catch (error) {
    console.error("Create achievement error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to create achievement" });
  }
});

/**
 * PUT /api/admin/gamification/achievements/:id
 * Update achievement
 */
router.put("/achievements/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idString = String(id);
    const {
      name,
      nameEn,
      title,
      description,
      descriptionEn,
      category,
      type,
      target,
      tier,
      rarity,
      icon,
      rewardXp,
      rewardTon,
      rewardTickets,
      sortOrder,
      isActive,
    } = req.body;

    // Build update data with only allowed fields
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (nameEn !== undefined) updateData.nameEn = nameEn;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (descriptionEn !== undefined) updateData.descriptionEn = descriptionEn;
    if (category !== undefined) updateData.category = category;
    if (type !== undefined) updateData.type = type;
    if (target !== undefined) updateData.target = target;
    if (tier !== undefined) updateData.tier = tier;
    if (rarity !== undefined) updateData.rarity = rarity;
    if (icon !== undefined) updateData.icon = icon;
    if (rewardXp !== undefined) updateData.rewardXp = rewardXp;
    if (rewardTon !== undefined) updateData.rewardTon = rewardTon;
    if (rewardTickets !== undefined) updateData.rewardTickets = rewardTickets;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isActive !== undefined) updateData.isActive = isActive;

    const achievement = await prisma.achievement.update({
      where: { id: idString },
      data: updateData,
    });

    res.json({
      success: true,
      achievement,
    });
  } catch (error) {
    console.error("Update achievement error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to update achievement" });
  }
});

/**
 * DELETE /api/admin/gamification/achievements/:id
 * Delete achievement (soft delete - set isActive = false)
 */
router.delete("/achievements/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idString = String(id);

    await prisma.achievement.update({
      where: { id: idString },
      data: { isActive: false },
    });

    res.json({
      success: true,
      message: "Achievement deactivated",
    });
  } catch (error) {
    console.error("Delete achievement error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to delete achievement" });
  }
});

/**
 * GET /api/admin/gamification/stats
 * Get gamification statistics
 */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const [
      totalDailyTasks,
      activeDailyTasks,
      totalAchievements,
      activeAchievements,
      totalTaskCompletions,
      totalAchievementUnlocks,
      totalXpAwarded,
    ] = await Promise.all([
      prisma.dailyTask.count(),
      prisma.dailyTask.count({ where: { isActive: true } }),
      prisma.achievement.count(),
      prisma.achievement.count({ where: { isActive: true } }),
      prisma.userDailyTask.count({ where: { completed: true } }),
      prisma.userAchievement.count(),
      prisma.user.aggregate({ _sum: { experience: true } }),
    ]);

    res.json({
      success: true,
      stats: {
        dailyTasks: {
          total: totalDailyTasks,
          active: activeDailyTasks,
        },
        achievements: {
          total: totalAchievements,
          active: activeAchievements,
        },
        activity: {
          taskCompletions: totalTaskCompletions,
          achievementUnlocks: totalAchievementUnlocks,
          totalXpAwarded: totalXpAwarded._sum.experience || 0,
        },
      },
    });
  } catch (error) {
    console.error("Get gamification stats error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

export default router;
