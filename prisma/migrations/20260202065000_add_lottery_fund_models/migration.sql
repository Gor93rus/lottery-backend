-- AlterTable
ALTER TABLE "Draw" ADD COLUMN     "jackpotPoolSnapshot" DOUBLE PRECISION,
ADD COLUMN     "jackpotRolledOver" DOUBLE PRECISION,
ADD COLUMN     "jackpotWon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payoutPoolSnapshot" DOUBLE PRECISION,
ADD COLUMN     "payoutStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "prizePoolSnapshot" DOUBLE PRECISION,
ADD COLUMN     "toReserve" DOUBLE PRECISION,
ADD COLUMN     "totalPaidOut" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "matchCount" INTEGER;

-- CreateTable
CREATE TABLE "LotteryFund" (
    "id" TEXT NOT NULL,
    "lotteryId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalCollected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prizePool" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "jackpotPool" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payoutPool" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platformPool" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservePool" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPaidOut" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalToReserve" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalToJackpot" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotteryFund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotteryPayoutConfig" (
    "id" TEXT NOT NULL,
    "lotteryId" TEXT NOT NULL,
    "platformShare" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    "prizeShare" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    "reserveShare" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "incomeShare" DOUBLE PRECISION NOT NULL DEFAULT 0.90,
    "jackpotShare" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "payoutShare" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "match5Share" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "match4Share" DOUBLE PRECISION NOT NULL DEFAULT 0.60,
    "match3Share" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "match2Share" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "match1Fixed" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotteryPayoutConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawSchedule" (
    "id" TEXT NOT NULL,
    "lotteryId" TEXT NOT NULL,
    "scheduleType" TEXT NOT NULL DEFAULT 'manual',
    "drawTime" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "nextDrawAt" TIMESTAMP(3),
    "lastDrawAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutQueue" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "payoutId" TEXT,
    "currency" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingAmount" DOUBLE PRECISION NOT NULL,
    "partNumber" INTEGER NOT NULL DEFAULT 1,
    "totalParts" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "txHash" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationQueue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundTransaction" (
    "id" TEXT NOT NULL,
    "lotteryId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "drawId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "fromPool" TEXT,
    "toPool" TEXT,
    "prizePoolAfter" DOUBLE PRECISION,
    "jackpotPoolAfter" DOUBLE PRECISION,
    "payoutPoolAfter" DOUBLE PRECISION,
    "reservePoolAfter" DOUBLE PRECISION,
    "platformPoolAfter" DOUBLE PRECISION,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LotteryFund_lotteryId_idx" ON "LotteryFund"("lotteryId");

-- CreateIndex
CREATE INDEX "LotteryFund_currency_idx" ON "LotteryFund"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "LotteryFund_lotteryId_currency_key" ON "LotteryFund"("lotteryId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "LotteryPayoutConfig_lotteryId_key" ON "LotteryPayoutConfig"("lotteryId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawSchedule_lotteryId_key" ON "DrawSchedule"("lotteryId");

-- CreateIndex
CREATE INDEX "PayoutQueue_status_idx" ON "PayoutQueue"("status");

-- CreateIndex
CREATE INDEX "PayoutQueue_scheduledFor_idx" ON "PayoutQueue"("scheduledFor");

-- CreateIndex
CREATE INDEX "PayoutQueue_drawId_idx" ON "PayoutQueue"("drawId");

-- CreateIndex
CREATE INDEX "PayoutQueue_userId_idx" ON "PayoutQueue"("userId");

-- CreateIndex
CREATE INDEX "NotificationQueue_status_idx" ON "NotificationQueue"("status");

-- CreateIndex
CREATE INDEX "NotificationQueue_scheduledFor_idx" ON "NotificationQueue"("scheduledFor");

-- CreateIndex
CREATE INDEX "NotificationQueue_userId_idx" ON "NotificationQueue"("userId");

-- CreateIndex
CREATE INDEX "NotificationQueue_telegramId_idx" ON "NotificationQueue"("telegramId");

-- CreateIndex
CREATE INDEX "FundTransaction_lotteryId_idx" ON "FundTransaction"("lotteryId");

-- CreateIndex
CREATE INDEX "FundTransaction_drawId_idx" ON "FundTransaction"("drawId");

-- CreateIndex
CREATE INDEX "FundTransaction_type_idx" ON "FundTransaction"("type");

-- CreateIndex
CREATE INDEX "FundTransaction_createdAt_idx" ON "FundTransaction"("createdAt");

-- AddForeignKey
ALTER TABLE "LotteryFund" ADD CONSTRAINT "LotteryFund_lotteryId_fkey" FOREIGN KEY ("lotteryId") REFERENCES "Lottery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryPayoutConfig" ADD CONSTRAINT "LotteryPayoutConfig_lotteryId_fkey" FOREIGN KEY ("lotteryId") REFERENCES "Lottery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawSchedule" ADD CONSTRAINT "DrawSchedule_lotteryId_fkey" FOREIGN KEY ("lotteryId") REFERENCES "Lottery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutQueue" ADD CONSTRAINT "PayoutQueue_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutQueue" ADD CONSTRAINT "PayoutQueue_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_lotteryId_fkey" FOREIGN KEY ("lotteryId") REFERENCES "Lottery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
