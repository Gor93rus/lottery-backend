import { Router, Request, Response } from "express";
import { getUserFromRequest } from "../../lib/auth/helpers.js";
import { getDepositInfo } from "../../services/ton/deposit.js";
import {
  requestWithdrawal,
  getWithdrawalInfo,
} from "../../services/ton/withdraw.js";
import {
  getTransactionHistory,
  getTransactionStats,
} from "../../services/ton/transactions.js";
import { getWalletBalance } from "../../services/ton/wallet.js";
import { TON_CONFIG } from "../../services/ton/client.js";

const router = Router();

// GET /api/wallet/info - Get wallet info and balances
router.get("/info", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated" });
    }

    const withdrawalInfo = await getWithdrawalInfo(user.id);
    const stats = await getTransactionStats(user.id);

    res.json({
      success: true,
      wallet: {
        balance: user.balance,
        currency: "TON",
        ...withdrawalInfo,
        stats,
      },
    });
  } catch (error) {
    console.error("Get wallet info error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to get wallet info" });
  }
});

// GET /api/wallet/deposit - Get deposit address and instructions
router.get("/deposit", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated" });
    }

    const depositInfo = await getDepositInfo(user.id);

    res.json({
      success: true,
      deposit: depositInfo,
    });
  } catch (error) {
    console.error("Get deposit info error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to get deposit info" });
  }
});

// POST /api/wallet/withdraw - Request withdrawal
router.post("/withdraw", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated" });
    }

    const { amount, toAddress, currency = "TON" } = req.body;

    if (!amount || !toAddress) {
      return res.status(400).json({
        success: false,
        error: "Amount and toAddress are required",
      });
    }

    const result = await requestWithdrawal(
      user.id,
      parseFloat(amount),
      toAddress,
      currency,
    );

    if (result.success) {
      res.json({
        success: true,
        message: "Withdrawal processed successfully",
        txHash: result.txHash,
        explorerUrl: result.txHash
          ? `https://tonscan.org/tx/${result.txHash}`
          : null,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Withdrawal error:", error);
    res.status(500).json({ success: false, error: "Withdrawal failed" });
  }
});

// GET /api/wallet/transactions - Get transaction history
router.get("/transactions", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated" });
    }

    const type = (req.query.type as "DEPOSIT" | "WITHDRAWAL" | "all") || "all";
    const pageParam = req.query.page as string;
    const limitParam = req.query.limit as string;

    const page =
      pageParam && !isNaN(parseInt(pageParam)) ? parseInt(pageParam) : 1;
    const limit = Math.min(
      limitParam && !isNaN(parseInt(limitParam)) ? parseInt(limitParam) : 20,
      100,
    );

    const history = await getTransactionHistory(user.id, { type, page, limit });

    res.json({
      success: true,
      ...history,
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to get transactions" });
  }
});

// GET /api/wallet/project-balance - Get project wallet balance (admin)
router.get("/project-balance", async (req: Request, res: Response) => {
  try {
    const balance = await getWalletBalance();
    res.json({
      success: true,
      balance,
      address: TON_CONFIG.projectWallet,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to get balance" });
  }
});

export default router;
