#!/usr/bin/env bash
# Restore an encrypted host-PostgreSQL backup only into an allow-listed,
# non-production empty database. It deliberately has no live-overwrite mode.
set -euo pipefail

umask 077

readonly backup_env_file="${BACKUP_ENV_FILE:-/etc/shaheen-edu/backup.env}"
snapshot=''
target_database=''
confirmation=''

while (($#)); do
  case "$1" in
    --snapshot) snapshot="${2:-}"; shift 2 ;;
    --target-database) target_database="${2:-}"; shift 2 ;;
    --confirm-target) confirmation="${2:-}"; shift 2 ;;
    *) echo "Usage: $0 --snapshot <restic-snapshot-or-latest> --target-database <allowed-empty-db> --confirm-target <same-db>" >&2; exit 64 ;;
  esac
done

if [[ -z "${snapshot}" || -z "${target_database}" || "${confirmation}" != "${target_database}" ]]; then
  echo 'A snapshot, target database, and matching confirmation are required.' >&2
  exit 64
fi
if [[ ! -r "${backup_env_file}" ]]; then
  echo 'Backup environment is unavailable.' >&2
  exit 78
fi

# shellcheck source=/dev/null
source "${backup_env_file}"
for required_value in PGHOST PGPORT PGDATABASE PGUSER PGPASSFILE RESTIC_PASSWORD_FILE BACKUP_STORAGE_ENV_FILE BACKUP_STAGING_DIR RESTIC_CACHE_DIR RESTORE_ALLOWED_DATABASES; do
  if [[ -z "${!required_value:-}" ]]; then
    echo "Restore environment is missing ${required_value}." >&2
    exit 78
  fi
done
if [[ ! -r "${PGPASSFILE}" || ! -r "${RESTIC_PASSWORD_FILE}" || ! -r "${BACKUP_STORAGE_ENV_FILE}" ]]; then
  echo 'Required restore secret file is unavailable.' >&2
  exit 78
fi
if ! command -v psql >/dev/null || ! command -v pg_restore >/dev/null || ! command -v restic >/dev/null || ! command -v sha256sum >/dev/null; then
  echo 'psql, pg_restore, restic, and sha256sum are required.' >&2
  exit 69
fi
if [[ "${target_database}" == "${PGDATABASE}" ]]; then
  echo 'Refusing to restore over the configured production/source database.' >&2
  exit 65
fi

case ",${RESTORE_ALLOWED_DATABASES}," in
  *,"${target_database}",*) ;;
  *) echo 'Target database is not in RESTORE_ALLOWED_DATABASES.' >&2; exit 65 ;;
esac

# shellcheck source=/dev/null
source "${BACKUP_STORAGE_ENV_FILE}"
for required_value in BUNNY_STORAGE_S3_ENDPOINT BUNNY_STORAGE_BUCKET BUNNY_STORAGE_ACCESS_KEY_ID BUNNY_STORAGE_SECRET_ACCESS_KEY; do
  if [[ -z "${!required_value:-}" ]]; then
    echo "Restore environment is missing ${required_value}." >&2
    exit 78
  fi
done

readonly operations_prefix="${OPERATIONS_PREFIX:-operations}"
RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-s3:${BUNNY_STORAGE_S3_ENDPOINT%/}/${BUNNY_STORAGE_BUCKET}/${operations_prefix}/postgres-restic}"
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE PGPASSFILE
export RESTIC_CACHE_DIR="${RESTIC_CACHE_DIR}"
export AWS_ACCESS_KEY_ID="${BUNNY_STORAGE_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BUNNY_STORAGE_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"

readonly restore_dir="$(mktemp -d "${BACKUP_STAGING_DIR}/restore.XXXXXX")"
cleanup() { rm -rf -- "${restore_dir}"; }
trap cleanup EXIT

restic restore "${snapshot}" --target "${restore_dir}"
readonly dump_file="$(find "${restore_dir}" -type f -name database.dump -print -quit)"
readonly manifest_file="$(find "${restore_dir}" -type f -name manifest.txt -print -quit)"
if [[ -z "${dump_file}" ]]; then
  echo 'Restic snapshot does not contain database.dump.' >&2
  exit 66
fi
if [[ -z "${manifest_file}" ]]; then
  echo 'Restic snapshot does not contain manifest.txt.' >&2
  exit 66
fi

expected_checksum="$(awk -F= '$1 == "dump_sha256" { print $2; exit }' "${manifest_file}")"
if [[ ! "${expected_checksum}" =~ ^[a-fA-F0-9]{64}$ ]]; then
  echo 'Restore manifest has no valid dump checksum.' >&2
  exit 66
fi
actual_checksum="$(sha256sum "${dump_file}" | awk '{print $1}')"
if [[ "${actual_checksum}" != "${expected_checksum}" ]]; then
  echo 'Restored database dump checksum does not match its manifest.' >&2
  exit 66
fi

# Never merge into an existing database: host automation must create an empty,
# allow-listed disposable target before this script is used.
existing_tables="$(psql --host="${PGHOST}" --port="${PGPORT}" --username="${PGUSER}" --dbname="${target_database}" --tuples-only --no-align \
  --command "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')")"
if [[ "${existing_tables//[[:space:]]/}" != '0' ]]; then
  echo 'Refusing to restore into a non-empty target database.' >&2
  exit 65
fi

pg_restore --exit-on-error --no-owner --no-privileges --host="${PGHOST}" --port="${PGPORT}" --username="${PGUSER}" --dbname="${target_database}" "${dump_file}"
printf '{"event":"restore_completed","sourceSnapshot":"%s","targetDatabase":"%s"}\n' "${snapshot}" "${target_database}"
