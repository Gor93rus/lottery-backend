import { Address } from "@ton/ton";
import {
  getJettonWalletAddress,
  getJettonBalanceFromWallet,
} from "./jettonUtils.js";
import { getTonClient } from "../payout/tonPayoutService.js";

/**
 * Configuration constants
 */
const TRANSACTION_SEARCH_LIMIT = 50; // Number of transactions to fetch when searching
const MAX_RETRY_ATTEMPTS = 3; // Maximum number of retry attempts for network requests
const RETRY_BACKOFF_BASE_MS = 1000; // Base delay for exponential backoff in milliseconds

/**
 * TON Transaction structure from TON Center API
 */
interface TonTransaction {
  hash: string;
  lt: string; // logical time
  account: string;
  now: number; // timestamp
  origStatus: string;
  endStatus: string;
  totalFees: string;
  inMsg?: {
    source: string;
    destination: string;
    value: string;
    message?: string;
  };
  outMsgs: Array<{
    source: string;
    destination: string;
    value: string;
  }>;
}

/**
 * Verification result structure
 */
export interface VerificationResult {
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
 * TON Center API endpoint based on network
 */
const TON_CENTER_API =
  process.env.TON_NETWORK === "mainnet"
    ? "https://toncenter.com/api/v2"
    : "https://testnet.toncenter.com/api/v2";

/**
 * Calculate exponential backoff delay
 * @param attemptNumber Current attempt number (0-indexed)
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(attemptNumber: number): number {
  return RETRY_BACKOFF_BASE_MS * Math.pow(2, attemptNumber);
}

/**
 * Fetch with retry logic for network resilience
 * @param url URL to fetch
 * @param options Fetch options
 * @param maxRetries Maximum number of retries
 * @returns Response
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = MAX_RETRY_ATTEMPTS,
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }

      // If rate limited (429) or server error (5xx), retry
      if (response.status === 429 || response.status >= 500) {
        if (i === maxRetries - 1) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, calculateBackoffDelay(i)),
        );
        continue;
      }

      // For other errors (4xx), don't retry
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      // Wait before retry with exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, calculateBackoffDelay(i)),
      );
    }
  }
  throw new Error("Max retries exceeded");
}

/**
 * Compare two TON addresses for equality
 * Handles different address formats (bounceable/non-bounceable)
 * @param addr1 First address
 * @param addr2 Second address
 * @returns true if addresses match
 */
export function addressesMatch(addr1: string, addr2: string): boolean {
  try {
    const parsed1 = Address.parse(addr1);
    const parsed2 = Address.parse(addr2);
    return parsed1.equals(parsed2);
  } catch {
    return false;
  }
}

/**
 * Get transaction by hash from TON Center API
 * @param address Account address to search
 * @param hash Transaction hash
 * @param lt Logical time (optional, for more precise search)
 * @returns Transaction data or null if not found
 */
async function getTransactionByHash(
  address: string,
  hash: string,
  _lt?: string,
): Promise<TonTransaction | null> {
  try {
    const url = `${TON_CENTER_API}/getTransactions?address=${address}&limit=${TRANSACTION_SEARCH_LIMIT}&archival=true`;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Add API key if available
    if (process.env.TON_CENTER_API_KEY) {
      headers["X-API-Key"] = process.env.TON_CENTER_API_KEY;
    }

    const response = await fetchWithRetry(url, { headers });
    const data = await response.json();

    if (!data.ok || !data.result) {
      console.error("[TON API] API returned error:", data.error);
      return null;
    }

    // Find transaction by hash
    const transaction = data.result.find((tx: Record<string, unknown>) => {
      const txData = tx.transaction_id as Record<string, unknown> | undefined;
      const txHash = txData?.hash;
      return txHash && txHash === hash;
    });

    if (!transaction) {
      return null;
    }

    // Transform API response to our format
    return {
      hash: transaction.transaction_id?.hash || hash,
      lt: transaction.transaction_id?.lt || "0",
      account: transaction.address || address,
      now: transaction.utime || 0,
      origStatus: transaction.orig_status || "",
      endStatus: transaction.end_status || "",
      totalFees: transaction.total_fees || "0",
      inMsg: transaction.in_msg
        ? {
            source: transaction.in_msg.source || "",
            destination: transaction.in_msg.destination || "",
            value: transaction.in_msg.value || "0",
            message: transaction.in_msg.message || "",
          }
        : undefined,
      outMsgs: transaction.out_msgs || [],
    };
  } catch (error) {
    console.error("[TON API] Error fetching transaction:", error);
    return null;
  }
}

/**
 * Fetch and verify transaction from blockchain
 * Main service function for transaction verification
 * @param txHash Transaction hash
 * @param expectedRecipient Expected recipient address
 * @param senderAddress Sender address (optional, for searching)
 * @returns Verification result with transaction details
 */
export async function fetchTransactionFromBlockchain(
  txHash: string,
  expectedRecipient: string,
  senderAddress?: string,
): Promise<VerificationResult> {
  try {
    // Try to find transaction by searching recipient's transactions
    let transaction = await getTransactionByHash(expectedRecipient, txHash);

    // If not found and sender is provided, try searching sender's transactions
    if (!transaction && senderAddress) {
      transaction = await getTransactionByHash(senderAddress, txHash);
    }

    if (!transaction) {
      return {
        isValid: false,
        error:
          "Transaction not found on blockchain. It may still be pending or the hash is invalid.",
      };
    }

    // Transaction is confirmed if it has been included in a block
    // TON Center API only returns confirmed transactions
    const confirmed = transaction.now > 0;

    if (!confirmed) {
      return {
        isValid: false,
        error: "Transaction is not yet confirmed",
      };
    }

    // Extract transaction details
    const inMsg = transaction.inMsg;
    if (!inMsg) {
      return {
        isValid: false,
        error: "Transaction has no incoming message (internal error)",
      };
    }

    // Parse amount (value is in nanotons as string)
    const amount = BigInt(inMsg.value || "0");
    const sender = inMsg.source || "";
    const recipient = inMsg.destination || "";
    const timestamp = transaction.now;
    const lt = BigInt(transaction.lt || "0");

    return {
      isValid: true,
      transaction: {
        hash: txHash,
        amount,
        sender,
        recipient,
        timestamp,
        lt,
        confirmed,
      },
    };
  } catch (error) {
    console.error("[TON API] Blockchain fetch error:", error);
    return {
      isValid: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch transaction from blockchain",
    };
  }
}

/**
 * Get Jetton balance for an owner address
 * @param jettonMasterAddress Jetton Master contract address
 * @param ownerAddress Owner's TON address
 * @returns Balance in Jetton units or null if failed
 */
export async function getJettonBalance(
  jettonMasterAddress: string,
  ownerAddress: string,
): Promise<bigint | null> {
  try {
    const client = await getTonClient();
    if (!client) {
      console.error("[TON API] Client not initialized");
      return null;
    }

    // Get Jetton wallet address for the owner
    const jettonWalletAddress = await getJettonWalletAddress(
      jettonMasterAddress,
      ownerAddress,
    );

    if (!jettonWalletAddress) {
      console.error("[TON API] Failed to get Jetton wallet address");
      return null;
    }

    // Get balance from Jetton wallet
    const balance = await getJettonBalanceFromWallet(
      client,
      jettonWalletAddress,
    );

    return balance;
  } catch (error) {
    console.error("[TON API] Error getting Jetton balance:", error);
    return null;
  }
}
