#!/bin/bash
# ShelfHaven - Database & Storage Backup Script
# Usage: ./scripts/backup.sh [backup_dir]
# Requires: docker compose, running db container, read access to the storage directory

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
# Host directory bind-mounted into the app container (see docker-compose.yml)
STORAGE_DIR="${STORAGE_HOST_PATH:-$(dirname "$COMPOSE_FILE")/storage}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[backup]${NC} $1"; }
warn() { echo -e "${YELLOW}[backup]${NC} $1"; }
error() { echo -e "${RED}[backup]${NC} $1"; exit 1; }

# Create backup directory
mkdir -p "$BACKUP_DIR"
log "Backup directory: $BACKUP_DIR"
log "Timestamp: $TIMESTAMP"

# --- MySQL Backup ---
log "Backing up MySQL database..."
DB_BACKUP="$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

docker compose -f "$COMPOSE_FILE" exec -T db \
  mysqldump -u root -p"${MYSQL_ROOT_PASSWORD}" \
  --single-transaction --routines --triggers \
  shelfhaven 2>/dev/null | gzip > "$DB_BACKUP"

if [ -s "$DB_BACKUP" ]; then
  DB_SIZE=$(du -h "$DB_BACKUP" | cut -f1)
  log "MySQL backup OK: $DB_BACKUP ($DB_SIZE)"
else
  rm -f "$DB_BACKUP"
  error "MySQL backup failed (empty file)"
fi

# --- Storage Backup ---
log "Backing up file storage ($STORAGE_DIR)..."
STORAGE_BACKUP="$BACKUP_DIR/storage_${TIMESTAMP}.tar.gz"

if [ -d "$STORAGE_DIR" ]; then
  tar czf "$STORAGE_BACKUP" -C "$STORAGE_DIR" --exclude='*.tmp' . \
    || error "Storage backup failed"
  STORAGE_SIZE=$(du -h "$STORAGE_BACKUP" | cut -f1)
  log "Storage backup OK: $STORAGE_BACKUP ($STORAGE_SIZE)"
else
  warn "Storage directory not found: $STORAGE_DIR (nothing to back up)"
fi

# --- Cleanup old backups (keep last 7) ---
log "Cleaning old backups (keeping last 7)..."
ls -dt "$BACKUP_DIR"/db_*.sql.gz 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true
ls -dt "$BACKUP_DIR"/storage_*.tar.gz 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true

# --- Summary ---
echo ""
log "=== Backup Complete ==="
log "Database: $DB_BACKUP"
log "Storage:  $STORAGE_BACKUP"
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "Total backup size: $TOTAL_SIZE"
