#!/usr/bin/env bash
# Build one privacy-safe, normalized hourly diagnostic bundle. Root-only:
# selected host Nginx/PostgreSQL logs are deliberately outside Compose.
set -euo pipefail
umask 077

readonly project_dir="${PROJECT_DIR:-/opt/shaheen-edu/deploy/production}"
readonly compose_file="${COMPOSE_FILE:-${project_dir}/docker-compose.yml}"
readonly bundle_root="${DIAGNOSTIC_BUNDLE_DIR:-/var/lib/shaheen-edu-diagnostics}"
readonly storage_env_file="${BUNNY_STORAGE_ENV_FILE:-${project_dir}/.env}"
readonly operations_prefix="${OPERATIONS_PREFIX:-operations}"
readonly retention_days="${OBSERVABILITY_LOG_RETENTION_DAYS:-30}"
readonly window="${1:-1h}"
[[ "$window" =~ ^[1-9][0-9]*h$ ]] || { echo 'collection window must be whole hours, e.g. 1h' >&2; exit 64; }
readonly window_hours="${window%h}"
# Host writers provide a numeric epoch because ISO 8601 strings with different
# UTC offsets cannot be safely compared lexicographically.
readonly since_epoch="$(date --utc -d "${window_hours} hours ago" +%s)"
readonly bundle_id="$(date --utc +%Y%m%dT%H%M%SZ)-$(hostname -s)"
readonly stage="${bundle_root}/.${bundle_id}.partial"
readonly archive="${bundle_root}/${bundle_id}.tar.gz"
readonly nginx_source="${NGINX_DIAGNOSTIC_LOG:-/var/log/nginx/shaheen-edu-diagnostic.jsonl}"
readonly postgres_source="${POSTGRES_DIAGNOSTIC_LOG:-/var/log/postgresql/shaheen-edu-diagnostic.jsonl}"

if (( retention_days != 30 )); then echo 'OBSERVABILITY_LOG_RETENTION_DAYS must be exactly 30' >&2; exit 64; fi
for command in docker aws jq tar sha256sum; do command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 69; }; done
[[ -r "$storage_env_file" ]] || { echo 'Bunny storage environment is unavailable' >&2; exit 78; }
# shellcheck source=/dev/null
source "$storage_env_file"
for name in BUNNY_STORAGE_S3_ENDPOINT BUNNY_STORAGE_BUCKET BUNNY_STORAGE_ACCESS_KEY_ID BUNNY_STORAGE_SECRET_ACCESS_KEY; do
  [[ -n "${!name:-}" ]] || { echo "Bunny storage environment is missing $name" >&2; exit 78; }
done

mkdir -p "$stage"
declare -a unavailable=() included=()
record_unavailable() { unavailable+=("$1"); }
collect_compose() {
  local service="$1" output="${stage}/${service}.jsonl"
  # Drop non-JSON Docker engine lines rather than copying raw logs.
  if docker compose -f "$compose_file" logs --no-color --no-log-prefix --since "$window" "$service" | jq -Rc 'fromjson? | select(type == "object")' >"$output"; then
    included+=("$service")
  else rm -f "$output"; record_unavailable "compose:${service}"; fi
}
collect_host_jsonl() {
  local layer="$1" source="$2" output="${stage}/${layer}.jsonl"
  local -a sources=()
  # The active file may have rotated after the prior hourly run. Include the
  # one uncompressed predecessor so that boundary does not create a log gap.
  [[ -r "$source" ]] && sources+=("$source")
  [[ -r "${source}.1" ]] && sources+=("${source}.1")
  if (( ${#sources[@]} )); then
    jq -c --argjson since "$since_epoch" '
      select(
        type == "object" and
        ((.timestampEpochSeconds? | tonumber?) >= $since)
      )
    ' "${sources[@]}" >"$output" || { rm -f "$output"; record_unavailable "host:${layer}:invalid_json"; return; }
    included+=("$layer")
  else record_unavailable "host:${layer}:unavailable"; fi
}

cd "$project_dir"
collect_compose api-gateway; collect_compose api; collect_compose worker; collect_compose redis
collect_host_jsonl nginx "$nginx_source"; collect_host_jsonl postgres "$postgres_source"

{
  printf '{\n  "schemaVersion": 1,\n  "bundleCreatedAt": "%s",\n' "$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "collectionWindow": "%s",\n  "environment": "%s",\n  "version": "%s",\n' "$window" "${NODE_ENV:-production}" "${VERSION:-unknown}"
  printf '  "serviceCoverage": %s,\n' "$(printf '%s\n' "${included[@]:-}" | jq -R . | jq -sc .)"
  printf '  "unavailableSources": %s,\n  "checksums": {' "$(printf '%s\n' "${unavailable[@]:-}" | jq -R . | jq -sc .)"
  first=true
  for file in "$stage"/*.jsonl; do [[ -e "$file" ]] || continue; $first || printf ','; first=false; printf '\n    "%s": "%s"' "$(basename "$file")" "$(sha256sum "$file" | awk '{print $1}')"; done
  [[ "$first" == true ]] || printf '\n  '
  printf '}\n}\n'
} >"${stage}/manifest.json"

tar -C "$stage" -czf "${archive}.partial" .
mv "${archive}.partial" "$archive"
rm -rf "$stage"
export AWS_ACCESS_KEY_ID="$BUNNY_STORAGE_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$BUNNY_STORAGE_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
readonly remote_root="s3://${BUNNY_STORAGE_BUCKET}/${operations_prefix}/diagnostic-bundles"
aws --endpoint-url "$BUNNY_STORAGE_S3_ENDPOINT" s3 cp "$archive" "$remote_root/$(basename "$archive")" --only-show-errors

# Only this prefix and timestamped diagnostic archives participate in pruning.
readonly cutoff="$(date --utc -d "${retention_days} days ago" +%s)"
while IFS= read -r key; do
  name="${key##*/}"; [[ "$name" =~ ^([0-9]{8}T[0-9]{6}Z)-.*\.tar\.gz$ ]] || continue
  created_epoch="$(date --utc -d "${BASH_REMATCH[1]}" +%s 2>/dev/null || true)"
  [[ -n "$created_epoch" && "$created_epoch" -lt "$cutoff" ]] || continue
  aws --endpoint-url "$BUNNY_STORAGE_S3_ENDPOINT" s3 rm "s3://${BUNNY_STORAGE_BUCKET}/${key}" --only-show-errors
done < <(aws --endpoint-url "$BUNNY_STORAGE_S3_ENDPOINT" s3 ls "$remote_root/" --recursive | awk '{print $4}')
find "$bundle_root" -maxdepth 1 -type f -name '*.tar.gz' -mtime +30 -delete
printf 'Diagnostic bundle created and uploaded: %s\n' "$archive"
