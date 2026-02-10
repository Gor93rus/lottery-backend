/**
 * Sanitization utilities for security
 * Prevents log injection and other security vulnerabilities
 */

/**
 * Transaction hash validation constants
 * TON transaction hashes can vary in length but typically range from 32-128 characters
 */
export const TX_HASH_MIN_LENGTH = 32;
export const TX_HASH_MAX_LENGTH = 128;

/**
 * Sanitize a value for safe logging
 * Removes newlines, control characters, and truncates long values
 *
 * @param input - The value to sanitize
 * @param maxLength - Maximum length before truncation (default: 200)
 * @returns Sanitized string safe for logging
 */
export function sanitizeForLog(
  input: unknown,
  maxLength: number = 200,
): string {
  // Handle null/undefined
  if (input === null || input === undefined) {
    return "null";
  }

  // Convert to string
  const str = String(input);

  // Remove newlines, carriage returns, tabs (log injection vectors)
  // Only allow printable ASCII characters
  return str
    .replace(/[\n\r\t]/g, " ")
    .replace(/[^\x20-\x7E]/g, "") // Only printable ASCII
    .substring(0, maxLength);
}

/**
 * Validate that a string is a valid hexadecimal hash
 * Used for transaction hash validation
 *
 * @param hash - The hash to validate
 * @param minLength - Minimum length (default: TX_HASH_MIN_LENGTH)
 * @param maxLength - Maximum length (default: TX_HASH_MAX_LENGTH)
 * @returns true if valid hex hash, false otherwise
 */
export function isValidHexHash(
  hash: string,
  minLength: number = TX_HASH_MIN_LENGTH,
  maxLength: number = TX_HASH_MAX_LENGTH,
): boolean {
  if (!hash || typeof hash !== "string") {
    return false;
  }

  // Check length
  if (hash.length < minLength || hash.length > maxLength) {
    return false;
  }

  // Check that it's a valid hex string (only 0-9, a-f, A-F)
  return /^[0-9a-fA-F]+$/.test(hash);
}

/**
 * Sanitize an ID for safe logging
 * Ensures IDs only contain safe characters (alphanumeric, dashes, underscores)
 *
 * @param id - The ID to sanitize
 * @returns Sanitized ID string safe for logging
 */
export function sanitizeId(id: unknown): string {
  if (id === null || id === undefined) {
    return "null";
  }

  const str = String(id);
  // IDs should only contain alphanumeric, dashes, underscores
  return str.replace(/[^a-zA-Z0-9_-]/g, "").substring(0, 100);
}

/**
 * Validate TON wallet address format
 * TON addresses are base64-encoded and typically 48 characters
 *
 * @param address - The address to validate
 * @returns true if valid format, false otherwise
 */
export function isValidWalletAddressFormat(address: string): boolean {
  if (!address || typeof address !== "string") {
    return false;
  }

  // TON addresses are typically 48 characters in base64 format
  // They can start with 'EQ', 'UQ', or 'kQ' (bounceable/non-bounceable)
  // Basic format check - actual validation happens in Address.parse()
  if (address.length < 40 || address.length > 60) {
    return false;
  }

  // Check for base64 characters (alphanumeric, +, /, =, -, _)
  return /^[A-Za-z0-9+/=_-]+$/.test(address);
}
