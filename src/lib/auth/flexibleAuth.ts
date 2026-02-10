import { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma.js";

export const flexibleAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Get user ID from x-user-id header
    const headerUserId = req.headers["x-user-id"];

    if (!headerUserId || typeof headerUserId !== "string") {
      res
        .status(401)
        .json({ success: false, error: "Unauthorized - no user ID provided" });
      return;
    }

    // Clean the user ID (remove spaces, etc.)
    const userId = headerUserId.trim();

    // Verify user exists - search by ID or telegramId
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ id: userId }, { telegramId: userId }],
      },
      select: { id: true, telegramId: true, username: true },
    });

    // If user not found, create new user with telegramId
    if (!user) {
      console.log(
        `User not found, creating new user with telegramId: ${userId}`,
      );

      try {
        user = await prisma.user.create({
          data: {
            telegramId: userId,
            username: `user_${userId}`,
            level: 1,
            experience: 0,
            streak: 0,
          },
          select: { id: true, telegramId: true, username: true },
        });

        console.log(
          `Created new user: ${user.id} (telegramId: ${user.telegramId})`,
        );

        // Also create UserStreak record for the new user
        await prisma.userStreak.create({
          data: {
            userId: user.id,
            currentStreak: 0,
            longestStreak: 0,
            totalCheckIns: 0,
          },
        });

        console.log(`Created UserStreak for user: ${user.id}`);
      } catch (createError: unknown) {
        // If user was created by another request (race condition), try to find again
        if (
          createError instanceof Error &&
          "code" in createError &&
          (createError as { code: string }).code === "P2002"
        ) {
          user = await prisma.user.findFirst({
            where: { telegramId: userId },
            select: { id: true, telegramId: true, username: true },
          });

          if (!user) {
            console.error("Failed to create or find user after P2002");
            res
              .status(500)
              .json({ success: false, error: "Failed to create user" });
            return;
          }
        } else {
          throw createError;
        }
      }
    }

    req.user = { userId: user.id, telegramId: user.telegramId || "" };
    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ success: false, error: "Auth failed" });
  }
};
