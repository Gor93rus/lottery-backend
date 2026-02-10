-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "amount" DOUBLE PRECISION,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "currency" TEXT DEFAULT 'TON',
ADD COLUMN     "error" TEXT,
ADD COLUMN     "fee" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "fromAddress" TEXT,
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "toAddress" TEXT,
ADD COLUMN     "txHash" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "depositMemos" TEXT[];

-- CreateTable
CREATE TABLE "DepositMemo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositMemo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepositMemo_memo_key" ON "DepositMemo"("memo");

-- CreateIndex
CREATE INDEX "DepositMemo_userId_idx" ON "DepositMemo"("userId");

-- CreateIndex
CREATE INDEX "DepositMemo_memo_idx" ON "DepositMemo"("memo");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txHash_key" ON "Transaction"("txHash");

-- CreateIndex
CREATE INDEX "Transaction_txHash_idx" ON "Transaction"("txHash");

-- AddForeignKey
ALTER TABLE "DepositMemo" ADD CONSTRAINT "DepositMemo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
