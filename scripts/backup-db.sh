#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

set -a
source "${1:-backup.env}"
set +a

ping_healthcheck() {
  if [[ -n "${HEALTHCHECK_URL:-}" ]]; then
    curl -fsS -m 10 --retry 3 -o /dev/null "$HEALTHCHECK_URL$1" || true
  fi
}
trap 'ping_healthcheck /fail' ERR

restic backup --tag db --stdin-filename smart-calendar.sql --stdin-from-command -- \
  docker compose -f docker-compose.prod.yaml exec -T smart-calendar-db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"'

restic forget --tag db --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --prune

ping_healthcheck ""
