-- Phase 2 Performance Optimization: Add database indexes for improved query performance
-- This migration adds indexes to optimize common queries and reduce N+1 query patterns

-- Ticket table indexes for common query patterns
-- Optimize queries by userId and drawId combination (my-tickets endpoint)
CREATE INDEX IF NOT EXISTS "idx_ticket_user_draw" ON "Ticket"("userId", "drawId");

-- Optimize queries filtering by status and sorting by creation time
CREATE INDEX IF NOT EXISTS "idx_ticket_status_created" ON "Ticket"("status", "createdAt" DESC);

-- Draw table indexes for lottery and status filtering
-- Optimize queries by lotteryId and status (finding active draws)
CREATE INDEX IF NOT EXISTS "idx_draw_lottery_status" ON "Draw"("lotteryId", "status");

-- Transaction table index for hash lookups
-- Already exists in schema, but adding if not exists for safety
CREATE INDEX IF NOT EXISTS "idx_transaction_hash" ON "Transaction"("tonTxHash");

-- User table indexes for gamification features
-- Optimize leaderboard queries by level and experience
CREATE INDEX IF NOT EXISTS "idx_user_gamification" ON "User"("level" DESC, "experience" DESC);

-- Composite index for user activity tracking
CREATE INDEX IF NOT EXISTS "idx_user_active" ON "User"("isBlocked", "lastActiveAt" DESC);

-- Notification table index for user queries
-- Optimize unread notifications query
CREATE INDEX IF NOT EXISTS "idx_notification_user_read" ON "Notification"("userId", "read", "createdAt" DESC);

-- Payout table index for status and creation time
CREATE INDEX IF NOT EXISTS "idx_payout_status_created" ON "Payout"("status", "createdAt" DESC);
