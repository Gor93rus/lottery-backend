import { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma.js";

export const unifiedAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Get user ID from multiple sources
    let userId: string | undefined;

    // 1. Try x-user-id header (primary for this app)
    const headerUserId = req.headers["x-user-id"];
    if (headerUserId && typeof headerUserId === "string") {
      userId = headerUserId.trim();
    }

    // 2. Try Authorization Bearer token (extract telegramId from JWT if needed)
    if (!userId) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        // Token extraction placeholder - for future JWT implementation
        // Real JWT tokens would be decoded and verified here
      }
    }

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "No user identification provided. Send x-user-id header.",
      });
      return;
    }

    // Find user by id OR telegramId
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ id: userId }, { telegramId: userId }],
      },
      select: { id: true, telegramId: true, username: true },
    });

    // Auto-create user if not found
    let userJustCreated = false;
    if (!user) {
      console.log(`[UnifiedAuth] Creating new user: ${userId}`);

      try {
        user = await prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              telegramId: userId,
              username: `user_${userId}`,
              level: 1,
              experience: 0,
              streak: 0,
            },
            select: { id: true, telegramId: true, username: true },
          });

          // Create UserStreak
          await tx.userStreak.create({
            data: {
              userId: newUser.id,
              currentStreak: 0,
              longestStreak: 0,
              totalCheckIns: 0,
            },
          });

          return newUser;
        });

        userJustCreated = true;
        console.log(`[UnifiedAuth] Created user: ${user.id}`);
      } catch (createError: unknown) {
        // Handle race condition (P2002 = unique constraint)
        const prismaError = createError as { code?: string };
        if (prismaError.code === "P2002") {
          console.log(`[UnifiedAuth] Race condition, finding existing user`);
          user = await prisma.user.findFirst({
            where: { telegramId: userId },
            select: { id: true, telegramId: true, username: true },
          });
        } else {
          throw createError;
        }
      }

      if (!user) {
        res
          .status(500)
          .json({ success: false, error: "Failed to create user" });
        return;
      }
    }

    // Ensure UserStreak exists for existing users (skip if just created)
    if (!userJustCreated) {
      await prisma.userStreak.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          currentStreak: 0,
          longestStreak: 0,
          totalCheckIns: 0,
        },
      });
    }

    req.user = { userId: user.id, telegramId: user.telegramId || "" };
    next();
  } catch (error) {
    console.error("[UnifiedAuth] Error:", error);
    res.status(500).json({ success: false, error: "Authentication failed" });
  }
};
