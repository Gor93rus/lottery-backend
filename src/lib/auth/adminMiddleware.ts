import { Request, Response, NextFunction } from "express";
import { authMiddleware } from "./middleware.js";
import { prisma } from "../prisma.js";

// Extend Express Request type to include admin info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        telegramId: string;
        username: string | null;
        role: string;
        permissions: unknown;
      };
    }
  }
}

/**
 * Admin Authentication Middleware
 * Checks if user is an admin by:
 * 1. Validating JWT token (using existing authMiddleware)
 * 2. Looking up user's telegramId in AdminUser table
 * 3. Verifying admin is active
 * 4. Attaching admin info to request
 */
export const adminMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // First, authenticate the user
  await new Promise<void>((resolve, reject) => {
    authMiddleware(req, res, (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  }).catch((_error) => {
    // If auth fails, authMiddleware already sent a response
    return;
  });

  // If authMiddleware sent a response, stop here
  if (res.headersSent) {
    return;
  }

  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Authentication required",
      });
      return;
    }

    // Look up admin user by telegramId
    const adminUser = await prisma.adminUser.findUnique({
      where: { telegramId: req.user.telegramId },
    });

    // Check if user is an admin
    if (!adminUser) {
      res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Admin access required",
      });
      return;
    }

    // Check if admin is active
    if (!adminUser.active) {
      res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Admin account is disabled",
      });
      return;
    }

    // Attach admin info to request
    req.admin = {
      id: adminUser.id,
      telegramId: adminUser.telegramId,
      username: adminUser.username,
      role: adminUser.role,
      permissions: adminUser.permissions,
    };

    next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Admin authentication failed",
    });
  }
};
