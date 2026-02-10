import { TonClient4 } from "@ton/ton";

const MAINNET_ENDPOINT = "https://mainnet-v4.tonhubapi.com";

let client: TonClient4 | null = null;

export function getTonClient(): TonClient4 {
  if (!client) {
    client = new TonClient4({ endpoint: MAINNET_ENDPOINT });
  }
  return client;
}

export const TON_CONFIG = {
  network: "mainnet",
  projectWallet: "UQDzYn0ha3TdHUrLDod66JDVv57b7qtFZBE-vALzsq_tFIRV",
  minDeposit: { TON: 1, USDT: 1 },
  minWithdrawal: { TON: 1, USDT: 1 },
  withdrawalFee: 0.2, // TON
  baseWithdrawalLimit: 1000, // TON per day
  // USDT Jetton on TON mainnet
  usdtJettonMaster: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
};
