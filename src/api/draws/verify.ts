import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { sanitizeId } from "../../lib/utils/sanitize.js";
import { verifyWinningNumbers } from "../../services/provablyFair.js";

const router = Router();

/**
 * GET /api/draws/:id/verify
 * Get Provably Fair verification data for a draw
 * Allows users to verify that winning numbers were generated fairly
 */
router.get("/:id/verify", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get draw
    const draw = await prisma.draw.findUnique({
      where: { id: id as string },
      include: {
        lottery: {
          select: {
            id: true,
            name: true,
            slug: true,
            numbersCount: true,
            numbersMax: true,
          },
        },
      },
    });

    if (!draw) {
      res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Draw not found",
      });
      return;
    }

    // Check if draw has been executed (seeds revealed)
    if (!draw.serverSeed || !draw.clientSeed) {
      res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Draw not yet executed - seeds not revealed",
      });
      return;
    }

    // Verify the winning numbers
    let isValid = false;
    if (draw.serverSeed && draw.clientSeed) {
      isValid = verifyWinningNumbers(
        draw.serverSeed,
        draw.clientSeed,
        draw.nonce,
        draw.winningNumbers,
        draw.lottery.numbersCount,
        draw.lottery.numbersMax,
      );
    }

    res.json({
      success: true,
      verification: {
        drawId: draw.id,
        drawNumber: draw.drawNumber,
        lottery: draw.lottery,

        // Provably Fair data
        serverSeed: draw.serverSeed,
        serverSeedHash: draw.serverSeedHash,
        clientSeed: draw.clientSeed,
        clientSeedBlockNumber: draw.clientSeedBlockNumber?.toString() || null,
        nonce: draw.nonce,

        // Results
        winningNumbers: draw.winningNumbers,

        // Verification
        isValid,

        // Instructions for manual verification
        instructions: {
          step1: "Verify serverSeedHash = SHA256(serverSeed)",
          step2:
            "Verify clientSeed matches TON block hash at clientSeedBlockNumber",
          step3: "Combine: seed = serverSeed + clientSeed + nonce",
          step4: "Generate numbers using provably fair algorithm",
          step5: "Compare generated numbers with winningNumbers",
        },

        // Algorithm
        algorithm: "SHA-256 based provably fair number generation",
      },
    });
  } catch (error) {
    console.error("Draw verification error", {
      drawId: sanitizeId(req.params.id),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch verification data",
    });
  }
});

export default router;
