-- AlterTable
ALTER TABLE "Lottery" ADD COLUMN "ticketPriceNano" TEXT NOT NULL DEFAULT '1000000000';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "txHash" TEXT,
ADD COLUMN "walletAddress" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_txHash_key" ON "Ticket"("txHash");

-- CreateIndex
CREATE INDEX "Ticket_txHash_idx" ON "Ticket"("txHash");
