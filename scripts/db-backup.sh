#!/usr/bin/env bash
set -euo pipefail

# Devify Pay - Database Backup Script
# Usage: ./scripts/db-backup.sh [output_dir]

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/devify_pay_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

DB_URL="${DATABASE_URL:-postgresql://devify:devify@localhost:5432/devify_pay?schema=public}"

echo "==> Starting Devify Pay Database Backup..."
echo "--> Output: ${BACKUP_FILE}"

pg_dump "${DB_URL}" | gzip > "${BACKUP_FILE}"

SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "==> Backup complete! File size: ${SIZE}"

# Rotate backups older than 30 days
echo "--> Cleaning up backups older than 30 days..."
find "${BACKUP_DIR}" -type f -name "devify_pay_*.sql.gz" -mtime +30 -delete

echo "==> Done."
