import { Address } from "@ton/ton";
import { prisma } from "../prisma.js";
import {
  fetchTransactionFromBlockchain,
  addressesMatch,
} from "./tonApiService.js";
import { sanitizeForLog } from "../utils/sanitize.js";

/**
 * Verification constants
 */
const AMOUNT_TOLERANCE_NANOTON = BigInt(10000000); // 0.01 TON tolerance for network fees
const ONE_HOUR_IN_SECONDS = 3600; // Maximum transaction age in seconds

interface TransactionVerification {
  isValid: boolean;
  error?: string;
  transaction?: {
    hash: string;
    amount: bigint;
    sender: string;
    recipient: string;
    timestamp: number;
    lt: bigint;
    confirmed: boolean;
  };
}

/**
 * Verify TON transaction on blockchain
 * @param txHash Transaction hash to verify
 * @param expectedRecipient Expected recipient address (lottery wallet)
 * @param expectedAmount Expected amount in nanotons
 * @param senderAddress Sender wallet address
 */
export async function verifyTonTransaction(
  txHash: string,
  expectedRecipient: string,
  expectedAmount: bigint,
  senderAddress: string,
): Promise<TransactionVerification> {
  try {
    console.log("[TON Verify] Checking transaction", {
      txHash: sanitizeForLog(txHash, 64),
      expectedAmount: expectedAmount.toString(),
      expectedRecipient: sanitizeForLog(expectedRecipient, 48),
      sender: sanitizeForLog(senderAddress, 48),
    });

    // 1. Validate input parameters
    if (!txHash || txHash.length === 0) {
      return {
        isValid: false,
        error: "Transaction hash is required",
      };
    }

    if (!senderAddress) {
      return {
        isValid: false,
        error: "Sender wallet address is required",
      };
    }

    // 2. Check if transaction already used for another ticket
    const existingTicket = await prisma.ticket.findFirst({
      where: { txHash },
    });

    if (existingTicket) {
      return {
        isValid: false,
        error:
          "Transaction already used for another ticket (double-spend prevention)",
      };
    }

    // 3. Validate addresses format
    try {
      Address.parse(expectedRecipient);
      Address.parse(senderAddress);
    } catch (err) {
      return {
        isValid: false,
        error: "Invalid wallet address format",
      };
    }

    // 4. Fetch transaction from blockchain using TON Center API
    console.log("[TON Verify] Fetching transaction from blockchain...");
    const blockchainResult = await fetchTransactionFromBlockchain(
      txHash,
      expectedRecipient,
      senderAddress,
    );

    if (!blockchainResult.isValid || !blockchainResult.transaction) {
      console.error(
        "[TON Verify] Blockchain verification failed:",
        blockchainResult.error,
      );
      return {
        isValid: false,
        error: blockchainResult.error || "Transaction not found on blockchain",
      };
    }

    const transaction = blockchainResult.transaction;

    // 5. Verify transaction is confirmed
    if (!transaction.confirmed) {
      return {
        isValid: false,
        error: "Transaction is not yet confirmed",
      };
    }

    // 6. Verify amount matches (with small tolerance for fees)
    if (transaction.amount < expectedAmount - AMOUNT_TOLERANCE_NANOTON) {
      const actualTON = Number(transaction.amount) / 1e9;
      const expectedTON = Number(expectedAmount) / 1e9;
      return {
        isValid: false,
        error: `Insufficient amount. Expected ${expectedTON.toFixed(2)} TON, got ${actualTON.toFixed(2)} TON`,
      };
    }

    // 7. Verify sender address matches
    if (!addressesMatch(transaction.sender, senderAddress)) {
      return {
        isValid: false,
        error: "Sender address does not match the provided wallet address",
      };
    }

    // 8. Verify recipient is the lottery wallet
    if (!addressesMatch(transaction.recipient, expectedRecipient)) {
      return {
        isValid: false,
        error: "Recipient is not the lottery wallet",
      };
    }

    // 9. Verify transaction is recent (within 1 hour)
    const oneHourAgo = Math.floor(Date.now() / 1000) - ONE_HOUR_IN_SECONDS;
    if (transaction.timestamp < oneHourAgo) {
      return {
        isValid: false,
        error: "Transaction is too old (must be within 1 hour)",
      };
    }

    console.log("[TON Verify] Transaction verified successfully", {
      amount: `${Number(transaction.amount) / 1e9} TON`,
      from: sanitizeForLog(transaction.sender, 48),
      to: sanitizeForLog(transaction.recipient, 48),
    });

    // Return successful verification with actual blockchain data
    return {
      isValid: true,
      transaction: {
        hash: txHash,
        amount: transaction.amount,
        sender: transaction.sender,
        recipient: transaction.recipient,
        timestamp: transaction.timestamp,
        lt: transaction.lt,
        confirmed: transaction.confirmed,
      },
    };
  } catch (error) {
    console.error("[TON Verify] Verification error:", error);
    return {
      isValid: false,
      error:
        error instanceof Error
          ? error.message
          : "Transaction verification failed",
    };
  }
}

/**
 * Helper function to convert TON to nanotons
 * Uses string-based conversion to avoid floating-point precision errors
 * @param ton Amount in TON
 * @returns Amount in nanotons
 */
export function tonToNano(ton: number): bigint {
  // Convert to string to avoid floating-point precision issues
  const tonStr = ton.toFixed(9); // TON has 9 decimal places
  const [whole, decimal = ""] = tonStr.split(".");

  // Pad decimal part to 9 digits
  const paddedDecimal = decimal.padEnd(9, "0");

  // Combine whole and decimal parts
  const nanoStr = whole + paddedDecimal;

  return BigInt(nanoStr);
}

/**
 * Helper function to convert nanotons to TON
 * @param nano Amount in nanotons
 * @returns Amount in TON
 */
export function nanoToTon(nano: bigint): number {
  return Number(nano) / 1e9;
}

/**
 * Verify transaction with amount tolerance
 * Allows small variations due to fees
 */
export async function verifyTonTransactionWithTolerance(
  txHash: string,
  expectedRecipient: string,
  expectedAmount: bigint,
  senderAddress: string,
  tolerancePercent: number = 1, // 1% tolerance by default
): Promise<TransactionVerification> {
  const result = await verifyTonTransaction(
    txHash,
    expectedRecipient,
    expectedAmount,
    senderAddress,
  );

  if (result.isValid && result.transaction) {
    const minAmount =
      expectedAmount -
      (expectedAmount * BigInt(tolerancePercent)) / BigInt(100);

    if (result.transaction.amount < minAmount) {
      return {
        isValid: false,
        error: `Transaction amount too low. Expected at least ${nanoToTon(minAmount)} TON, got ${nanoToTon(result.transaction.amount)} TON`,
      };
    }
  }

  return result;
}
