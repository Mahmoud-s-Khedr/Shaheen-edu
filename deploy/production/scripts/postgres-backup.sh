#!/usr/bin/env bash
# Create an encrypted off-host logical backup of host-managed PostgreSQL.
# PostgreSQL itself remains host-managed; this script uses host pg_dump only.
set -euo pipefail

umask 077

readonly project_dir="${PROJECT_DIR:-/opt/shaheen-edu/deploy/production}"
readonly backup_env_file="${BACKUP_ENV_FILE:-/etc/shaheen-edu/backup.env}"
readonly lock_file="${BACKUP_LOCK_FILE:-/run/lock/shaheen-edu-postgres-backup.lock}"
readonly backup_mode="${1:---manual}"

if [[ "${backup_mode}" != "--manual" && "${backup_mode}" != "--scheduled" && "${backup_mode}" != "--pre-migration" ]]; then
  echo '{"event":"backup_failed","reason":"invalid_mode"}' >&2
  exit 64
fi

if [[ ! -r "${backup_env_file}" ]]; then
  echo '{"event":"backup_failed","reason":"backup_environment_unavailable"}' >&2
  exit 78
fi

# shellcheck source=/dev/null
source "${backup_env_file}"

for required_value in PGHOST PGPORT PGDATABASE PGUSER PGPASSFILE RESTIC_PASSWORD_FILE BUNNY_STORAGE_ENV_FILE BACKUP_STAGING_DIR RESTIC_CACHE_DIR; do
  if [[ -z "${!required_value:-}" ]]; then
    echo "{\"event\":\"backup_failed\",\"reason\":\"missing_${required_value}\"}" >&2
    exit 78
  fi
done

if [[ ! -r "${PGPASSFILE}" || ! -r "${RESTIC_PASSWORD_FILE}" || ! -r "${BUNNY_STORAGE_ENV_FILE}" ]]; then
  echo '{"event":"backup_failed","reason":"required_secret_file_unavailable"}' >&2
  exit 78
fi

if ! command -v pg_dump >/dev/null || ! command -v psql >/dev/null || ! command -v restic >/dev/null || ! command -v sha256sum >/dev/null; then
  echo '{"event":"backup_failed","reason":"required_command_unavailable"}' >&2
  exit 69
fi

readonly run_started_at="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
readonly run_id="$(date --utc +%Y%m%dT%H%M%SZ)-$(hostname -s)"
readonly operations_prefix="${OPERATIONS_PREFIX:-operations}"
readonly working_dir="${BACKUP_STAGING_DIR}/${run_id}"
readonly dump_file="${working_dir}/database.dump"
readonly manifest_file="${working_dir}/manifest.txt"

if [[ ! -d "${BACKUP_STAGING_DIR}" || ! -w "${BACKUP_STAGING_DIR}" ]]; then
  echo '{"event":"backup_failed","reason":"backup_staging_directory_unavailable"}' >&2
  exit 78
fi

mkdir -p "${RESTIC_CACHE_DIR}"
mkdir -p "$(dirname "${lock_file}")"
mkdir "${working_dir}"

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

# shellcheck source=/dev/null
source "${BUNNY_STORAGE_ENV_FILE}"
for required_value in BUNNY_STORAGE_S3_ENDPOINT BUNNY_STORAGE_BUCKET BUNNY_STORAGE_ACCESS_KEY_ID BUNNY_STORAGE_SECRET_ACCESS_KEY; do
  if [[ -z "${!required_value:-}" ]]; then
    echo "{\"event\":\"backup_failed\",\"reason\":\"missing_${required_value}\"}" >&2
    exit 78
  fi
done

RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-s3:${BUNNY_STORAGE_S3_ENDPOINT%/}/${BUNNY_STORAGE_BUCKET}/${operations_prefix}/postgres-restic}"
AWS_ACCESS_KEY_ID="${BUNNY_STORAGE_ACCESS_KEY_ID}"
AWS_SECRET_ACCESS_KEY="${BUNNY_STORAGE_SECRET_ACCESS_KEY}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION PGPASSFILE RESTIC_PASSWORD_FILE
export RESTIC_REPOSITORY RESTIC_CACHE_DIR="${RESTIC_CACHE_DIR}"

# Do not create a plaintext dump if the encrypted remote repository is not
# available. Repository initialisation is an explicit operator action.
restic cat config >/dev/null

schema_migration="$(psql --host="${PGHOST}" --port="${PGPORT}" --username="${PGUSER}" --dbname="${PGDATABASE}" --tuples-only --no-align \
  --command 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1' 2>/dev/null || true)"
readonly schema_migration="${schema_migration:-unavailable}"

pg_dump --host="${PGHOST}" --port="${PGPORT}" --username="${PGUSER}" --dbname="${PGDATABASE}" \
  --format=custom --compress=9 --no-owner --no-privileges --file="${dump_file}"

readonly dump_checksum="$(sha256sum "${dump_file}" | awk '{print $1}')"
readonly dump_size="$(stat --format=%s "${dump_file}")"
cat >"${manifest_file}" <<EOF
backup_started_at=${run_started_at}
backup_mode=${backup_mode#--}
database=${PGDATABASE}
postgres_host=host-managed
schema_migration=${schema_migration}
dump_format=pg_dump_custom
dump_sha256=${dump_checksum}
dump_bytes=${dump_size}
EOF

backup_output="$(restic backup --tag 'service:postgres' --tag "mode:${backup_mode#--}" --tag "run:${run_id}" "${working_dir}" 2>&1)"
readonly snapshot_id="$(sed -nE 's/^snapshot ([0-9a-f]+) saved$/\1/p' <<<"${backup_output}" | tail -n 1)"
if [[ -z "${snapshot_id}" ]]; then
  echo '{"event":"backup_failed","reason":"snapshot_id_unavailable"}' >&2
  exit 70
fi
restic snapshots "${snapshot_id}" >/dev/null

readonly run_completed_at="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
printf '{"event":"backup_completed","service":"postgres","mode":"%s","backupId":"%s","startedAt":"%s","completedAt":"%s","dumpBytes":%s,"dumpSha256":"%s"}\n' \
  "${backup_mode#--}" "${snapshot_id}" "${run_started_at}" "${run_completed_at}" "${dump_size}" "${dump_checksum}"
