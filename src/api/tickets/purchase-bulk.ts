import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { validatePurchaseTicketsBulk } from "../../lib/middleware/validation.js";

const router = Router();

// POST /api/tickets/purchase-bulk
router.post(
  "/",
  validatePurchaseTicketsBulk,
  async (req: Request, res: Response) => {
    try {
      const { tickets } = req.body;

      if (!Array.isArray(tickets) || tickets.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "Tickets array is required" });
      }

      if (tickets.length > 10) {
        return res.status(400).json({
          success: false,
          error: "Maximum 10 tickets per transaction",
        });
      }

      const purchasedTickets = [];
      const skipped = [];

      for (const ticketData of tickets) {
        const {
          lotterySlug,
          numbers,
          txHash,
          walletAddress,
          price,
          currency = "TON",
        } = ticketData;

        const lottery = await prisma.lottery.findUnique({
          where: { slug: lotterySlug },
        });
        if (!lottery) {
          skipped.push({ txHash, reason: "Lottery not found" });
          continue;
        }

        const currentDraw = await prisma.draw.findFirst({
          where: {
            lotteryId: lottery.id,
            status: { in: ["scheduled", "open"] },
          },
          orderBy: { drawTime: "asc" },
        });

        if (!currentDraw) {
          skipped.push({ txHash, reason: "No active draw" });
          continue;
        }

        const exists = await prisma.ticket.findFirst({ where: { txHash } });
        if (exists) {
          skipped.push({ txHash, reason: "Duplicate transaction" });
          continue;
        }

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

        await prisma.draw.update({
          where: { id: currentDraw.id },
          data: {
            totalTickets: { increment: 1 },
            totalCollected: { increment: price },
          },
        });

        purchasedTickets.push({
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
      }

      console.log("Bulk tickets purchased", {
        count: purchasedTickets.length,
        skipped: skipped.length,
      });
      if (skipped.length > 0) {
        console.log("Skipped tickets", { skipped });
      }

      res.status(201).json(purchasedTickets);
    } catch (error) {
      console.error("Bulk purchase error", {
        error: error instanceof Error ? error.message : "Unknown",
      });
      res
        .status(500)
        .json({ success: false, error: "Failed to purchase tickets" });
    }
  },
);

export default router;
