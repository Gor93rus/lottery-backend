import { Address, beginCell, Cell, TonClient } from "@ton/ton";
import { getTonClient } from "../payout/tonPayoutService.js";

/**
 * USDT Jetton constants
 */
export const USDT_JETTON_MASTER =
  "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
export const USDT_DECIMALS = 6;

/**
 * Jetton transfer operation code (TEP-74)
 */
const JETTON_TRANSFER_OP = 0x0f8a7ea5;

/**
 * Cache for Jetton wallet addresses to avoid repeated blockchain queries
 */
const jettonWalletCache = new Map<string, string>();

/**
 * Get Jetton wallet address for a given owner address
 * @param jettonMasterAddress Jetton Master contract address
 * @param ownerAddress Owner's TON address
 * @returns Jetton wallet address or null if not found
 */
export async function getJettonWalletAddress(
  jettonMasterAddress: string,
  ownerAddress: string,
): Promise<string | null> {
  try {
    const cacheKey = `${jettonMasterAddress}:${ownerAddress}`;

    // Check cache first
    if (jettonWalletCache.has(cacheKey)) {
      return jettonWalletCache.get(cacheKey)!;
    }

    const client = await getTonClient();
    if (!client) {
      throw new Error("TON client not initialized");
    }

    // Parse addresses
    const masterAddress = Address.parse(jettonMasterAddress);
    const owner = Address.parse(ownerAddress);

    // Call get_wallet_address method on Jetton Master contract
    const response = await client.runMethod(
      masterAddress,
      "get_wallet_address",
      [
        {
          type: "slice",
          cell: beginCell().storeAddress(owner).endCell(),
        },
      ],
    );

    // Parse the response to get the wallet address
    const jettonWalletAddress = response.stack.readAddress();
    const walletAddressString = jettonWalletAddress.toString();

    // Cache the result
    jettonWalletCache.set(cacheKey, walletAddressString);

    console.log(
      `📍 Jetton wallet address for ${ownerAddress.slice(0, 8)}...: ${walletAddressString.slice(0, 8)}...`,
    );

    return walletAddressString;
  } catch (error) {
    console.error("Failed to get Jetton wallet address:", error);
    return null;
  }
}

/**
 * Create Jetton transfer message body according to TEP-74 standard
 * @param queryId Unique query ID
 * @param amount Amount in Jetton units (for USDT: 1 USDT = 1,000,000 units)
 * @param destination Recipient TON address
 * @param responseDestination Address to send response to (usually sender)
 * @param forwardTonAmount Amount of TON to forward for notification
 * @param forwardPayload Optional payload to forward
 * @returns Cell containing the transfer message
 */
export function createJettonTransferBody(
  queryId: bigint,
  amount: bigint,
  destination: Address,
  responseDestination: Address,
  forwardTonAmount: bigint,
  forwardPayload?: Cell,
): Cell {
  // Build the transfer message according to TEP-74:
  // transfer#0f8a7ea5
  //   query_id:uint64
  //   amount:(VarUInteger 16)
  //   destination:MsgAddress
  //   response_destination:MsgAddress
  //   custom_payload:(Maybe ^Cell)
  //   forward_ton_amount:(VarUInteger 16)
  //   forward_payload:(Either Cell ^Cell)

  const builder = beginCell()
    .storeUint(JETTON_TRANSFER_OP, 32) // op code
    .storeUint(queryId, 64) // query_id
    .storeCoins(amount) // amount (VarUInteger 16)
    .storeAddress(destination) // destination
    .storeAddress(responseDestination) // response_destination
    .storeBit(0); // custom_payload (null - Maybe ^Cell)

  // Store forward_ton_amount
  builder.storeCoins(forwardTonAmount);

  // Store forward_payload (Either Cell ^Cell)
  if (forwardPayload) {
    // Store as reference
    builder.storeBit(1); // indicate reference
    builder.storeRef(forwardPayload);
  } else {
    // Store empty inline
    builder.storeBit(0); // indicate no payload
  }

  return builder.endCell();
}

/**
 * Get Jetton balance for an owner address
 * @param client TonClient instance
 * @param jettonWalletAddress Jetton wallet contract address
 * @returns Balance in Jetton units or null if failed
 */
export async function getJettonBalanceFromWallet(
  client: TonClient,
  jettonWalletAddress: string,
): Promise<bigint | null> {
  try {
    const address = Address.parse(jettonWalletAddress);

    // Call get_wallet_data method on Jetton wallet contract
    const response = await client.runMethod(address, "get_wallet_data", []);

    // Parse response: (int balance, slice owner, slice jetton, cell jetton_wallet_code)
    const balance = response.stack.readBigNumber();

    return balance;
  } catch (error) {
    console.error("Failed to get Jetton balance from wallet:", error);
    return null;
  }
}

/**
 * Convert USDT amount to Jetton units
 * @param amountUsdt Amount in USDT (e.g., 10.5)
 * @returns Amount in Jetton units (e.g., 10500000 for 10.5 USDT)
 */
export function usdtToJettonUnits(amountUsdt: number): bigint {
  return BigInt(Math.floor(amountUsdt * Math.pow(10, USDT_DECIMALS)));
}

/**
 * Convert Jetton units to USDT amount
 * @param jettonUnits Amount in Jetton units (e.g., 10500000)
 * @returns Amount in USDT (e.g., 10.5)
 */
export function jettonUnitsToUsdt(jettonUnits: bigint): number {
  return Number(jettonUnits) / Math.pow(10, USDT_DECIMALS);
}

/**
 * Clear Jetton wallet cache (useful for testing or forcing refresh)
 */
export function clearJettonWalletCache(): void {
  jettonWalletCache.clear();
}
