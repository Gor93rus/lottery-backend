-- AlterTable
ALTER TABLE "Achievement" ADD COLUMN     "descriptionEn" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "nameEn" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "rewardTon" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DailyTask" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "rewardXp" INTEGER NOT NULL,
    "rewardTon" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDailyTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyTaskId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyTask_taskId_key" ON "DailyTask"("taskId");

-- CreateIndex
CREATE INDEX "DailyTask_taskId_idx" ON "DailyTask"("taskId");

-- CreateIndex
CREATE INDEX "DailyTask_active_idx" ON "DailyTask"("active");

-- CreateIndex
CREATE INDEX "UserDailyTask_userId_idx" ON "UserDailyTask"("userId");

-- CreateIndex
CREATE INDEX "UserDailyTask_dailyTaskId_idx" ON "UserDailyTask"("dailyTaskId");

-- CreateIndex
CREATE INDEX "UserDailyTask_resetAt_idx" ON "UserDailyTask"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserDailyTask_userId_dailyTaskId_resetAt_key" ON "UserDailyTask"("userId", "dailyTaskId", "resetAt");

-- AddForeignKey
ALTER TABLE "UserDailyTask" ADD CONSTRAINT "UserDailyTask_dailyTaskId_fkey" FOREIGN KEY ("dailyTaskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
