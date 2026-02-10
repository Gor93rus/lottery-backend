import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";

const router = Router();

/**
 * @swagger
 * /api/admin/auth/login:
 *   post:
 *     summary: Admin login with Telegram ID and password
 *     tags: [Admin - Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - telegramId
 *               - password
 *             properties:
 *               telegramId:
 *                 type: string
 *                 example: "432735501"
 *               password:
 *                 type: string
 *                 description: Admin password (minimum 8 characters)
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                 admin:
 *                   type: object
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Admin account disabled
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { telegramId, password } = req.body;

    if (!telegramId || !password) {
      res.status(400).json({
        success: false,
        error: "Telegram ID and password are required",
      });
      return;
    }

    // Find admin user
    const adminUser = await prisma.adminUser.findUnique({
      where: { telegramId: String(telegramId) },
    });

    if (!adminUser) {
      res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
      return;
    }

    if (!adminUser.active) {
      res.status(403).json({
        success: false,
        error: "Admin account is disabled",
      });
      return;
    }

    // Check password (if passwordHash exists)
    if (adminUser.passwordHash) {
      const isValidPassword = await bcrypt.compare(
        password,
        adminUser.passwordHash,
      );
      if (!isValidPassword) {
        res.status(401).json({
          success: false,
          error: "Invalid credentials",
        });
        return;
      }
    }
    // If no passwordHash set, allow login (backward compatibility)
    // but log a warning
    else {
      console.warn(`Admin ${adminUser.telegramId} has no password set!`);
    }

    // Find or create user record for JWT
    let user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: String(telegramId),
          username: adminUser.username,
        },
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, telegramId: user.telegramId },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" },
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      admin: {
        id: adminUser.id,
        role: adminUser.role,
        permissions: adminUser.permissions,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({
      success: false,
      error: "Login failed",
    });
  }
});

/**
 * @swagger
 * /api/admin/auth/set-password:
 *   post:
 *     summary: Set or change admin password
 *     tags: [Admin - Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Invalid password
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/set-password",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const adminId = req.admin?.id;

      if (!adminId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      if (!newPassword || newPassword.length < 8) {
        res.status(400).json({
          success: false,
          error: "Password must be at least 8 characters",
        });
        return;
      }

      const adminUser = await prisma.adminUser.findUnique({
        where: { id: adminId },
      });

      if (!adminUser) {
        res.status(404).json({ success: false, error: "Admin not found" });
        return;
      }

      // If password already set, verify current password
      if (adminUser.passwordHash) {
        if (!currentPassword) {
          res.status(400).json({
            success: false,
            error: "Current password is required",
          });
          return;
        }
        const isValid = await bcrypt.compare(
          currentPassword,
          adminUser.passwordHash,
        );
        if (!isValid) {
          res.status(401).json({
            success: false,
            error: "Current password is incorrect",
          });
          return;
        }
      }

      // Hash and save new password
      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.adminUser.update({
        where: { id: adminId },
        data: { passwordHash },
      });

      res.json({
        success: true,
        message: "Password updated successfully",
      });
    } catch (error) {
      console.error("Set password error:", error);
      res.status(500).json({ success: false, error: "Failed to set password" });
    }
  },
);

/**
 * @swagger
 * /api/admin/auth/check:
 *   get:
 *     summary: Check if current user is admin
 *     tags: [Admin - Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin status check successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 isAdmin:
 *                   type: boolean
 *                 admin:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     role:
 *                       type: string
 *                     permissions:
 *                       type: object
 *       401:
 *         description: Not authenticated or not an admin
 */
router.get("/check", async (req: Request, res: Response) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        isAdmin: false,
        error: "No token provided",
      });
      return;
    }

    const token = authHeader.substring(7);

    // Verify JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET not configured");
      res.status(500).json({
        success: false,
        isAdmin: false,
        error: "Server configuration error",
      });
      return;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
      userId: string;
      telegramId: string;
    };

    // Find admin user by telegramId
    const adminUser = await prisma.adminUser.findUnique({
      where: { telegramId: decoded.telegramId },
    });

    if (!adminUser) {
      res.status(401).json({
        success: false,
        isAdmin: false,
        error: "Not an admin",
      });
      return;
    }

    if (!adminUser.active) {
      res.status(401).json({
        success: false,
        isAdmin: false,
        error: "Admin account is disabled",
      });
      return;
    }

    res.json({
      success: true,
      isAdmin: true,
      admin: {
        id: adminUser.id,
        role: adminUser.role,
        permissions: adminUser.permissions,
      },
    });
  } catch (error) {
    console.error("Admin check error:", error);
    res.status(401).json({
      success: false,
      isAdmin: false,
      error: "Invalid token",
    });
  }
});

export default router;
