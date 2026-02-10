import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { getUserFromRequest } from "../../lib/auth/helpers.js";
import crypto from "crypto";

const router = Router();

const REWARD_PER_REFERRAL = 5; // TON

// GET /api/referral/info
router.get("/info", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated" });
    }

    // Generate referral code if not exists
    let referralCode = user.referralCode;
    if (!referralCode) {
      referralCode = generateReferralCode();
      await prisma.user.update({
        where: { id: user.id },
        data: { referralCode },
      });
    }

    // Get referrals
    const referrals = await prisma.user.findMany({
      where: { referredBy: user.id },
      select: {
        id: true,
        username: true,
        createdAt: true,
        rewardClaimed: true,
        _count: { select: { tickets: true } },
      },
    });

    const activeReferrals = referrals.filter((r) => r._count.tickets > 0);

    // Calculate rewards
    const pendingRewards =
      activeReferrals.filter((r) => !r.rewardClaimed).length *
      REWARD_PER_REFERRAL;
    const claimedRewards = user.referralRewardsClaimed || 0;

    res.json({
      success: true,
      referral: {
        code: referralCode,
        link: `https://t.me/LotteryBot?start=ref_${referralCode}`,
        totalReferrals: referrals.length,
        activeReferrals: activeReferrals.length,
        pendingRewards,
        claimedRewards,
        rewardPerReferral: REWARD_PER_REFERRAL,
        currency: "TON",
      },
      referrals: referrals.slice(0, 10).map((r) => ({
        username: maskUsername(r.username),
        joinedAt: r.createdAt,
        ticketsBought: r._count.tickets,
        rewardEarned: r._count.tickets > 0 ? REWARD_PER_REFERRAL : 0,
        status: r._count.tickets > 0 ? "active" : "pending",
      })),
    });
  } catch (error) {
    console.error("Get referral info error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to get referral info" });
  }
});

// POST /api/referral/claim
router.post("/claim", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated" });
    }

    // Get active referrals that haven't been rewarded
    const activeReferrals = await prisma.user.findMany({
      where: {
        referredBy: user.id,
        tickets: { some: {} }, // Has at least one ticket
        rewardClaimed: false,
      },
    });

    if (activeReferrals.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No pending rewards to claim",
      });
    }

    const rewardAmount = activeReferrals.length * REWARD_PER_REFERRAL;

    // Mark referrals as rewarded
    await prisma.user.updateMany({
      where: { id: { in: activeReferrals.map((r) => r.id) } },
      data: { rewardClaimed: true },
    });

    // Update user's claimed rewards
    await prisma.user.update({
      where: { id: user.id },
      data: {
        referralRewardsClaimed: { increment: rewardAmount },
        balance: { increment: rewardAmount },
      },
    });

    // Create notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "REFERRAL_REWARD",
        title: "Referral Rewards Claimed!",
        message: `You claimed ${rewardAmount} TON from ${activeReferrals.length} referrals!`,
      },
    });

    console.log("Referral rewards claimed", {
      userId: user.id,
      amount: rewardAmount,
    });

    res.json({
      success: true,
      claimed: rewardAmount,
      currency: "TON",
      message: `Successfully claimed ${rewardAmount} TON in referral rewards!`,
    });
  } catch (error) {
    console.error("Claim referral error:", error);
    res.status(500).json({ success: false, error: "Failed to claim rewards" });
  }
});

// POST /api/referral/apply
router.post("/apply", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated" });
    }

    const { code } = req.body;

    if (!code) {
      return res
        .status(400)
        .json({ success: false, error: "Referral code is required" });
    }

    // Check if user already has a referrer
    if (user.referredBy) {
      return res
        .status(400)
        .json({ success: false, error: "You already applied a referral code" });
    }

    // Find referrer
    const referrer = await prisma.user.findFirst({
      where: { referralCode: code.toUpperCase() },
    });

    if (!referrer) {
      return res
        .status(404)
        .json({ success: false, error: "Invalid referral code" });
    }

    if (referrer.id === user.id) {
      return res
        .status(400)
        .json({ success: false, error: "You cannot refer yourself" });
    }

    // Apply referral
    await prisma.user.update({
      where: { id: user.id },
      data: { referredBy: referrer.id },
    });

    console.log("Referral applied", {
      userId: user.id,
      referrerId: referrer.id,
    });

    res.json({
      success: true,
      message: "Referral code applied successfully!",
    });
  } catch (error) {
    console.error("Apply referral error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to apply referral code" });
  }
});

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function maskUsername(username?: string | null): string {
  if (!username) return "user_***";
  if (username.length <= 4) return username[0] + "***";
  return username.substring(0, 3) + "***";
}

export default router;
