import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../lib/auth/middleware.js";
import { verifyTonTransaction } from "../../lib/ton/verifyTransaction.js";
import { notifyTicketPurchased } from "../../lib/telegram/bot.js";
import { validateBuyTicket } from "../../lib/middleware/validation.js";

const router = Router({ mergeParams: true });

interface BuyTicketRequest {
  numbers: number[];
  transactionHash?: string;
  walletAddress?: string;
  slug?: string; // Lottery slug
}

/**
 * POST /api/lottery/:slug/buy-ticket
 * Purchase a lottery ticket
 */
router.post(
  "/",
  authMiddleware,
  validateBuyTicket,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      const slug = req.params.slug || req.body.slug || req.query.slug;
      const { numbers, transactionHash, walletAddress }: BuyTicketRequest =
        req.body;

      if (!slug) {
        res.status(400).json({
          error: "Bad Request",
          message: "Lottery slug is required",
        });
        return;
      }

      // Validate numbers
      if (!Array.isArray(numbers) || numbers.length === 0) {
        res.status(400).json({
          error: "Bad Request",
          message: "Numbers array is required",
        });
        return;
      }

      // Get lottery
      const lottery = await prisma.lottery.findUnique({
        where: { slug },
      });

      if (!lottery) {
        res.status(404).json({
          error: "Not Found",
          message: `Lottery '${slug}' not found`,
        });
        return;
      }

      if (!lottery.active) {
        res.status(400).json({
          error: "Bad Request",
          message: "This lottery is not currently active",
        });
        return;
      }

      // Validate numbers
      if (numbers.length !== lottery.numbersCount) {
        res.status(400).json({
          error: "Bad Request",
          message: `Must select exactly ${lottery.numbersCount} numbers`,
        });
        return;
      }

      // Check all numbers are unique and within range
      const uniqueNumbers = [...new Set(numbers)];
      if (uniqueNumbers.length !== numbers.length) {
        res.status(400).json({
          error: "Bad Request",
          message: "All numbers must be unique",
        });
        return;
      }

      const invalidNumbers = numbers.filter(
        (n) => n < 1 || n > lottery.numbersMax,
      );
      if (invalidNumbers.length > 0) {
        res.status(400).json({
          error: "Bad Request",
          message: `Numbers must be between 1 and ${lottery.numbersMax}`,
        });
        return;
      }

      // Get next draw that is accepting purchases
      const nextDraw = await prisma.draw.findFirst({
        where: {
          lotteryId: lottery.id,
          status: "open",
          salesCloseAt: { gt: new Date() },
        },
        orderBy: { drawTime: "asc" },
      });

      if (!nextDraw) {
        res.status(400).json({
          error: "Bad Request",
          message: "No active draw available for ticket purchases",
        });
        return;
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });

      if (!user) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Verify TON transaction if hash provided
      if (transactionHash) {
        // Validate wallet address is provided
        if (!walletAddress) {
          res.status(400).json({
            error: "Bad Request",
            message: "Wallet address is required for transaction verification",
          });
          return;
        }

        // Get lottery wallet from environment
        const lotteryWallet =
          process.env.LOTTERY_WALLET_ADDRESS || process.env.LOTTERY_WALLET;
        if (!lotteryWallet) {
          res.status(500).json({
            error: "Internal Server Error",
            message: "Lottery wallet not configured",
          });
          return;
        }

        // Validate ticketPriceNano is set
        if (!lottery.ticketPriceNano) {
          res.status(500).json({
            error: "Internal Server Error",
            message: "Ticket price not properly configured",
          });
          return;
        }

        // Convert ticket price to nanotons
        const expectedAmountNano = BigInt(lottery.ticketPriceNano);

        // Verify the transaction on blockchain (includes double-spend check)
        const verification = await verifyTonTransaction(
          transactionHash,
          lotteryWallet,
          expectedAmountNano,
          walletAddress,
        );

        if (!verification.isValid) {
          res.status(400).json({
            error: "Bad Request",
            message: verification.error || "Transaction verification failed",
          });
          return;
        }

        console.log("[Buy Ticket] Transaction verified successfully:", {
          hash: transactionHash,
          amount: verification.transaction?.amount.toString(),
          sender: walletAddress,
        });
      }

      // Create transaction record
      let transaction = null;
      if (transactionHash) {
        transaction = await prisma.transaction.create({
          data: {
            userId: user.id,
            type: "ticket_purchase",
            tonTxHash: transactionHash,
            tonAmount: lottery.ticketPrice,
            tonSender: user.tonWallet || "",
            status: "confirmed",
          },
        });
      }

      // Create ticket
      const ticket = await prisma.ticket.create({
        data: {
          lotteryId: lottery.id,
          lotterySlug: lottery.slug,
          userId: user.id,
          drawId: nextDraw.id,
          numbers: numbers.sort((a, b) => a - b),
          status: "active",
          transactionId: transaction?.id,
          txHash: transactionHash,
          walletAddress: walletAddress,
          price: lottery.ticketPrice,
        },
      });

      // Update draw stats
      await prisma.draw.update({
        where: { id: nextDraw.id },
        data: {
          totalTickets: { increment: 1 },
          totalCollected: { increment: lottery.ticketPrice },
          totalPrizePool: { increment: lottery.ticketPrice }, // Legacy field
        },
      });

      // Update user stats
      await prisma.user.update({
        where: { id: user.id },
        data: {
          totalSpent: { increment: lottery.ticketPrice },
          lastActiveAt: new Date(),
        },
      });

      // Process gamification (quests, achievements, XP, etc.)
      try {
        const { processTicketPurchase } =
          await import("../../services/gamificationService.js");
        await processTicketPurchase(user.id);
      } catch (gamificationError) {
        console.error("Gamification processing error:", gamificationError);
        // Don't fail the ticket purchase if gamification fails
      }

      // Send notification only if user has telegram ID
      if (user.telegramId) {
        await notifyTicketPurchased(
          user.telegramId,
          lottery.name,
          ticket.numbers,
          nextDraw.drawTime,
        );
      }

      res.json({
        success: true,
        message: "Ticket purchased successfully",
        ticket: {
          id: ticket.id,
          numbers: ticket.numbers,
          drawNumber: nextDraw.drawNumber,
          drawTime: nextDraw.drawTime.toISOString(),
          scheduledAt: nextDraw.drawTime.toISOString(), // Legacy
          status: ticket.status,
        },
        transaction: transaction
          ? {
              id: transaction.id,
              hash: transaction.tonTxHash,
              amount: transaction.tonAmount,
              status: transaction.status,
            }
          : null,
      });
    } catch (error) {
      console.error("Buy ticket error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to purchase ticket",
      });
    }
  },
);

export default router;
