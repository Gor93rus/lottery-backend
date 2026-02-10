#!/bin/bash

# Manual Database Backup Script
# Usage: ./scripts/backup-database.sh [output_dir]

set -e

# Configuration
OUTPUT_DIR="${1:-.}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${OUTPUT_DIR}/backup_${TIMESTAMP}.sql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🗄️  Database Backup Script${NC}"
echo "================================"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ Error: DATABASE_URL environment variable is not set${NC}"
    echo ""
    echo "Usage:"
    echo "  export DATABASE_URL='postgresql://user:password@host:port/database'"
    echo "  ./scripts/backup-database.sh [output_directory]"
    exit 1
fi

# Check if pg_dump is installed
if ! command -v pg_dump &> /dev/null; then
    echo -e "${RED}❌ Error: pg_dump is not installed${NC}"
    echo "Install PostgreSQL client: sudo apt-get install postgresql-client"
    exit 1
fi

# Create output directory if it doesn't exist
mkdir -p "${OUTPUT_DIR}"

echo -e "${GREEN}📦 Creating backup...${NC}"
echo "   Output: ${BACKUP_FILE}"

# Create backup
pg_dump "${DATABASE_URL}" \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    > "${BACKUP_FILE}"

# Check if backup was successful
if [ ! -s "${BACKUP_FILE}" ]; then
    echo -e "${RED}❌ Backup failed - file is empty${NC}"
    rm -f "${BACKUP_FILE}"
    exit 1
fi

# Get original size
ORIGINAL_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "   Original size: ${ORIGINAL_SIZE}"

# Compress backup
echo -e "${GREEN}🗜️  Compressing...${NC}"
gzip -9 "${BACKUP_FILE}"

BACKUP_FILE_GZ="${BACKUP_FILE}.gz"
COMPRESSED_SIZE=$(du -h "${BACKUP_FILE_GZ}" | cut -f1)
echo "   Compressed size: ${COMPRESSED_SIZE}"

echo ""
echo -e "${GREEN}✅ Backup complete!${NC}"
echo "================================"
echo "   File: ${BACKUP_FILE_GZ}"
echo "   Size: ${COMPRESSED_SIZE}"
echo ""
echo "To restore:"
echo "   gunzip ${BACKUP_FILE_GZ}"
echo "   psql \$DATABASE_URL < ${BACKUP_FILE}"
