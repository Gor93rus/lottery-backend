/**
 * Provably Fair Service
 * Handles server seed generation, client seed retrieval from TON blockchain,
 * and provably fair number generation for lottery draws
 */

import crypto from "crypto";

/**
 * Generate a random server seed (32 bytes hex)
 */
export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Calculate SHA-256 hash of server seed
 */
export function hashServerSeed(serverSeed: string): string {
  return crypto.createHash("sha256").update(serverSeed).digest("hex");
}

/**
 * Get client seed from TON blockchain
 * Uses the last block hash as client seed
 * @returns Client seed (block hash) and block number
 */
export async function getTonBlockHash(): Promise<{
  clientSeed: string;
  blockNumber: bigint;
}> {
  try {
    // TODO: Replace with actual TON blockchain integration
    // This mock implementation should be replaced with real TON API calls
    // to fetch the latest block hash for Provably Fair guarantee
    // See: https://github.com/ton-community/ton-core for TON integration
    const mockBlockHash = crypto.randomBytes(32).toString("hex");
    const mockBlockNumber = BigInt(Date.now());

    return {
      clientSeed: mockBlockHash,
      blockNumber: mockBlockNumber,
    };
  } catch (error) {
    console.error("Error fetching TON block hash", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("Failed to fetch TON block hash");
  }
}

/**
 * Generate winning numbers using provably fair algorithm
 * Combines server seed, client seed, and nonce to generate deterministic random numbers
 *
 * @param seed - Combined seed (serverSeed + clientSeed + nonce)
 * @param count - Number of winning numbers to generate
 * @param max - Maximum number value (1 to max inclusive)
 * @returns Array of unique winning numbers, sorted ascending
 */
export function generateNumbersFromSeed(
  seed: string,
  count: number,
  max: number,
): number[] {
  const numbers: number[] = [];
  let hash = crypto.createHash("sha256").update(seed).digest("hex");
  let index = 0;

  while (numbers.length < count) {
    // Get 8 characters (4 bytes) from hash
    const chunk = hash.substring(index * 8, (index + 1) * 8);
    const num = (parseInt(chunk, 16) % max) + 1;

    // Only add unique numbers
    if (!numbers.includes(num)) {
      numbers.push(num);
    }

    index++;

    // If we've used all of the current hash, generate a new one
    if (index * 8 >= hash.length) {
      hash = crypto.createHash("sha256").update(hash).digest("hex");
      index = 0;
    }
  }

  return numbers.sort((a, b) => a - b);
}

/**
 * Verify that winning numbers were generated correctly
 * Re-generates numbers using the same seeds and compares
 *
 * @param serverSeed - Original server seed
 * @param clientSeed - Original client seed
 * @param nonce - Original nonce
 * @param winningNumbers - Numbers to verify
 * @param count - Expected count of numbers
 * @param max - Maximum number value
 * @returns true if verification passes, false otherwise
 */
export function verifyWinningNumbers(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  winningNumbers: number[],
  count: number,
  max: number,
): boolean {
  try {
    const combinedSeed = serverSeed + clientSeed + nonce.toString();
    const regeneratedNumbers = generateNumbersFromSeed(
      combinedSeed,
      count,
      max,
    );

    // Check if arrays are equal
    if (regeneratedNumbers.length !== winningNumbers.length) {
      return false;
    }

    for (let i = 0; i < regeneratedNumbers.length; i++) {
      if (regeneratedNumbers[i] !== winningNumbers[i]) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("Error verifying winning numbers", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

/**
 * Generate winning numbers for a draw using Provably Fair algorithm
 * Combines server seed, client seed from TON blockchain, and nonce
 *
 * @param serverSeed - Server seed (must match serverSeedHash)
 * @param nonce - Draw nonce for uniqueness
 * @param count - Number of winning numbers to generate
 * @param max - Maximum number value
 * @returns Object with winning numbers, client seed, and block number
 */
export async function generateDrawNumbers(
  serverSeed: string,
  nonce: number,
  count: number,
  max: number,
): Promise<{
  winningNumbers: number[];
  clientSeed: string;
  clientSeedBlockNumber: bigint;
}> {
  // Get client seed from TON blockchain
  const { clientSeed, blockNumber } = await getTonBlockHash();

  // Combine seeds with nonce
  const combinedSeed = serverSeed + clientSeed + nonce.toString();

  // Generate winning numbers
  const winningNumbers = generateNumbersFromSeed(combinedSeed, count, max);

  return {
    winningNumbers,
    clientSeed,
    clientSeedBlockNumber: blockNumber,
  };
}
