import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";

const router = Router();

// GET /api/tickets/user/:walletAddress
router.get("/:walletAddress", async (req: Request, res: Response) => {
  try {
    const walletAddress = Array.isArray(req.params.walletAddress)
      ? req.params.walletAddress[0]
      : req.params.walletAddress;

    if (!walletAddress) {
      return res
        .status(400)
        .json({ success: false, error: "Wallet address is required" });
    }

    const tickets = await prisma.ticket.findMany({
      where: { walletAddress },
      include: { draw: { include: { lottery: true } } },
      orderBy: { createdAt: "desc" },
    });

    const formattedTickets = tickets.map((ticket) => {
      let status = "active";
      if (ticket.draw && ticket.draw.status === "completed") {
        status = ticket.prizeAmount && ticket.prizeAmount > 0 ? "won" : "lost";
      }

      return {
        id: ticket.id,
        lotterySlug: ticket.lotterySlug,
        numbers: ticket.numbers,
        txHash: ticket.txHash,
        walletAddress: ticket.walletAddress,
        price: ticket.price,
        purchasedAt: ticket.purchasedAt.toISOString(),
        status,
        currency: ticket.currency,
        prizeAmount: ticket.prizeAmount,
        matchedNumbers: ticket.matchedNumbers,
        createdAt: ticket.createdAt.toISOString(),
      };
    });

    res.json({ tickets: formattedTickets, count: formattedTickets.length });
  } catch (error) {
    console.error("Get user tickets error", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    res.status(500).json({ success: false, error: "Failed to get tickets" });
  }
});

export default router;
