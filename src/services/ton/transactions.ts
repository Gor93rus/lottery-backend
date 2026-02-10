import { prisma } from "../../lib/prisma.js";

export async function getTransactionHistory(
  userId: string,
  options: {
    type?: "DEPOSIT" | "WITHDRAWAL" | "all";
    page?: number;
    limit?: number;
  } = {},
) {
  const { type = "all", page = 1, limit = 20 } = options;

  const where: Record<string, unknown> = { userId };
  if (type !== "all") {
    where.type = type;
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions: transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      fee: tx.fee || 0,
      currency: tx.currency,
      status: tx.status,
      txHash: tx.txHash,
      fromAddress: tx.fromAddress,
      toAddress: tx.toAddress,
      explorerUrl: tx.txHash ? `https://tonscan.org/tx/${tx.txHash}` : null,
      createdAt: tx.createdAt,
      completedAt: tx.completedAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getTransactionStats(userId: string) {
  const [deposits, withdrawals] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, type: "DEPOSIT", status: "COMPLETED" },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: "WITHDRAWAL", status: "COMPLETED" },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  return {
    totalDeposited: deposits._sum.amount || 0,
    depositCount: deposits._count.id,
    totalWithdrawn: withdrawals._sum.amount || 0,
    withdrawalCount: withdrawals._count.id,
  };
}
