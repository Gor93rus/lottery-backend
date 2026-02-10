import { Request } from "express";
import { prisma } from "../prisma.js";

export async function getUserFromRequest(req: Request) {
  const telegramId = req.headers["x-telegram-id"] as string;
  const walletAddress = req.headers["x-wallet-address"] as string;

  if (!telegramId && !walletAddress) {
    return null;
  }

  if (telegramId) {
    return prisma.user.findFirst({ where: { telegramId } });
  }

  if (walletAddress) {
    return prisma.user.findFirst({ where: { tonWallet: walletAddress } });
  }

  return null;
}
