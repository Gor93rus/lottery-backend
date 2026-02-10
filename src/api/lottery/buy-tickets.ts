import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../lib/auth/middleware.js";
import { verifyTonTransaction } from "../../lib/ton/verifyTransaction.js";
import { notifyTicketPurchased } from "../../lib/telegram/bot.js";
import {
  sanitizeForLog,
  isValidHexHash,
  isValidWalletAddressFormat,
  TX_HASH_MIN_LENGTH,
  TX_HASH_MAX_LENGTH,
} from "../../lib/utils/sanitize.js";
import { validateBuyTickets } from "../../lib/middleware/validation.js";

const router = Router({ mergeParams: true });

interface BulkTicketRequest {
  numbers: number[][];
  transactionHash: string;
  walletAddress: string;
  slug?: string; // Lottery slug
  totalAmount?: number;
}

/**
 * Parse and validate numbers array from user input
 * This function creates a server-validated copy to prevent user-controlled security bypass
 *
 * @param raw - Raw user input to parse
 * @returns Validation result with parsed data or error message
 */
function parseAndValidateNumbers(
  raw: unknown,
): { valid: true; data: number[][] } | { valid: false; error: string } {
  // Check if input exists
  if (raw === undefined || raw === null) {
    return { valid: false, error: "Numbers are required" };
  }

  // Check if input is an array
  if (!Array.isArray(raw)) {
    return { valid: false, error: "Numbers must be an array" };
  }

  // Check for empty array
  if (raw.length === 0) {
    return { valid: false, error: "Numbers array cannot be empty" };
  }

  // Check array length limit
  if (raw.length > 100) {
    return {
      valid: false,
      error: "Cannot purchase more than 100 tickets at once",
    };
  }

  // Parse and validate each ticket
  const parsed: number[][] = [];
  for (let ticketIndex = 0; ticketIndex < raw.length; ticketIndex++) {
    const ticket = raw[ticketIndex];

    // Check if ticket is an array
    if (!Array.isArray(ticket)) {
      return {
        valid: false,
        error: `Ticket ${ticketIndex + 1} must be an array`,
      };
    }

    // Parse each number in the ticket
    const parsedTicket: number[] = [];
    for (const n of ticket) {
      // Coerce to number and validate
      const num = typeof n === "number" ? n : Number(n);

      // Check for NaN first
      if (Number.isNaN(num)) {
        return {
          valid: false,
          error: `Ticket ${ticketIndex + 1} contains invalid non-numeric value`,
        };
      }

      // Check if it's a valid integer >= 1
      if (!Number.isInteger(num)) {
        return {
          valid: false,
          error: `Ticket ${ticketIndex + 1} contains non-integer value: ${n}`,
        };
      }

      if (num < 1) {
        return {
          valid: false,
          error: `Ticket ${ticketIndex + 1} contains number less than 1: ${num}`,
        };
      }

      parsedTicket.push(num);
    }

    parsed.push(parsedTicket);
  }

  return { valid: true, data: parsed };
}

/**
 * POST /api/lottery/:slug/buy-tickets
 * Purchase multiple lottery tickets in one transaction
 * Applies 5% discount for 5 or more tickets
 */
