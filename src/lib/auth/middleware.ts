import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn(
    "[Auth] JWT_SECRET не настроен. Аутентификация по JWT будет отключена.",
  );
}

// --- Интерфейсы и Типы ---
export interface AuthPayload {
  userId: string;
  telegramId: string;
}

// Extend Express Request interface using module augmentation (ESLint compliant)
declare module "express-serve-static-core" {
  interface Request {
    user?: AuthPayload;
  }
}

// --- Функции валидации ---
const CUID_REGEX = /^c[a-z0-9]{24}$/;
function isValidCuid(id: unknown): id is string {
  return typeof id === "string" && CUID_REGEX.test(id);
}

/**
 * Единый, безопасный middleware для аутентификации.
 */
export const unifiedAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // Обещает ничего не возвращать (void)
  // Приоритет 1: JWT
  if (JWT_SECRET) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
        req.user = { userId: decoded.userId, telegramId: decoded.telegramId };
        return next();
      } catch (jwtError) {
        // ИСПРАВЛЕНО: Убрано `return`
        res
          .status(401)
          .json({ success: false, error: "Invalid or expired token." });
        return; // Добавляем return здесь, чтобы остановить выполнение
      }
    }
  }

  // Приоритет 2: x-user-id
  const headerUserId = req.headers["x-user-id"];
  if (!isValidCuid(headerUserId)) {
    // ИСПРАВЛЕНО: Убрано `return`
    res.status(401).json({
      success: false,
      error: "Unauthorized",
      message:
        "No valid JWT token or a valid CUID in x-user-id header was provided.",
    });
    return; // Добавляем return здесь, чтобы остановить выполнение
  }

  try {
    const userFromDb = await prisma.user.findUnique({
      where: { id: headerUserId },
      select: { id: true, telegramId: true, isBlocked: true },
    });

    if (!userFromDb) {
      // ИСПРАВЛЕНО: Убрано `return`
      res.status(404).json({ success: false, error: "User not found." });
      return; // Добавляем return здесь, чтобы остановить выполнение
    }
    if (userFromDb.isBlocked) {
      // ИСПРАВЛЕНО: Убрано `return`
      res
        .status(403)
        .json({ success: false, error: "User account is blocked." });
      return; // Добавляем return здесь, чтобы остановить выполнение
    }

    req.user = {
      userId: userFromDb.id,
      telegramId: userFromDb.telegramId || "",
    };
    return next();
  } catch (error) {
    console.error("[Auth] Ошибка при проверке x-user-id:", error);
    // ИСПРАВЛЕНО: Убрано `return`
    res.status(500).json({ success: false, error: "Internal Server Error" });
    return; // Добавляем return здесь, чтобы остановить выполнение
  }
};

// Остальные функции без изменений
export const authMiddleware = unifiedAuthMiddleware;

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (JWT_SECRET) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
        req.user = { userId: decoded.userId, telegramId: decoded.telegramId };
      } catch {
        // Игнорируем ошибки
      }
    }
  }
  next();
};

export const generateToken = (userId: string, telegramId: string): string => {
  if (!JWT_SECRET)
    throw new Error("JWT_SECRET must be configured to generate tokens.");
  return jwt.sign({ userId, telegramId }, JWT_SECRET, { expiresIn: "30d" });
};

export const verifyToken = (token: string): AuthPayload => {
  if (!JWT_SECRET)
    throw new Error("JWT_SECRET must be configured to verify tokens.");
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
};
