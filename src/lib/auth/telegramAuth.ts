import crypto from "crypto";

interface TelegramAuthData {
  id: string | number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Interface for Telegram WebApp initData
 */
export interface TelegramWebAppData {
  user?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    language_code?: string;
  };
  auth_date?: string;
  hash?: string;
  [key: string]: unknown;
}

/**
 * Verify Telegram authentication data
 * @see https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramAuth(
  authData: TelegramAuthData,
  botToken: string,
): boolean {
  // 1. Extract hash from data
  const { hash, ...dataWithoutHash } = authData;

  // 2. Create data-check-string (alphabetically sorted key=value pairs)
  const dataCheckString = Object.keys(dataWithoutHash)
    .sort()
    .filter((key) => {
      const value = dataWithoutHash[key as keyof typeof dataWithoutHash];
      return value !== undefined && value !== null;
    })
    .map(
      (key) => `${key}=${dataWithoutHash[key as keyof typeof dataWithoutHash]}`,
    )
    .join("\n");

  // 3. Create secret key (SHA256 of bot token)
  const secretKey = crypto.createHash("sha256").update(botToken).digest();

  // 4. Calculate HMAC-SHA256
  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  // 5. Compare hashes (timing-safe comparison to prevent timing attacks)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(calculatedHash, "hex"),
      Buffer.from(hash, "hex"),
    );
  } catch {
    return false;
  }
}

/**
 * Check if auth data is not expired (default: 24 hours)
 * Also checks that auth_date is not in the future
 */
export function isAuthDataFresh(
  authDate: number,
  maxAgeSeconds: number = 86400,
): boolean {
  const currentTime = Math.floor(Date.now() / 1000);

  // Reject if auth_date is in the future (clock skew or malicious input)
  if (authDate > currentTime) {
    return false;
  }

  return currentTime - authDate <= maxAgeSeconds;
}

/**
 * Parse Telegram WebApp initData string into an object
 * @param initData - The initData string from Telegram WebApp
 * @returns Parsed data object with user information
 */
export function parseTelegramInitData(initData: string): TelegramWebAppData {
  const params = new URLSearchParams(initData);
  const data: TelegramWebAppData = {};

  for (const [key, value] of params.entries()) {
    if (key === "user") {
      try {
        data.user = JSON.parse(decodeURIComponent(value));
      } catch {
        data.user = undefined;
      }
    } else {
      data[key] = value;
    }
  }

  return data;
}

/**
 * Verify Telegram WebApp initData
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * @param initData - The initData string from Telegram WebApp
 * @param botToken - The Telegram bot token
 * @returns Parsed and verified data, or null if verification fails
 */
export function verifyTelegramWebAppData(
  initData: string,
  botToken: string,
): TelegramWebAppData | null {
  try {
    // Parse the initData string
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) {
      return null;
    }

    // Remove hash from params and create data-check-string
    params.delete("hash");

    // Sort parameters alphabetically and create data-check-string
    const sortedParams = Array.from(params.entries())
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    // Create secret key using HMAC-SHA256 with "WebAppData" constant
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    // Calculate HMAC-SHA256 of data-check-string
    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(sortedParams)
      .digest("hex");

    // Compare hashes (timing-safe comparison)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(calculatedHash, "hex"),
      Buffer.from(hash, "hex"),
    );

    if (!isValid) {
      return null;
    }

    // Parse and return the verified data
    return parseTelegramInitData(initData);
  } catch {
    return null;
  }
}
