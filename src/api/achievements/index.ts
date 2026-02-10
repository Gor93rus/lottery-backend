import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { getUserFromRequest } from "../../lib/auth/helpers.js";

const router = Router();

// Achievement definitions
const ACHIEVEMENTS = [
  {
    id: "first_ticket",
    name: "First Step",
    description: "Buy your first ticket",
    icon: "🎫",
    target: 1,
    type: "tickets",
  },
  {
    id: "ticket_10",
    name: "Regular Player",
    description: "Buy 10 tickets",
    icon: "🎟️",
    target: 10,
    type: "tickets",
  },
  {
    id: "ticket_100",
    name: "Dedicated Player",
    description: "Buy 100 tickets",
    icon: "🎰",
    target: 100,
    type: "tickets",
  },
  {
    id: "first_win",
    name: "Lucky Start",
    description: "Win for the first time",
    icon: "🍀",
    target: 1,
    type: "wins",
  },
  {
    id: "win_10",
    name: "Winner",
    description: "Win 10 times",
    icon: "🏅",
    target: 10,
    type: "wins",
  },
  {
    id: "win_50",
    name: "Champion",
    description: "Win 50 times",
    icon: "🏆",
    target: 50,
    type: "wins",
  },
  {
    id: "winnings_100",
    name: "Small Fortune",
    description: "Win 100 TON total",
    icon: "💰",
    target: 100,
    type: "winnings",
  },
  {
    id: "winnings_1000",
    name: "Big Winner",
    description: "Win 1000 TON total",
    icon: "💎",
    target: 1000,
    type: "winnings",
  },
  {
    id: "jackpot",
    name: "Jackpot!",
    description: "Hit the jackpot (5 matches)",
    icon: "🎯",
    target: 1,
    type: "jackpot",
  },
  {
    id: "streak_3",
    name: "Hot Streak",
    description: "Win 3 draws in a row",
    icon: "🔥",
    target: 3,
    type: "streak",
  },
  {
    id: "referral_1",
    name: "Friendly",
    description: "Refer 1 friend",
    icon: "👋",
    target: 1,
    type: "referrals",
  },
  {
    id: "referral_10",
    name: "Influencer",
    description: "Refer 10 friends",
    icon: "⭐",
    target: 10,
    type: "referrals",
  },
];

// GET /api/achievements
router.get("/", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated" });
    }

    // Get user stats
    const [ticketStats, referralCount] = await Promise.all([
      prisma.ticket.aggregate({
        where: { userId: user.id },
        _count: { id: true },
        _sum: { prizeAmount: true },
      }),
      prisma.user.count({ where: { referredBy: user.id } }),
    ]);

    const wonTickets = await prisma.ticket.count({
      where: { userId: user.id, status: "won" },
    });

    const jackpotWins = await prisma.ticket.count({
      where: { userId: user.id, status: "won", matchedNumbers: 5 },
    });

    // Get user achievements from DB
    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId: user.id },
    });
    const unlockedMap = new Map(
      userAchievements.map((a) => [a.achievementId, a]),
    );

    // Calculate progress for each achievement
    const achievements = ACHIEVEMENTS.map((ach) => {
      let progress = 0;

      switch (ach.type) {
        case "tickets":
          progress = ticketStats._count.id;
          break;
        case "wins":
          progress = wonTickets;
          break;
        case "winnings":
          progress = ticketStats._sum.prizeAmount || 0;
          break;
        case "jackpot":
          progress = jackpotWins;
          break;
        case "referrals":
          progress = referralCount;
          break;
        default:
          progress = 0;
      }

      const unlocked = unlockedMap.get(ach.id);

      return {
        id: ach.id,
        name: ach.name,
        description: ach.description,
        icon: ach.icon,
        unlocked: unlocked !== undefined,
        unlockedAt: unlocked?.unlockedAt || null,
        progress: Math.min(progress, ach.target),
        target: ach.target,
      };
    });

    const unlockedCount = achievements.filter((a) => a.unlocked).length;

    res.json({
      success: true,
      achievements,
      summary: {
        total: ACHIEVEMENTS.length,
        unlocked: unlockedCount,
        points: unlockedCount * 50, // 50 points per achievement
      },
    });
  } catch (error) {
    console.error("Get achievements error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to get achievements" });
  }
});

export default router;
