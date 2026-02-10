import { Router, Request, Response } from "express";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

/**
 * POST /api/admin/notifications
 * Send notification to user(s)
 */
router.post("/", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { type, title, message, userId } = req.body;

    // Validate required fields
    if (!type || !title || !message) {
      res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "type, title, and message are required",
      });
      return;
    }

    // If userId is provided, send to specific user
    if (userId) {
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Create notification for specific user
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          read: false,
        },
      });

      res.status(201).json({
        success: true,
        notification: {
          id: notification.id,
          userId: notification.userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          read: notification.read,
          createdAt: notification.createdAt.toISOString(),
        },
        sentTo: "single_user",
      });
    } else {
      // Send to all users
      const users = await prisma.user.findMany({
        select: { id: true },
      });

      // Create notifications for all users
      const notifications = await prisma.notification.createMany({
        data: users.map((user) => ({
          userId: user.id,
          type,
          title,
          message,
          read: false,
        })),
      });

      res.status(201).json({
        success: true,
        message: `Notification sent to ${notifications.count} users`,
        sentTo: "all_users",
        count: notifications.count,
      });
    }
  } catch (error) {
    console.error("Admin send notification error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to send notification",
    });
  }
});

/**
 * GET /api/admin/notifications
 * List sent notifications with pagination
 */
router.get("/", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { page = "1", limit = "20", type, userId } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (userId) where.userId = userId;

    // Get total count
    const total = await prisma.notification.count({ where });

    // Get notifications with pagination
    const notifications = await prisma.notification.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.json({
      success: true,
      notifications: notifications.map((notification) => ({
        id: notification.id,
        user: notification.user,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        link: notification.link,
        actionLabel: notification.actionLabel,
        read: notification.read,
        createdAt: notification.createdAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Admin notifications list error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch notifications",
    });
  }
});

export default router;
