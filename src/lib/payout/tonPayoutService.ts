import { mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4, internal, toNano, TonClient } from "@ton/ton";
import { getHttpEndpoint } from "@orbs-network/ton-access";

let payoutWallet: WalletContractV4 | null = null;
let tonClient: TonClient | null = null;
let walletKeyPair: { publicKey: Buffer; secretKey: Buffer } | null = null;

/**
 * Initialize TON payout wallet from mnemonic
 */
export async function initPayoutWallet(): Promise<WalletContractV4 | null> {
  try {
    const mnemonic = process.env.TON_PAYOUT_MNEMONIC;
    if (!mnemonic) {
      console.warn(
        "⚠️  TON_PAYOUT_MNEMONIC not configured - payout service disabled",
      );
      return null;
    }

    // Initialize TON client
    const network =
      process.env.TON_NETWORK === "mainnet" ? "mainnet" : "testnet";
    const endpoint = await getHttpEndpoint({ network });
    tonClient = new TonClient({ endpoint });

    // Generate keypair from mnemonic
    const keyPair = await mnemonicToPrivateKey(mnemonic.split(" "));
    walletKeyPair = keyPair;

    // Create wallet contract
    payoutWallet = WalletContractV4.create({
      publicKey: keyPair.publicKey,
      workchain: 0,
    });

    console.log(
      "✅ TON payout wallet initialized:",
      payoutWallet.address.toString(),
    );
    return payoutWallet;
  } catch (error) {
    console.error("Failed to initialize TON payout wallet:", error);
    return null;
  }
}

/**
 * Get TON client instance
 */
export async function getTonClient(): Promise<TonClient | null> {
  if (!tonClient) {
    await initPayoutWallet();
  }
  return tonClient;
}

/**
 * Get payout wallet instance
 */
export async function getPayoutWallet(): Promise<WalletContractV4 | null> {
  if (!payoutWallet) {
    return await initPayoutWallet();
  }
  return payoutWallet;
}

/**
 * Validate TON address format
 */
export function isValidTonAddress(address: string): boolean {
  try {
    // Basic validation - TON addresses should be 48 characters (base64url)
    // and start with specific prefixes
    if (!address || address.length < 48) return false;

    // Check if it starts with valid prefixes
    const validPrefixes = ["EQ", "UQ", "0Q", "kQ"];
    const hasValidPrefix = validPrefixes.some((prefix) =>
      address.startsWith(prefix),
    );

    return hasValidPrefix;
  } catch (error) {
    return false;
  }
}

/**
 * Send TON payout with retry logic
 */
export async function sendTonPayout(
  recipientAddress: string,
  amountTon: number,
  comment?: string,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const maxAttempts = parseInt(process.env.PAYOUT_MAX_ATTEMPTS || "3", 10);
  const retryDelay = parseInt(process.env.PAYOUT_RETRY_DELAY_MS || "60000", 10);

  // Validate recipient address
  if (!isValidTonAddress(recipientAddress)) {
    return {
      success: false,
      error: "Invalid TON address format",
    };
  }

  // Validate amount
  if (amountTon <= 0) {
    return {
      success: false,
      error: "Amount must be greater than 0",
    };
  }

  // Check single transaction limit
  const maxSingleAmount = parseFloat(
    process.env.PAYOUT_MAX_SINGLE_AMOUNT_TON || "50",
  );
  if (amountTon > maxSingleAmount) {
    return {
      success: false,
      error: `Amount exceeds maximum single payout limit of ${maxSingleAmount} TON`,
    };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const wallet = await getPayoutWallet();
      const client = await getTonClient();

      if (!wallet || !client) {
        throw new Error("Payout wallet not initialized");
      }

      console.log(
        `💸 Sending TON payout (attempt ${attempt}/${maxAttempts}):`,
        {
          recipient: recipientAddress,
          amount: amountTon,
          comment: comment || "none",
        },
      );

      // Get wallet contract
      const contract = client.open(wallet);

      // Create transfer message
      const seqno = await contract.getSeqno();

      // IMPORTANT: This is a simplified implementation
      // In production, you MUST use the actual secretKey from walletKeyPair
      if (!walletKeyPair) {
        throw new Error("Wallet keypair not initialized");
      }

      await contract.sendTransfer({
        seqno,
        secretKey: walletKeyPair.secretKey, // Use actual secret key from mnemonic
        messages: [
          internal({
            to: recipientAddress,
            value: toNano(amountTon.toString()),
            body: comment || "",
            bounce: false,
          }),
        ],
      });

      // Wait for transaction confirmation
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Get new seqno to verify transaction was sent
      const newSeqno = await contract.getSeqno();

      if (newSeqno > seqno) {
        console.log("✅ TON payout sent successfully");

        // TODO: In production, retrieve the actual transaction hash from the blockchain
        // This can be done by querying the wallet's transaction history after confirmation
        // For now, using a simplified placeholder
        const txHash = `ton_${Date.now()}_${recipientAddress.slice(0, 8)}`;

        return {
          success: true,
          txHash,
        };
      } else {
        throw new Error("Transaction seqno did not increment");
      }
    } catch (error: unknown) {
      console.error(
        `❌ TON payout attempt ${attempt} failed:`,
        error instanceof Error ? error.message : "Unknown error",
      );

      if (attempt < maxAttempts) {
        console.log(`⏳ Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to send TON payout after max attempts",
        };
      }
    }
  }

  return {
    success: false,
    error: "Failed to send TON payout after max attempts",
  };
}

/**
 * Get payout wallet address
 */
export async function getPayoutWalletAddress(): Promise<string | null> {
  const wallet = await getPayoutWallet();
  return wallet ? wallet.address.toString() : null;
}

/**
 * Get wallet balance
 */
export async function getPayoutWalletBalance(): Promise<number | null> {
  try {
    const wallet = await getPayoutWallet();
    const client = await getTonClient();

    if (!wallet || !client) {
      return null;
    }

    const contract = client.open(wallet);
    const balance = await contract.getBalance();

    // Convert from nanotons to TON
    return Number(balance) / 1e9;
  } catch (error) {
    console.error("Failed to get wallet balance:", error);
    return null;
  }
}
