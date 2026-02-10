import { Router, Request, Response } from "express";
import { unifiedAuthMiddleware } from "../../lib/auth/unifiedAuth.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

/**
 * GET /api/user/notification-settings
 * Get user's notification preferences
 */
router.get("/", unifiedAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        notifyDrawReminder: true,
        notifyDrawResults: true,
        notifyReferrals: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    res.json({
      success: true,
      settings: {
        drawReminder: user.notifyDrawReminder,
        drawResults: user.notifyDrawResults,
        referrals: user.notifyReferrals,
      },
    });
  } catch (error) {
    console.error("Get notification settings error:", error);
    res.status(500).json({ success: false, error: "Failed to get settings" });
  }
});

/**
 * PUT /api/user/notification-settings
 * Update user's notification preferences
 */
router.put("/", unifiedAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { drawReminder, drawResults, referrals } = req.body;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (typeof drawReminder === "boolean")
      updateData.notifyDrawReminder = drawReminder;
    if (typeof drawResults === "boolean")
      updateData.notifyDrawResults = drawResults;
    if (typeof referrals === "boolean") updateData.notifyReferrals = referrals;

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: updateData,
      select: {
        notifyDrawReminder: true,
        notifyDrawResults: true,
        notifyReferrals: true,
      },
    });

    res.json({
      success: true,
      settings: {
        drawReminder: user.notifyDrawReminder,
        drawResults: user.notifyDrawResults,
        referrals: user.notifyReferrals,
      },
    });
  } catch (error) {
    console.error("Update notification settings error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to update settings" });
  }
});

export default router;
