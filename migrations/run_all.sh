#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# CSI Digital Operating Platform — Migration Runner
# Runs all migrations and seed data in the correct dependency order.
# Usage: ./run_all.sh <database_name>
# ════════════════════════════════════════════════════════════════════════════
set -e  # exit immediately on any error
DB="${1:-csidop}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running migrations against database: $DB"
echo ""

# seed/000 must run before the numbered migrations because migration 013
# grants privileges on audit_log partitions to the csidop_app role — that
# role must already exist when the GRANT executes.
echo ">> seed/000_app_role.sql"
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/seed/000_app_role.sql"
echo ""

for f in "$DIR"/0*.sql; do
  echo ">> $(basename "$f")"
  psql -d "$DB" -v ON_ERROR_STOP=1 -f "$f"
  echo ""
done

echo ">> seed/001_seed_master_data.sql"
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/seed/001_seed_master_data.sql"
echo ""

echo "All migrations and seed data applied successfully."
