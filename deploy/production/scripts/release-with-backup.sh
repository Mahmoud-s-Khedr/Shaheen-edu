#!/usr/bin/env bash
# Run migrations only after an encrypted host-PostgreSQL backup succeeds.
set -euo pipefail

readonly project_dir="${PROJECT_DIR:-/opt/shaheen-edu/deploy/production}"
readonly backup_script="${BACKUP_SCRIPT:-${project_dir}/scripts/postgres-backup.sh}"

if [[ ! -x "${backup_script}" ]]; then
  echo "Backup script is unavailable: ${backup_script}" >&2
  exit 78
fi

"${backup_script}" --pre-migration
cd "${project_dir}"
exec docker compose -f docker-compose.yml --profile migration run --rm migrate
