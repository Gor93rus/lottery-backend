/**
 * Draw Engine Service
 * Manages the complete draw lifecycle:
 * SCHEDULED → OPEN → LOCKED → DRAWING → CALCULATING → PAYING → COMPLETED
 */

import { prisma } from "../lib/prisma.js";
import { sanitizeId } from "../lib/utils/sanitize.js";
import {
  generateServerSeed,
  hashServerSeed,
  generateDrawNumbers,
} from "./provablyFair.js";
import {
  calculateWinnersAndPayouts,
  updateTicketResults,
} from "./winnerCalculator.js";
import { liveDrawBroadcast } from "./telegram/liveDrawBroadcast.js";
import { notifyDrawResults } from "./telegram/drawResultsNotifier.js";

/**
 * Create a new draw for a lottery
 * Generates server seed and calculates timing based on draw time
 */
export async function createDraw(
  lotteryId: string,
  drawTime: Date,
): Promise<{ drawId: string; serverSeed: string; serverSeedHash: string }> {
  try {
    // Get lottery details
    const lottery = await prisma.lottery.findUnique({
      where: { id: lotteryId },
    });

    if (!lottery) {
      throw new Error("Lottery not found");
    }

    // Get next draw number
    const lastDraw = await prisma.draw.findFirst({
      where: { lotteryId },
      orderBy: { drawNumber: "desc" },
    });

    const drawNumber = lastDraw ? lastDraw.drawNumber + 1 : 1;

    // Generate server seed and hash
    const serverSeed = generateServerSeed();
    const serverSeedHash = hashServerSeed(serverSeed);

    // Calculate timing
    // Sales close 30 minutes before draw
    const salesCloseAt = new Date(drawTime.getTime() - 30 * 60 * 1000);

    // Sales open immediately (or at specific time if needed)
    const salesOpenAt = new Date();

    // Create draw
    const draw = await prisma.draw.create({
      data: {
        lotteryId,
        drawNumber,
        status: "open",
        salesOpenAt,
        salesCloseAt,
        drawTime,
        scheduledAt: drawTime, // Legacy field
        serverSeedHash,
        winningNumbers: [],
        currency: lottery.currency,
        totalTickets: 0,
        totalCollected: 0,
        winners5: 0,
        winners4: 0,
        winners3: 0,
        winners2: 0,
        winners1: 0,
        payout1Amount: 0.1, // Default for 1 match
      },
    });

    console.log("Created new draw", {
      drawId: sanitizeId(draw.id),
      lotteryId: sanitizeId(lotteryId),
      drawNumber,
      drawTime: drawTime.toISOString(),
      salesCloseAt: salesCloseAt.toISOString(),
    });

    return {
      drawId: draw.id,
      serverSeed,
      serverSeedHash,
    };
  } catch (error) {
    console.error("Error creating draw", {
      lotteryId: sanitizeId(lotteryId),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("Failed to create draw");
  }
}

/**
 * Lock draw sales
 * Called automatically 30 minutes before draw time
 * Prevents new ticket purchases
 */
export async function lockDraw(drawId: string): Promise<void> {
  try {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: { _count: { select: { tickets: true } } },
    });

    if (!draw) {
      throw new Error("Draw not found");
    }

    // Check if already locked
    if (draw.status !== "open") {
      console.log("Draw already locked or completed", {
        drawId: sanitizeId(drawId),
        status: draw.status,
      });
      return;
    }

    // Check if minimum tickets sold (at least 1)
    const ticketCount = draw._count.tickets;
    if (ticketCount === 0) {
      // Cancel draw if no tickets sold
      await prisma.draw.update({
        where: { id: drawId },
        data: {
          status: "cancelled",
          lockedAt: new Date(),
        },
      });

      console.log("Draw cancelled - no tickets sold", {
        drawId: sanitizeId(drawId),
      });
      return;
    }

    // Lock the draw
    await prisma.draw.update({
      where: { id: drawId },
      data: {
        status: "locked",
        lockedAt: new Date(),
      },
    });

    console.log("Draw locked", {
      drawId: sanitizeId(drawId),
      ticketCount,
    });
  } catch (error) {
    console.error("Error locking draw", {
      drawId: sanitizeId(drawId),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("Failed to lock draw");
  }
}

/**
 * Execute draw
 * Generates winning numbers using Provably Fair algorithm
 * Calculates winners and payouts
 */
export async function executeDraw(
  drawId: string,
  serverSeed: string,
): Promise<void> {
  try {
    // Get draw with lottery and fund info
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: {
        lottery: true,
        _count: { select: { tickets: true } },
      },
    });

    if (!draw) {
      throw new Error("Draw not found");
    }

    // Verify draw is locked
    if (draw.status !== "locked") {
      throw new Error(`Cannot execute draw in status: ${draw.status}`);
    }

    // Verify server seed matches hash
    const calculatedHash = hashServerSeed(serverSeed);
    if (calculatedHash !== draw.serverSeedHash) {
      throw new Error("Server seed does not match stored hash");
    }

    console.log("Starting draw execution", {
      drawId: sanitizeId(drawId),
      lotteryId: sanitizeId(draw.lotteryId),
      ticketCount: draw._count.tickets,
    });

    // Update status to DRAWING
    await prisma.draw.update({
      where: { id: drawId },
      data: { status: "drawing" },
    });

    // Generate winning numbers using Provably Fair
    const { winningNumbers, clientSeed, clientSeedBlockNumber } =
      await generateDrawNumbers(
        serverSeed,
        draw.nonce,
        draw.lottery.numbersCount,
        draw.lottery.numbersMax,
      );

    console.log("Generated winning numbers", {
      drawId: sanitizeId(drawId),
      winningNumbers,
      clientSeedBlockNumber: clientSeedBlockNumber.toString(),
    });

    // Update draw with winning numbers and seeds
    await prisma.draw.update({
      where: { id: drawId },
      data: {
        status: "calculating",
        winningNumbers,
        serverSeed,
        clientSeed,
        clientSeedBlockNumber,
        drawnAt: new Date(),
        executedAt: new Date(), // Legacy field
      },
    });

    // Get fund snapshot
    const fund = await prisma.lotteryFund.findUnique({
      where: {
        lotteryId_currency: {
          lotteryId: draw.lotteryId,
          currency: draw.currency,
        },
      },
    });

    // Calculate winners and payouts
    const result = await calculateWinnersAndPayouts(
      drawId,
      draw.lotteryId,
      draw.currency,
      winningNumbers,
    );

    console.log("Calculated winners and payouts", {
      drawId: sanitizeId(drawId),
      winners5: result.winnerStats.winners5,
      winners4: result.winnerStats.winners4,
      winners3: result.winnerStats.winners3,
      winners2: result.winnerStats.winners2,
      winners1: result.winnerStats.winners1,
      totalPaidOut: result.totalPaidOut,
    });

    // Update ticket results
    await updateTicketResults(drawId, winningNumbers, result.payoutAmounts);

    // Update draw with results
    await prisma.draw.update({
      where: { id: drawId },
      data: {
        status: "paying",
        winners5: result.winnerStats.winners5,
        winners4: result.winnerStats.winners4,
        winners3: result.winnerStats.winners3,
        winners2: result.winnerStats.winners2,
        winners1: result.winnerStats.winners1,
        jackpotAmount: result.payoutAmounts.jackpotAmount,
        payout4Amount: result.payoutAmounts.payout4Amount,
        payout3Amount: result.payoutAmounts.payout3Amount,
        payout2Amount: result.payoutAmounts.payout2Amount,
        payout1Amount: result.payoutAmounts.payout1Amount,
        prizePoolSnapshot: fund?.prizePool || 0,
        jackpotPoolSnapshot: fund?.jackpotPool || 0,
        toJackpot: result.toJackpot,
        toReserve: result.toReserve,
        // Legacy fields maintained for backward compatibility
        totalPaid: result.totalPaidOut,
        totalPaidOut: result.totalPaidOut,
        totalWinners:
          result.winnerStats.winners5 +
          result.winnerStats.winners4 +
          result.winnerStats.winners3 +
          result.winnerStats.winners2 +
          result.winnerStats.winners1,
      },
    });

    console.log("Draw execution completed", {
      drawId: sanitizeId(drawId),
      totalWinners:
        result.winnerStats.winners5 +
        result.winnerStats.winners4 +
        result.winnerStats.winners3 +
        result.winnerStats.winners2 +
        result.winnerStats.winners1,
      totalPaidOut: result.totalPaidOut,
    });

    // Send live broadcast and results notifications (async, don't block)
    if (process.env.ENABLE_NOTIFICATIONS === "true") {
      // Fire and forget - notifications run in background
      Promise.all([
        liveDrawBroadcast.broadcastToParticipants(
          draw.id,
          winningNumbers,
          serverSeed,
        ),
        notifyDrawResults(draw.id),
      ]).catch((error) => {
        console.error("Failed to send draw notifications:", error);
        // Don't throw - notifications are not critical
      });
    }
  } catch (error) {
    console.error("Error executing draw", {
      drawId: sanitizeId(drawId),
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // Revert draw status to locked on error
    try {
      await prisma.draw.update({
        where: { id: drawId },
        data: { status: "locked" },
      });
    } catch (revertError) {
      console.error("Failed to revert draw status", {
        drawId: sanitizeId(drawId),
        error:
          revertError instanceof Error ? revertError.message : "Unknown error",
      });
    }

    throw new Error("Failed to execute draw");
  }
}

/**
 * Complete draw
 * Finalizes the draw after payouts are processed
 */
export async function completeDraw(drawId: string): Promise<void> {
  try {
    await prisma.draw.update({
      where: { id: drawId },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });

    console.log("Draw completed", {
      drawId: sanitizeId(drawId),
    });
  } catch (error) {
    console.error("Error completing draw", {
      drawId: sanitizeId(drawId),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("Failed to complete draw");
  }
}

/**
 * Cancel draw
 * Can only cancel scheduled or locked draws
 */
export async function cancelDraw(drawId: string): Promise<void> {
  try {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
    });

    if (!draw) {
      throw new Error("Draw not found");
    }

    // Only allow cancelling scheduled or locked draws
    if (!["scheduled", "open", "locked"].includes(draw.status)) {
      throw new Error(`Cannot cancel draw in status: ${draw.status}`);
    }

    await prisma.draw.update({
      where: { id: drawId },
      data: {
        status: "cancelled",
        completedAt: new Date(),
      },
    });

    console.log("Draw cancelled", {
      drawId: sanitizeId(drawId),
      previousStatus: draw.status,
    });
  } catch (error) {
    console.error("Error cancelling draw", {
      drawId: sanitizeId(drawId),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("Failed to cancel draw");
  }
}

/**
 * Check if a draw is accepting ticket purchases
 */
export async function isDrawAcceptingPurchases(
  drawId: string,
): Promise<boolean> {
  try {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      select: { status: true, salesCloseAt: true },
    });

    if (!draw) {
      return false;
    }

    // Only accept purchases if draw is OPEN and before sales close time
    const now = new Date();
    return draw.status === "open" && now < draw.salesCloseAt;
  } catch (error) {
    console.error("Error checking draw purchase status", {
      drawId: sanitizeId(drawId),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}
