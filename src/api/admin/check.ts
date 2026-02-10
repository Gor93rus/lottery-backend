import { Router, Request, Response } from "express";
import { authMiddleware } from "../../lib/auth/middleware.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

/**
 * GET /api/admin/check
 * Check if current user is an admin
 */
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.json({
        success: true,
        isAdmin: false,
      });
      return;
    }

    // Look up admin user by telegramId
    const adminUser = await prisma.adminUser.findUnique({
      where: { telegramId: req.user.telegramId },
    });

    if (!adminUser || !adminUser.active) {
      res.json({
        success: true,
        isAdmin: false,
      });
      return;
    }

    res.json({
      success: true,
      isAdmin: true,
      role: adminUser.role,
    });
  } catch (error) {
    console.error("Admin check error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to check admin status",
    });
  }
});

export default router;
