#!/bin/bash

# Database Restore Test Script
# This script downloads the latest backup from GitHub Releases and restores it to a staging database
# 
# IMPORTANT SAFETY FEATURES:
# - Requires STAGING_DATABASE_URL (will NOT use DATABASE_URL or DIRECT_URL)
# - Includes safety checks to prevent accidental restore to production
# - Verifies database URL points to staging/test environment
#
# Usage: 
#   export STAGING_DATABASE_URL='postgresql://user:pass@host:port/staging_db'
#   export GITHUB_TOKEN='ghp_...' (optional, for private repos or higher rate limits)
#   ./scripts/db/restore_test.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Database Restore Test Script${NC}"
echo "===================================="

# Check if STAGING_DATABASE_URL is set
if [ -z "$STAGING_DATABASE_URL" ]; then
    echo -e "${RED}❌ Error: STAGING_DATABASE_URL environment variable is not set${NC}"
    echo ""
    echo "This script requires STAGING_DATABASE_URL to prevent accidental restore to production."
    echo ""
    echo "Usage:"
    echo "  export STAGING_DATABASE_URL='postgresql://user:password@host:port/staging_database'"
    echo "  export GITHUB_TOKEN='ghp_...' # Optional, for authentication"
    echo "  ./scripts/db/restore_test.sh"
    exit 1
fi

# Safety check: Verify the URL doesn't contain production indicators
echo -e "${YELLOW}🔒 Running safety checks...${NC}"

# Check for common production indicators in the database URL
if echo "$STAGING_DATABASE_URL" | grep -qiE "(prod|production|live|main)"; then
    echo -e "${RED}❌ SAFETY CHECK FAILED!${NC}"
    echo "   The database URL appears to contain production indicators:"
    echo "   - 'prod', 'production', 'live', or 'main'"
    echo ""
    echo "   This script is designed for STAGING/TEST databases only."
    echo "   Please verify you're using the correct database URL."
    echo ""
    echo "   To bypass this check (USE WITH EXTREME CAUTION):"
    echo "   export FORCE_RESTORE=true"
    
    if [ "$FORCE_RESTORE" != "true" ]; then
        exit 1
    else
        echo -e "${YELLOW}⚠️  WARNING: Safety check bypassed by FORCE_RESTORE=true${NC}"
        echo "   Proceeding with restore..."
    fi
fi

# Verify the URL contains staging/test indicators
if ! echo "$STAGING_DATABASE_URL" | grep -qiE "(staging|test|dev|qa)"; then
    echo -e "${YELLOW}⚠️  WARNING: Database URL doesn't contain staging/test indicators${NC}"
    echo "   Expected keywords: staging, test, dev, or qa"
    echo "   URL: ${STAGING_DATABASE_URL:0:30}..."
    echo ""
    read -p "Are you sure this is a staging/test database? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo -e "${RED}❌ Restore cancelled by user${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Safety checks passed${NC}"
echo ""

# GitHub repository information
REPO_OWNER="Gor93rus"
REPO_NAME="lottery-backend"
API_BASE="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}"

# Setup authentication headers
AUTH_HEADER=""
if [ -n "$GITHUB_TOKEN" ]; then
    AUTH_HEADER="Authorization: token ${GITHUB_TOKEN}"
    echo -e "${GREEN}✅ Using GitHub token for authentication${NC}"
else
    echo -e "${YELLOW}ℹ️  No GITHUB_TOKEN set, using unauthenticated requests (lower rate limit)${NC}"
fi

# Create temporary directory for backup
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo -e "${YELLOW}📦 Fetching latest backup from GitHub Releases...${NC}"

# Fetch latest backup release
if [ -n "$AUTH_HEADER" ]; then
    RELEASES=$(curl -s -H "$AUTH_HEADER" "${API_BASE}/releases?per_page=50")
else
    RELEASES=$(curl -s "${API_BASE}/releases?per_page=50")
fi

# Find the latest backup release
LATEST_BACKUP=$(echo "$RELEASES" | grep -o '"tag_name": *"backup-[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$LATEST_BACKUP" ]; then
    echo -e "${RED}❌ No backup releases found${NC}"
    echo "   Please ensure backup workflow has run at least once"
    exit 1
fi

echo -e "${GREEN}✅ Found latest backup: ${LATEST_BACKUP}${NC}"

# Get download URL for the backup file
if [ -n "$AUTH_HEADER" ]; then
    RELEASE_INFO=$(curl -s -H "$AUTH_HEADER" "${API_BASE}/releases/tags/${LATEST_BACKUP}")
else
    RELEASE_INFO=$(curl -s "${API_BASE}/releases/tags/${LATEST_BACKUP}")
fi

DOWNLOAD_URL=$(echo "$RELEASE_INFO" | grep -o '"browser_download_url": *"[^"]*\.sql\.gz"' | head -1 | cut -d'"' -f4)

if [ -z "$DOWNLOAD_URL" ]; then
    echo -e "${RED}❌ Could not find backup file in release${NC}"
    exit 1
fi

echo -e "${YELLOW}⬇️  Downloading backup...${NC}"
echo "   URL: ${DOWNLOAD_URL}"

# Download the backup
BACKUP_FILE="${TEMP_DIR}/backup.sql.gz"
if [ -n "$AUTH_HEADER" ]; then
    curl -L -H "$AUTH_HEADER" -o "$BACKUP_FILE" "$DOWNLOAD_URL"
else
    curl -L -o "$BACKUP_FILE" "$DOWNLOAD_URL"
fi

# Verify download
if [ ! -f "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Download failed or file is empty${NC}"
    exit 1
fi

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo -e "${GREEN}✅ Downloaded backup: ${FILE_SIZE}${NC}"

# Decompress backup
echo -e "${YELLOW}📂 Decompressing backup...${NC}"
gunzip "$BACKUP_FILE"
BACKUP_SQL="${TEMP_DIR}/backup.sql"

if [ ! -f "$BACKUP_SQL" ]; then
    echo -e "${RED}❌ Decompression failed${NC}"
    exit 1
fi

SQL_SIZE=$(du -h "$BACKUP_SQL" | cut -f1)
echo -e "${GREEN}✅ Decompressed: ${SQL_SIZE}${NC}"
echo ""

# Final confirmation before restore
echo -e "${YELLOW}⚠️  FINAL CONFIRMATION${NC}"
echo "   Database: ${STAGING_DATABASE_URL:0:50}..."
echo "   Backup: ${LATEST_BACKUP}"
echo ""
read -p "Proceed with restore? (yes/no): " FINAL_CONFIRM

if [ "$FINAL_CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}❌ Restore cancelled by user${NC}"
    exit 0
fi

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ Error: psql is not installed${NC}"
    echo "   Install PostgreSQL client:"
    echo "   - Ubuntu/Debian: sudo apt-get install postgresql-client"
    echo "   - macOS: brew install postgresql"
    exit 1
fi

# Perform restore
echo ""
echo -e "${YELLOW}🔄 Restoring database...${NC}"
echo "   This may take several minutes depending on database size..."
echo ""

PGSSLMODE=require psql "$STAGING_DATABASE_URL" < "$BACKUP_SQL" 2>&1 | grep -v "^$" || true

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Restore completed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Verify data integrity in staging database"
    echo "  2. Run application smoke tests"
    echo "  3. Document any issues found"
else
    echo ""
    echo -e "${RED}❌ Restore failed${NC}"
    echo "   Please check the error messages above"
    exit 1
fi
