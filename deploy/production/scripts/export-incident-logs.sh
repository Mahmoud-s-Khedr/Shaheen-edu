#!/usr/bin/env bash
# Export a restricted incident bundle and upload it to the private Bunny S3
# Storage Zone shared with application assets. Bundles remain locally as a
# root-only fallback and are also downloadable from the Bunny dashboard.
set -euo pipefail

umask 077

readonly project_dir="${PROJECT_DIR:-/opt/shaheen-edu/deploy/production}"
readonly compose_file="${COMPOSE_FILE:-${project_dir}/docker-compose.yml}"
readonly since="${1:-6h}"
readonly bundle_root="${INCIDENT_LOG_DIR:-/var/lib/shaheen-edu-incident-logs}"
readonly bundle_id="$(date --utc +%Y%m%dT%H%M%SZ)-$(hostname -s)"
readonly bundle_dir="${bundle_root}/${bundle_id}"
readonly storage_env_file="${BUNNY_STORAGE_ENV_FILE:-${project_dir}/.env}"
readonly operations_prefix="${OPERATIONS_PREFIX:-operations}"

if ! command -v docker >/dev/null || ! command -v aws >/dev/null || ! command -v sha256sum >/dev/null; then
  echo 'docker, aws, and sha256sum are required to export incident logs' >&2
  exit 69
fi

if [[ ! -r "${storage_env_file}" ]]; then
  echo 'Bunny storage environment is unavailable' >&2
  exit 78
fi

# shellcheck source=/dev/null
source "${storage_env_file}"
for required_value in BUNNY_STORAGE_S3_ENDPOINT BUNNY_STORAGE_BUCKET BUNNY_STORAGE_ACCESS_KEY_ID BUNNY_STORAGE_SECRET_ACCESS_KEY; do
  if [[ -z "${!required_value:-}" ]]; then
    echo "Bunny storage environment is missing ${required_value}" >&2
    exit 78
  fi
done

mkdir -p "${bundle_dir}"
cd "${project_dir}"

# Host Nginx and host PostgreSQL logs are owned by the operator and are not
# available through Compose. The listed services are the approved local
# investigation set; do not add arbitrary containers casually.
docker compose -f "${compose_file}" logs \
  --no-color --timestamps --since "${since}" \
  api worker redis >"${bundle_dir}/compose.log"

readonly compose_sha256="$(sha256sum "${bundle_dir}/compose.log" | awk '{print $1}')"
cat >"${bundle_dir}/manifest.txt" <<EOF
bundle_created_at=$(date --utc +%Y-%m-%dT%H:%M:%SZ)
window=${since}
release_revision=${RELEASE_REVISION:-unknown}
compose_log_sha256=${compose_sha256}
host_postgres_backup_logs=operator-managed; not collected by this repository
handling=restricted; copy only to an encrypted, access-controlled machine; delete after incident closure
EOF

export AWS_ACCESS_KEY_ID="${BUNNY_STORAGE_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BUNNY_STORAGE_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
readonly remote_prefix="s3://${BUNNY_STORAGE_BUCKET}/${operations_prefix}/incident-logs/${bundle_id}/"
aws --endpoint-url "${BUNNY_STORAGE_S3_ENDPOINT}" s3 cp \
  "${bundle_dir}" "${remote_prefix}" --recursive --only-show-errors

printf 'Incident log bundle created: %s\n' "${bundle_dir}"
printf 'Incident log bundle uploaded: %s\n' "${remote_prefix}"
