#!/usr/bin/env bash
# Verify the encrypted PostgreSQL backup repository without touching the live
# database. A separate weekly unit keeps backup creation fast while proving
# that a sample of remote pack data remains readable.
set -euo pipefail

umask 077

readonly backup_env_file="${BACKUP_ENV_FILE:-/etc/shaheen-edu/backup.env}"
readonly read_data_subset="${RESTIC_CHECK_READ_DATA_SUBSET:-5%}"
readonly lock_file="${BACKUP_LOCK_FILE:-/run/lock/shaheen-edu-postgres-backup.lock}"

if [[ ! -r "${backup_env_file}" ]]; then
  echo '{"event":"backup_verification_failed","reason":"backup_environment_unavailable"}' >&2
  exit 78
fi

# shellcheck source=/dev/null
source "${backup_env_file}"
for required_value in RESTIC_PASSWORD_FILE BACKUP_STORAGE_ENV_FILE RESTIC_CACHE_DIR; do
  if [[ -z "${!required_value:-}" ]]; then
    echo "{\"event\":\"backup_verification_failed\",\"reason\":\"missing_${required_value}\"}" >&2
    exit 78
  fi
done
if [[ ! -r "${RESTIC_PASSWORD_FILE}" || ! -r "${BACKUP_STORAGE_ENV_FILE}" ]]; then
  echo '{"event":"backup_verification_failed","reason":"required_secret_file_unavailable"}' >&2
  exit 78
fi
if ! command -v restic >/dev/null || ! command -v flock >/dev/null; then
  echo '{"event":"backup_verification_failed","reason":"required_command_unavailable"}' >&2
  exit 69
fi
if [[ ! "${read_data_subset}" =~ ^([1-9][0-9]?|100)%$ ]]; then
  echo '{"event":"backup_verification_failed","reason":"invalid_read_data_subset"}' >&2
  exit 78
fi

# shellcheck source=/dev/null
source "${BACKUP_STORAGE_ENV_FILE}"
for required_value in BUNNY_STORAGE_S3_ENDPOINT BUNNY_STORAGE_BUCKET BUNNY_STORAGE_ACCESS_KEY_ID BUNNY_STORAGE_SECRET_ACCESS_KEY; do
  if [[ -z "${!required_value:-}" ]]; then
    echo "{\"event\":\"backup_verification_failed\",\"reason\":\"missing_${required_value}\"}" >&2
    exit 78
  fi
done

readonly operations_prefix="${OPERATIONS_PREFIX:-operations}"
export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-s3:${BUNNY_STORAGE_S3_ENDPOINT%/}/${BUNNY_STORAGE_BUCKET}/${operations_prefix}/postgres-restic}"
export RESTIC_PASSWORD_FILE
export RESTIC_CACHE_DIR="${RESTIC_CACHE_DIR}"
export AWS_ACCESS_KEY_ID="${BUNNY_STORAGE_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BUNNY_STORAGE_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"

mkdir -p "${RESTIC_CACHE_DIR}"
mkdir -p "$(dirname "${lock_file}")"
exec 9>"${lock_file}"
if ! flock -w 300 9; then
  echo '{"event":"backup_verification_failed","reason":"backup_lock_timeout"}' >&2
  exit 75
fi
restic cat config >/dev/null
restic check --read-data-subset="${read_data_subset}"
printf '{"event":"backup_verification_completed","service":"postgres","readDataSubset":"%s"}\n' "${read_data_subset}"
