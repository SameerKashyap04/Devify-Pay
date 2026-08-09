#!/usr/bin/env bash
set -euo pipefail

# Devify Pay - Database Restore Script
# Usage: ./scripts/db-restore.sh <path_to_backup_file.sql.gz>

if [ -z "${1:-}" ]; then
  echo "Error: Backup file path required."
  echo "Usage: ./scripts/db-restore.sh <path_to_backup_file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found at '${BACKUP_FILE}'"
  exit 1
fi

DB_URL="${DATABASE_URL:-postgresql://devify:devify@localhost:5432/devify_pay?schema=public}"

echo "==> Restoring Devify Pay Database from '${BACKUP_FILE}'..."
echo "WARNING: Existing database contents will be replaced!"

gunzip -c "${BACKUP_FILE}" | psql "${DB_URL}"

echo "==> Database restoration complete."
