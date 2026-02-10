import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { unifiedAuthMiddleware } from "../../lib/auth/unifiedAuth.js";

const router = Router();

// GET /api/user/notifications
router.get("/", unifiedAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const unreadOnly = req.query.unreadOnly === "true";

    const where: Record<string, unknown> = { userId: req.user.userId };
    if (unreadOnly) {
      where.read = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId: req.user.userId, read: false },
      }),
    ]);

    res.json({
      success: true,
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      unreadCount,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to get notifications" });
  }
});

// POST /api/user/notifications/:id/read
router.post(
  "/:id/read",
  unifiedAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: "Not authenticated" });
        return;
      }

      const notificationId = req.params.id as string;

      const notification = await prisma.notification.updateMany({
        where: { id: notificationId, userId: req.user.userId },
        data: { read: true },
      });

      res.json({ success: true, updated: notification.count });
    } catch (error) {
      console.error("Mark notification read error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to update notification" });
    }
  },
);

// POST /api/user/notifications/read-all
router.post(
  "/read-all",
  unifiedAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: "Not authenticated" });
        return;
      }

      const result = await prisma.notification.updateMany({
        where: { userId: req.user.userId, read: false },
        data: { read: true },
      });

      res.json({ success: true, updated: result.count });
    } catch (error) {
      console.error("Mark all read error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to update notifications" });
    }
  },
);

export default router;
