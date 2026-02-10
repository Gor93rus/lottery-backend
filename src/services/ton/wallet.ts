import { mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4, internal, toNano, fromNano } from "@ton/ton";
import { getTonClient } from "./client.js";

let walletContract: WalletContractV4 | null = null;
let keyPair: { publicKey: Buffer; secretKey: Buffer } | null = null;

export async function initWallet() {
  const mnemonic = process.env.TON_WALLET_MNEMONIC;
  if (!mnemonic) {
    console.error("❌ TON_WALLET_MNEMONIC not set!");
    return null;
  }

  const mnemonicArray = mnemonic.split(" ");
  keyPair = await mnemonicToPrivateKey(mnemonicArray);

  walletContract = WalletContractV4.create({
    publicKey: keyPair.publicKey,
    workchain: 0,
  });

  console.log("✅ TON Wallet initialized:", walletContract.address.toString());
  return walletContract;
}

export async function getWalletBalance(): Promise<{
  ton: number;
  usdt: number;
}> {
  if (!walletContract) {
    console.error("Wallet not initialized");
    return { ton: 0, usdt: 0 };
  }

  const client = getTonClient();

  try {
    const balance = await client.getAccountLite(
      (await client.getLastBlock()).last.seqno,
      walletContract.address,
    );

    return {
      ton: parseFloat(fromNano(balance.account.balance.coins)),
      usdt: 0, // TODO: Implement Jetton balance check
    };
  } catch (error) {
    console.error("Error getting wallet balance:", error);
    return { ton: 0, usdt: 0 };
  }
}

export async function sendTON(
  toAddress: string,
  amount: number,
  memo?: string,
): Promise<string | null> {
  if (!walletContract || !keyPair) {
    throw new Error("Wallet not initialized");
  }

  const client = getTonClient();

  try {
    const seqno = await walletContract.getSeqno(
      client.provider(walletContract.address),
    );

    const transfer = walletContract.createTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: toAddress,
          value: toNano(amount.toString()),
          body: memo || "",
          bounce: false,
        }),
      ],
    });

    // Convert the transfer to a buffer properly
    const externalMessage = transfer.toBoc();
    await client.sendMessage(externalMessage);

    console.log(`💸 Sent ${amount} TON to ${toAddress}`);

    // Note: In production, you should track the actual transaction hash
    // by monitoring the blockchain or using a transaction tracking service
    // For now, returning a pseudo hash for MVP functionality
    // TODO: Implement proper transaction hash tracking
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  } catch (error) {
    console.error("Error sending TON:", error);
    throw error;
  }
}

export { walletContract, keyPair };