router.post(
  "/",
  authMiddleware,
  validateBuyTickets,
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
      const { transactionHash, walletAddress }: BulkTicketRequest = req.body;

      // Validate slug
      if (!slug) {
        res.status(400).json({
          error: "Bad Request",
          message: "Lottery slug is required",
        });
        return;
      }

      // SECURITY: Parse and validate numbers array using server-validated copy
      // This prevents user-controlled bypass of security checks
      const parseResult = parseAndValidateNumbers(req.body.numbers);
      if (!parseResult.valid) {
        res.status(400).json({
          error: "Bad Request",
          message: parseResult.error,
        });
        return;
      }

      // Use server-validated data for all subsequent operations
      const numbers = parseResult.data;

      // SECURITY: Strict validation of transaction hash to prevent bypass attacks
      if (!transactionHash) {
        res.status(400).json({
          error: "Bad Request",
          message: "Transaction hash is required",
        });
        return;
      }

      // Validate transaction hash format (must be valid hex string)
      if (
        !isValidHexHash(transactionHash, TX_HASH_MIN_LENGTH, TX_HASH_MAX_LENGTH)
      ) {
        res.status(400).json({
          error: "Bad Request",
          message: "Invalid transaction hash format",
        });
        return;
      }

      // SECURITY: Strict validation of wallet address to prevent bypass attacks
      if (!walletAddress) {
        res.status(400).json({
          error: "Bad Request",
          message: "Wallet address is required",
        });
        return;
      }

      // Validate wallet address format
      if (!isValidWalletAddressFormat(walletAddress)) {
        res.status(400).json({
          error: "Bad Request",
          message: "Invalid wallet address format",
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

      // Validate all tickets have correct number count
      const ticketCount = numbers.length;
      for (let i = 0; i < ticketCount; i++) {
        const ticketNumbers = numbers[i];

        if (
          !Array.isArray(ticketNumbers) ||
          ticketNumbers.length !== lottery.numbersCount
        ) {
          res.status(400).json({
            error: "Bad Request",
            message: `Ticket ${i + 1}: Must select exactly ${lottery.numbersCount} numbers`,
          });
          return;
        }

        // Check all numbers are unique and within range
        const uniqueNumbers = [...new Set(ticketNumbers)];
        if (uniqueNumbers.length !== ticketNumbers.length) {
          res.status(400).json({
            error: "Bad Request",
            message: `Ticket ${i + 1}: All numbers must be unique`,
          });
          return;
        }

        const invalidNumbers = ticketNumbers.filter(
          (n) => n < 1 || n > lottery.numbersMax,
        );
        if (invalidNumbers.length > 0) {
          res.status(400).json({
            error: "Bad Request",
            message: `Ticket ${i + 1}: Numbers must be between 1 and ${lottery.numbersMax}`,
          });
          return;
        }
      }

      // Calculate expected amount using integer arithmetic in nanotons
      // to avoid floating-point precision issues
      const ticketPriceNano = BigInt(lottery.ticketPriceNano || "1000000000");
      let expectedAmountNano = ticketPriceNano * BigInt(ticketCount);

      // Apply 5% discount for 5 or more tickets
      let discountApplied = false;
      if (ticketCount >= 5) {
        // Calculate discount: subtract 5% (multiply by 95/100)
        expectedAmountNano = (expectedAmountNano * BigInt(95)) / BigInt(100);
        discountApplied = true;
        // ticketCount is derived from validated array length, so it's already a safe number
        console.log(
          `[Buy Tickets] Applied 5% discount for ${ticketCount} tickets`,
        );
      }

      // Validate ticketPriceNano is set
      if (!lottery.ticketPriceNano) {
        res.status(500).json({
          error: "Internal Server Error",
          message: "Ticket price not properly configured",
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

      // Verify the transaction on blockchain
      // This includes double-spend check inside verifyTonTransaction
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

      console.log("[Buy Tickets] Transaction verified successfully:", {
        hash: sanitizeForLog(transactionHash, 64),
        amount: verification.transaction?.amount.toString(),
        sender: sanitizeForLog(walletAddress, 48),
        ticketCount, // Already a safe number from validated array length
        discount: discountApplied ? "5%" : "none",
      });

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

      // Create transaction record first
      // Use atomic transaction creation with ticket creation to prevent race conditions
      const expectedAmountTON = Number(expectedAmountNano) / 1e9;

      const result = await prisma.$transaction(async (tx) => {
        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            userId: user.id,
            type: "ticket_purchase",
            tonTxHash: transactionHash,
            tonAmount: expectedAmountTON,
            tonSender: walletAddress,
            tonReceiver: lotteryWallet,
            status: "confirmed",
            metadata: {
              ticketCount,
              discount: discountApplied ? 0.05 : 0,
              lotterySlug: slug,
            },
          },
        });

        // Create all tickets
        const createdTickets = await Promise.all(
          numbers.map((ticketNumbers, index) =>
            tx.ticket.create({
              data: {
                lotteryId: lottery.id,
                lotterySlug: lottery.slug,
                userId: user.id,
                drawId: nextDraw.id,
                numbers: ticketNumbers.sort((a, b) => a - b),
                status: "active",
                transactionId: transaction.id,
                // Only store txHash on the first ticket to maintain uniqueness constraint
                txHash: index === 0 ? transactionHash : null,
                walletAddress: walletAddress,
                price: lottery.ticketPrice,
              },
            }),
          ),
        );

        return { transaction, createdTickets };
      });

      // Update draw stats
      await prisma.draw.update({
        where: { id: nextDraw.id },
        data: {
          totalTickets: { increment: ticketCount },
          totalCollected: { increment: expectedAmountTON },
          totalPrizePool: { increment: expectedAmountTON }, // Legacy field
        },
      });

      // Cap XP gain to prevent abuse (max 50 tickets worth of XP per transaction)
      const xpGain = Math.min(10 * ticketCount, 500);

      // Update user stats
      await prisma.user.update({
        where: { id: user.id },
        data: {
          totalSpent: { increment: expectedAmountTON },
          experience: { increment: xpGain },
        },
      });

      // Send notification for first ticket only if user has telegram ID
      if (user.telegramId) {
        await notifyTicketPurchased(
          user.telegramId,
          lottery.name,
          result.createdTickets[0].numbers,
          nextDraw.drawTime,
        );
      }

      // Calculate saved amount for discount display
      const savedAmount = discountApplied
        ? ((Number(ticketPriceNano) * ticketCount * 0.05) / 1e9).toFixed(4)
        : "0";

      res.json({
        success: true,
        message: `Successfully purchased ${ticketCount} ticket${ticketCount > 1 ? "s" : ""}`,
        tickets: result.createdTickets.map((ticket) => ({
          id: ticket.id,
          numbers: ticket.numbers,
          status: ticket.status,
        })),
        discount: discountApplied
          ? {
              applied: true,
              percentage: 5,
              savedAmount,
            }
          : {
              applied: false,
              message: "Buy 5 or more tickets to get 5% discount",
            },
        draw: {
          drawNumber: nextDraw.drawNumber,
          drawTime: nextDraw.drawTime.toISOString(),
          scheduledAt: nextDraw.drawTime.toISOString(), // Legacy
        },
        transaction: {
          id: result.transaction.id,
          hash: result.transaction.tonTxHash,
          amount: result.transaction.tonAmount,
          status: result.transaction.status,
        },
      });
    } catch (error) {
      console.error("Buy tickets error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to purchase tickets",
      });
    }
  },
);

export default router;
