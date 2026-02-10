import { Address, internal, toNano } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import {
  getPayoutWallet,
  isValidTonAddress,
  getTonClient,
} from "./tonPayoutService.js";
import {
  getJettonWalletAddress,
  createJettonTransferBody,
  usdtToJettonUnits,
  getJettonBalanceFromWallet,
  jettonUnitsToUsdt,
  USDT_JETTON_MASTER,
} from "../ton/jettonUtils.js";

let walletKeyPair: { publicKey: Buffer; secretKey: Buffer } | null = null;

/**
 * Initialize wallet keypair if not already initialized
 */
async function getWalletKeyPair(): Promise<{
  publicKey: Buffer;
  secretKey: Buffer;
} | null> {
  if (walletKeyPair) {
    return walletKeyPair;
  }

  try {
    const mnemonic = process.env.TON_PAYOUT_MNEMONIC;
    if (!mnemonic) {
      return null;
    }

    walletKeyPair = await mnemonicToPrivateKey(mnemonic.split(" "));
    return walletKeyPair;
  } catch (error) {
    console.error("Failed to initialize wallet keypair:", error);
    return null;
  }
}

/**
 * Send USDT Jetton payout with retry logic
 * Implements TEP-74 Jetton transfer standard
 */
export async function sendUsdtPayout(
  recipientAddress: string,
  amountUsdt: number,
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
  if (amountUsdt <= 0) {
    return {
      success: false,
      error: "Amount must be greater than 0",
    };
  }

  // Check single transaction limit
  const maxSingleAmount = parseFloat(
    process.env.PAYOUT_MAX_SINGLE_AMOUNT_USDT || "250",
  );
  if (amountUsdt > maxSingleAmount) {
    return {
      success: false,
      error: `Amount exceeds maximum single payout limit of ${maxSingleAmount} USDT`,
    };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const wallet = await getPayoutWallet();
      const client = await getTonClient();
      const keyPair = await getWalletKeyPair();

      if (!wallet || !client || !keyPair) {
        throw new Error("Payout wallet not initialized");
      }

      console.log(
        `💸 Sending USDT payout (attempt ${attempt}/${maxAttempts}):`,
        {
          recipient: recipientAddress,
          amount: amountUsdt,
          comment: comment || "none",
        },
      );

      // Get our Jetton wallet address
      const ourAddress = wallet.address.toString();
      const ourJettonWallet = await getJettonWalletAddress(
        USDT_JETTON_MASTER,
        ourAddress,
      );

      if (!ourJettonWallet) {
        throw new Error("Failed to get Jetton wallet address");
      }

      // Convert USDT amount to Jetton units (USDT has 6 decimals)
      const amountInJettonUnits = usdtToJettonUnits(amountUsdt);

      // Parse recipient address
      const recipientAddr = Address.parse(recipientAddress);

      // Create Jetton transfer message body
      const forwardTonAmount = toNano("0.01"); // 0.01 TON for notification
      const queryId = BigInt(Date.now()); // Use timestamp as query ID

      const transferBody = createJettonTransferBody(
        queryId,
        amountInJettonUnits,
        recipientAddr,
        wallet.address, // response destination is our wallet
        forwardTonAmount,
      );

      // Open wallet contract
      const contract = client.open(wallet);

      // Get current seqno
      const seqno = await contract.getSeqno();

      // Send transfer to our Jetton wallet with the transfer body
      // Gas amount for Jetton transfer (0.05 TON is typical)
      const gasAmount = toNano("0.05");

      await contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
          internal({
            to: ourJettonWallet,
            value: gasAmount,
            body: transferBody,
            bounce: false,
          }),
        ],
      });

      // Wait for transaction confirmation
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Verify transaction was sent by checking seqno increment
      const newSeqno = await contract.getSeqno();

      if (newSeqno > seqno) {
        console.log("✅ USDT payout sent successfully");

        // NOTE: Transaction hash generation
        // Currently using a placeholder identifier. In production, the actual transaction
        // hash should be retrieved by querying the wallet's transaction history after
        // confirmation. This would require additional blockchain API calls to get the
        // latest transaction details.
        const txHash = `usdt_${Date.now()}_${recipientAddress.slice(0, 8)}`;

        return {
          success: true,
          txHash,
        };
      } else {
        throw new Error("Transaction seqno did not increment");
      }
    } catch (error: unknown) {
      console.error(
        `❌ USDT payout attempt ${attempt} failed:`,
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
              : "Failed to send USDT payout after max attempts",
        };
      }
    }
  }

  return {
    success: false,
    error: "Failed to send USDT payout after max attempts",
  };
}

/**
 * Get USDT balance of payout wallet
 */
export async function getUsdtBalance(): Promise<number | null> {
  try {
    const wallet = await getPayoutWallet();
    const client = await getTonClient();

    if (!wallet || !client) {
      return null;
    }

    const ourAddress = wallet.address.toString();
    const jettonWallet = await getJettonWalletAddress(
      USDT_JETTON_MASTER,
      ourAddress,
    );

    if (!jettonWallet) {
      return null;
    }

    // Query the Jetton wallet contract for balance
    const balanceInUnits = await getJettonBalanceFromWallet(
      client,
      jettonWallet,
    );

    if (balanceInUnits === null) {
      return null;
    }

    // Convert from Jetton units to USDT
    return jettonUnitsToUsdt(balanceInUnits);
  } catch (error) {
    console.error("Failed to get USDT balance:", error);
    return null;
  }
}
