import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { validatePurchaseTicket } from "../../lib/middleware/validation.js";

const router = Router();

// POST /api/tickets/purchase
router.post(
  "/",
  validatePurchaseTicket,
  async (req: Request, res: Response) => {
    try {
      const {
        lotterySlug,
        numbers,
        txHash,
        walletAddress,
        price,
        currency = "TON",
      } = req.body;

      // Validate required fields
      if (!lotterySlug || !numbers || !txHash || !walletAddress || !price) {
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields" });
      }

      // Validate numbers
      if (!Array.isArray(numbers) || numbers.length !== 5) {
        return res
          .status(400)
          .json({ success: false, error: "Must select exactly 5 numbers" });
      }

      if (new Set(numbers).size !== numbers.length) {
        return res
          .status(400)
          .json({ success: false, error: "Numbers must be unique" });
      }

      if (numbers.some((n: number) => n < 1 || n > 36)) {
        return res
          .status(400)
          .json({ success: false, error: "Numbers must be between 1 and 36" });
      }

      // Find lottery
      const lottery = await prisma.lottery.findUnique({
        where: { slug: lotterySlug },
      });
      if (!lottery) {
        return res
          .status(404)
          .json({ success: false, error: "Lottery not found" });
      }

      // Find active draw
      const currentDraw = await prisma.draw.findFirst({
        where: { lotteryId: lottery.id, status: { in: ["scheduled", "open"] } },
        orderBy: { drawTime: "asc" },
      });

      if (!currentDraw) {
        return res
          .status(400)
          .json({ success: false, error: "No active draw available" });
      }

      // Check duplicate txHash
      const existingTicket = await prisma.ticket.findFirst({
        where: { txHash },
      });
      if (existingTicket) {
        return res
          .status(400)
          .json({ success: false, error: "Transaction already processed" });
      }

      // Create ticket
      const ticket = await prisma.ticket.create({
        data: {
          lotteryId: lottery.id,
          lotterySlug,
          drawId: currentDraw.id,
          numbers: numbers.sort((a: number, b: number) => a - b),
          txHash,
          walletAddress,
          price,
          currency,
          status: "active",
        },
      });

      // Update draw stats
      await prisma.draw.update({
        where: { id: currentDraw.id },
        data: {
          totalTickets: { increment: 1 },
          totalCollected: { increment: price },
        },
      });

      // Update lottery fund
      const fund = await prisma.lotteryFund.findFirst({
        where: { lotteryId: lottery.id, currency },
      });
      const config = await prisma.lotteryPayoutConfig.findUnique({
        where: { lotteryId: lottery.id },
      });

      if (fund && config) {
        const platformAmount = price * config.platformShare;
        const prizeAmount = price * config.prizeShare;
        const jackpotAmount = prizeAmount * config.jackpotShare;
        const prizePoolAmount = prizeAmount - jackpotAmount;
        const reserveAmount = platformAmount * config.reserveShare;

        await prisma.lotteryFund.update({
          where: { id: fund.id },
          data: {
            prizePool: { increment: prizePoolAmount },
            jackpotPool: { increment: jackpotAmount },
            reservePool: { increment: reserveAmount },
            totalCollected: { increment: price },
          },
        });
      } else {
        console.warn("Lottery fund or payout config not found", {
          lotteryId: lottery.id,
          currency,
        });
      }

      console.log("Ticket purchased", { ticketId: ticket.id, lotterySlug });

      res.status(201).json({
        id: ticket.id,
        lotterySlug: ticket.lotterySlug,
        numbers: ticket.numbers,
        txHash: ticket.txHash,
        walletAddress: ticket.walletAddress,
        price: ticket.price,
        purchasedAt: ticket.purchasedAt.toISOString(),
        status: "active",
        currency: ticket.currency,
      });
    } catch (error) {
      console.error("Purchase ticket error", {
        error: error instanceof Error ? error.message : "Unknown",
      });
      res
        .status(500)
        .json({ success: false, error: "Failed to purchase ticket" });
    }
  },
);

export default router;
