#!/usr/bin/env bash
# Create an encrypted off-host PostgreSQL backup in the private Bunny Storage
# Zone shared with application assets. The repository lives under the reserved
# operations/ prefix. This script is designed to run from the root-owned
# systemd unit and does not initialise a repository.
set -euo pipefail

umask 077

readonly project_dir="${PROJECT_DIR:-/opt/shaheen-edu/deploy/production}"
readonly backup_env_file="${BACKUP_ENV_FILE:-/etc/shaheen-edu/backup.env}"
readonly compose_file="${COMPOSE_FILE:-${project_dir}/docker-compose.yml}"
readonly lock_file="${BACKUP_LOCK_FILE:-/run/lock/shaheen-edu-postgres-backup.lock}"
readonly backup_mode="${1:---scheduled}"

if [[ "${backup_mode}" != "--scheduled" && "${backup_mode}" != "--pre-migration" ]]; then
  echo '{"event":"backup_failed","reason":"invalid_mode"}' >&2
  exit 64
fi

if [[ ! -r "${backup_env_file}" ]]; then
  echo '{"event":"backup_failed","reason":"backup_environment_unavailable"}' >&2
  exit 78
fi

# shellcheck source=/dev/null
source "${backup_env_file}"

readonly storage_env_file="${BUNNY_STORAGE_ENV_FILE:-${project_dir}/.env}"
if [[ ! -r "${storage_env_file}" ]]; then
  echo '{"event":"backup_failed","reason":"storage_environment_unavailable"}' >&2
  exit 78
fi

# shellcheck source=/dev/null
source "${storage_env_file}"

for required_value in RESTIC_PASSWORD_FILE BUNNY_STORAGE_S3_ENDPOINT BUNNY_STORAGE_BUCKET BUNNY_STORAGE_ACCESS_KEY_ID BUNNY_STORAGE_SECRET_ACCESS_KEY; do
  if [[ -z "${!required_value:-}" ]]; then
    echo "{\"event\":\"backup_failed\",\"reason\":\"missing_${required_value}\"}" >&2
    exit 78
  fi
done

if [[ ! -r "${RESTIC_PASSWORD_FILE}" ]]; then
  echo '{"event":"backup_failed","reason":"restic_password_unavailable"}' >&2
  exit 78
fi

if ! command -v docker >/dev/null || ! command -v restic >/dev/null || ! command -v sha256sum >/dev/null; then
  echo '{"event":"backup_failed","reason":"required_command_unavailable"}' >&2
  exit 69
fi

readonly run_started_at="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
readonly run_id="$(date --utc +%Y%m%dT%H%M%SZ)-$(hostname -s)"
readonly operations_prefix="${OPERATIONS_PREFIX:-operations}"
readonly staging_dir="${BACKUP_STAGING_DIR:-/var/lib/shaheen-edu-backups/staging}"
readonly restic_cache_dir="${RESTIC_CACHE_DIR:-/var/cache/shaheen-edu-restic}"
readonly working_dir="${staging_dir}/${run_id}"
readonly dump_file="${working_dir}/database.dump"
readonly manifest_file="${working_dir}/manifest.txt"

mkdir -p "$(dirname "${lock_file}")" "${working_dir}" "${restic_cache_dir}"

cleanup() {
  local result=$?
  rm -rf -- "${working_dir}"
  if (( result != 0 )); then
    printf '{"event":"backup_failed","mode":"%s","startedAt":"%s"}\n' \
      "${backup_mode#--}" "${run_started_at}" >&2
  fi
  exit "${result}"
}
trap cleanup EXIT

exec 9>"${lock_file}"
if ! flock -w 300 9; then
  echo '{"event":"backup_failed","reason":"backup_lock_timeout"}' >&2
  exit 75
fi

RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-s3:${BUNNY_STORAGE_S3_ENDPOINT%/}/${BUNNY_STORAGE_BUCKET}/${operations_prefix}/postgres-restic}"
AWS_ACCESS_KEY_ID="${BUNNY_STORAGE_ACCESS_KEY_ID}"
AWS_SECRET_ACCESS_KEY="${BUNNY_STORAGE_SECRET_ACCESS_KEY}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE RESTIC_CACHE_DIR="${restic_cache_dir}"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION

# Fail before creating a plaintext dump if the remote repository cannot be
# opened. Bunny credentials come from the root-readable production .env.
restic cat config >/dev/null

cd "${project_dir}"
readonly database_name="$(docker compose -f "${compose_file}" exec -T postgres sh -ceu 'printf %s "$POSTGRES_DB"')"
schema_migration="$(docker compose -f "${compose_file}" exec -T postgres sh -ceu '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  psql --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align \
    --command '\''SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1'\''
' 2>/dev/null || true)"
readonly schema_migration="${schema_migration:-unavailable}"
release_revision="${RELEASE_REVISION:-}"
if [[ -z "${release_revision}" ]] && git -C "${project_dir}/../.." rev-parse --verify HEAD >/dev/null 2>&1; then
  release_revision="$(git -C "${project_dir}/../.." rev-parse --verify HEAD)"
fi
readonly release_revision="${release_revision:-unavailable}"
docker compose -f "${compose_file}" exec -T postgres sh -ceu '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  exec pg_dump \
    --host=127.0.0.1 \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges
' >"${dump_file}"

readonly dump_checksum="$(sha256sum "${dump_file}" | awk '{print $1}')"
readonly dump_size="$(stat --format=%s "${dump_file}")"

cat >"${manifest_file}" <<EOF
backup_started_at=${run_started_at}
backup_mode=${backup_mode#--}
database=${database_name}
postgres_container=postgres
schema_migration=${schema_migration}
release_revision=${release_revision}
dump_format=pg_dump_custom
dump_sha256=${dump_checksum}
dump_bytes=${dump_size}
EOF

backup_output="$(restic backup --tag "service:postgres" --tag "mode:${backup_mode#--}" --tag "run:${run_id}" "${working_dir}" 2>&1)"
readonly snapshot_id="$(sed -nE 's/^snapshot ([0-9a-f]+) saved$/\1/p' <<<"${backup_output}" | tail -n 1)"

if [[ -z "${snapshot_id}" ]]; then
  echo '{"event":"backup_failed","reason":"snapshot_id_unavailable"}' >&2
  exit 70
fi

# This confirms the newly-created encrypted snapshot can be listed remotely.
restic snapshots "${snapshot_id}" >/dev/null

readonly run_completed_at="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
printf '{"event":"backup_completed","service":"postgres","mode":"%s","backupId":"%s","startedAt":"%s","completedAt":"%s","dumpBytes":%s,"dumpSha256":"%s"}\n' \
  "${backup_mode#--}" "${snapshot_id}" "${run_started_at}" "${run_completed_at}" "${dump_size}" "${dump_checksum}"
