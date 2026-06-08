#!/usr/bin/env bash
#
# Remove EdgePress wizard test resources from Cloudflare.
#
# Usage:
#   ./scripts/teardown-test-resources.sh "Farra Media"
#   ./scripts/teardown-test-resources.sh dem
#   ./scripts/teardown-test-resources.sh dem --worker farra-media
#   ./scripts/teardown-test-resources.sh "Demo Site" --yes
#
# Token (first match wins):
#   CLOUDFLARE_API_TOKEN, CF_API_TOKEN, or token= in .env.local
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="https://api.cloudflare.com/client/v4"

SITE_NAME=""
PREFIX=""
WORKER_NAME=""
LEGACY_WORKER=""
ASSUME_YES=false
DRY_RUN=false

usage() {
	cat <<'EOF'
Remove Cloudflare resources created by the EdgePress wizard during tests.

Usage:
  teardown-test-resources.sh <site-name-or-prefix> [options]

Arguments:
  site-name-or-prefix   Full site name (e.g. "Farra Media") or 3-letter prefix (e.g. dem)

Options:
  --worker NAME         Worker script name (overrides slug from site name)
  --prefix ABC          Force 3-letter prefix when using --worker alone
  --yes, -y             Skip confirmation prompt
  --dry-run             Print actions without deleting
  -h, --help            Show this help

Examples:
  ./scripts/teardown-test-resources.sh "Farra Media"
  ./scripts/teardown-test-resources.sh dem --worker farra-media --yes
  ./scripts/teardown-test-resources.sh tes --dry-run
EOF
}

log() {
	printf '%s\n' "$*"
}

warn() {
	printf 'WARN: %s\n' "$*" >&2
}

die() {
	printf 'ERROR: %s\n' "$*" >&2
	exit 1
}

normalize_ascii_lower() {
	printf '%s' "$1" | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null | tr '[:upper:]' '[:lower:]' || printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

derive_site_prefix() {
	local name lower letters
	name="$1"
	lower="$(normalize_ascii_lower "$name")"
	letters="$(printf '%s' "$lower" | tr -cd 'a-z')"
	if ((${#letters} < 3)); then
		printf '%s' "$letters"
		while ((${#letters} < 3)); do
			letters="${letters}x"
		done
		printf '%.3s' "$letters"
	else
		printf '%.3s' "$letters"
	fi
}

derive_worker_name() {
	local slug
	slug="$(normalize_ascii_lower "$1")"
	slug="$(printf '%s' "$slug" | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')"
	slug="${slug:0:63}"
	if [[ -z "$slug" ]]; then
		slug="edgepress-site"
	fi
	printf '%s' "$slug"
}

load_api_token() {
	if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
		printf '%s' "$CLOUDFLARE_API_TOKEN"
		return 0
	fi
	if [[ -n "${CF_API_TOKEN:-}" ]]; then
		printf '%s' "$CF_API_TOKEN"
		return 0
	fi
	if [[ -f "$ROOT_DIR/.env.local" ]]; then
		local line key value
		while IFS= read -r line || [[ -n "$line" ]]; do
			[[ "$line" =~ ^[[:space:]]*# ]] && continue
			[[ "$line" != *"="* ]] && continue
			key="${line%%=*}"
			value="${line#*=}"
			key="$(printf '%s' "$key" | tr -d '[:space:]')"
			value="$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
			case "$key" in
				token | CLOUDFLARE_API_TOKEN | CF_API_TOKEN)
					if [[ -n "$value" ]]; then
						printf '%s' "$value"
						return 0
					fi
					;;
			esac
		done <"$ROOT_DIR/.env.local"
	fi
	return 1
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

cf_request() {
	local method path body
	method="$1"
	path="$2"
	body="${3:-}"

	if [[ "$DRY_RUN" == true ]]; then
		log "[dry-run] $method $path"
		return 0
	fi

	local args=(-sS -X "$method" "$API_BASE$path" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
	if [[ -n "$body" ]]; then
		args+=(-d "$body")
	fi

	RESPONSE="$(curl "${args[@]}")"
	if ! printf '%s' "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
		local message
		message="$(printf '%s' "$RESPONSE" | jq -r '.errors[0].message // "Unknown Cloudflare API error"')"
		die "$method $path failed: $message"
	fi
}

cf_request_allow_missing() {
	local method path body
	method="$1"
	path="$2"
	body="${3:-}"

	if [[ "$DRY_RUN" == true ]]; then
		log "[dry-run] $method $path"
		return 0
	fi

	local args=(-sS -X "$method" "$API_BASE$path" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
	if [[ -n "$body" ]]; then
		args+=(-d "$body")
	fi

	RESPONSE="$(curl "${args[@]}")"
	if printf '%s' "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
		return 0
	fi

	local code message
	code="$(printf '%s' "$RESPONSE" | jq -r '.errors[0].code // empty')"
	message="$(printf '%s' "$RESPONSE" | jq -r '.errors[0].message // "Unknown Cloudflare API error"')"
	if [[ "$code" == "10007" || "$message" == *"not found"* || "$message" == *"Not Found"* ]]; then
		warn "Already removed or not found: $path"
		return 0
	fi
	die "$method $path failed: $message"
}

resolve_account_id() {
	if [[ "$DRY_RUN" == true ]]; then
		ACCOUNT_ID="dry-run-account"
		return 0
	fi

	cf_request GET "/accounts?per_page=1"
	ACCOUNT_ID="$(printf '%s' "$RESPONSE" | jq -r '.result[0].id // empty')"
	[[ -n "$ACCOUNT_ID" ]] || die "No Cloudflare account found for this token."
}

delete_worker() {
	local name="$1"
	[[ -z "$name" ]] && return 0
	log "Deleting Worker: $name"
	cf_request_allow_missing DELETE "/accounts/$ACCOUNT_ID/workers/scripts/$name"
}

find_d1_id() {
	local name="$1"
	if [[ "$DRY_RUN" == true ]]; then
		printf 'dry-run-d1-id'
		return 0
	fi
	cf_request GET "/accounts/$ACCOUNT_ID/d1/database"
	printf '%s' "$RESPONSE" | jq -r --arg name "$name" '.result[] | select(.name == $name) | .uuid' | head -n 1
}

delete_d1() {
	local name="$1"
	local id
	id="$(find_d1_id "$name")"
	if [[ -z "$id" ]]; then
		warn "D1 database not found: $name"
		return 0
	fi
	log "Deleting D1: $name ($id)"
	cf_request_allow_missing DELETE "/accounts/$ACCOUNT_ID/d1/database/$id"
}

find_kv_id() {
	local title="$1"
	if [[ "$DRY_RUN" == true ]]; then
		printf 'dry-run-kv-id'
		return 0
	fi
	cf_request GET "/accounts/$ACCOUNT_ID/storage/kv/namespaces?per_page=100"
	printf '%s' "$RESPONSE" | jq -r --arg title "$title" '.result[] | select(.title == $title) | .id' | head -n 1
}

delete_kv() {
	local name="$1"
	local id
	id="$(find_kv_id "$name")"
	if [[ -z "$id" ]]; then
		warn "KV namespace not found: $name"
		return 0
	fi
	log "Deleting KV: $name ($id)"
	cf_request_allow_missing DELETE "/accounts/$ACCOUNT_ID/storage/kv/namespaces/$id"
}

empty_r2_bucket() {
	local bucket="$1"
	local cursor="" page

	if [[ "$DRY_RUN" == true ]]; then
		log "[dry-run] Empty R2 bucket: $bucket"
		return 0
	fi

	while true; do
		local query="/accounts/$ACCOUNT_ID/r2/buckets/$bucket/objects?limit=100"
		if [[ -n "$cursor" ]]; then
			query="${query}&cursor=${cursor}"
		fi
		cf_request GET "$query"
		page="$(printf '%s' "$RESPONSE" | jq -c '.result // []')"
		if [[ "$page" == "[]" ]]; then
			break
		fi

		local keys key encoded_key
		keys="$(printf '%s' "$page" | jq -r '.[].key')"
		while IFS= read -r key; do
			[[ -z "$key" ]] && continue
			encoded_key="$(printf '%s' "$key" | jq -sRr @uri)"
			log "  Removing R2 object: $key"
			cf_request_allow_missing DELETE "/accounts/$ACCOUNT_ID/r2/buckets/$bucket/objects/$encoded_key"
		done <<<"$keys"

		cursor="$(printf '%s' "$RESPONSE" | jq -r '.result_info.cursor // empty')"
		[[ -z "$cursor" ]] && break
	done
}

delete_r2() {
	local bucket="$1"
	log "Deleting R2 bucket: $bucket"
	empty_r2_bucket "$bucket"
	cf_request_allow_missing DELETE "/accounts/$ACCOUNT_ID/r2/buckets/$bucket"
}

parse_args() {
	if [[ $# -eq 0 ]]; then
		usage
		exit 1
	fi

	while [[ $# -gt 0 ]]; do
		case "$1" in
			-h | --help)
				usage
				exit 0
				;;
			--yes | -y)
				ASSUME_YES=true
				shift
				;;
			--dry-run)
				DRY_RUN=true
				shift
				;;
			--worker)
				[[ $# -lt 2 ]] && die "Missing value for --worker"
				WORKER_NAME="$2"
				shift 2
				;;
			--prefix)
				[[ $# -lt 2 ]] && die "Missing value for --prefix"
				PREFIX="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')"
				shift 2
				;;
			--*)
				die "Unknown option: $1"
				;;
			*)
				if [[ -n "$SITE_NAME" ]]; then
					die "Unexpected argument: $1"
				fi
				SITE_NAME="$1"
				shift
				;;
		esac
	done

	[[ -n "$SITE_NAME" || -n "$PREFIX" ]] || die "Provide a site name or --prefix."

	if [[ -n "$SITE_NAME" && "$SITE_NAME" =~ ^[a-zA-Z]{3}$ ]]; then
		PREFIX="$(printf '%s' "$SITE_NAME" | tr '[:upper:]' '[:lower:]')"
		SITE_NAME=""
	fi

	if [[ -z "$PREFIX" && -n "$SITE_NAME" ]]; then
		PREFIX="$(derive_site_prefix "$SITE_NAME")"
	fi

	if [[ -z "$WORKER_NAME" && -n "$SITE_NAME" ]]; then
		WORKER_NAME="$(derive_worker_name "$SITE_NAME")"
	fi

	if [[ -n "$PREFIX" && ! "$PREFIX" =~ ^[a-z]{3}$ ]]; then
		die "Prefix must be exactly 3 letters: $PREFIX"
	fi

	if [[ -z "$PREFIX" ]]; then
		die "Could not resolve prefix. Pass --prefix or a site name."
	fi

	LEGACY_WORKER="${PREFIX}_egp_worker"
}

main() {
	parse_args "$@"

	require_command curl
	require_command jq

	TOKEN="$(load_api_token || true)"
	[[ -n "$TOKEN" ]] || die "Cloudflare API token not found. Set CLOUDFLARE_API_TOKEN or token= in .env.local"

	D1_NAME="${PREFIX}_egp_d1"
	KV_NAME="${PREFIX}_egp_kv"
	R2_NAME="${PREFIX}-egp-r2"

	log "EdgePress wizard teardown"
	log "  Prefix:   $PREFIX"
	log "  D1:       $D1_NAME"
	log "  KV:       $KV_NAME"
	log "  R2:       $R2_NAME"
	if [[ -n "$WORKER_NAME" ]]; then
		log "  Worker:   $WORKER_NAME"
	fi
	log "  Legacy:   $LEGACY_WORKER (if exists)"
	log ""

	if [[ "$ASSUME_YES" != true && "$DRY_RUN" != true ]]; then
		read -r -p "Delete these resources? [y/N] " confirm
		[[ "$confirm" =~ ^[Yy]$ ]] || die "Aborted."
	fi

	resolve_account_id

	delete_worker "$WORKER_NAME"
	if [[ -n "$WORKER_NAME" && "$WORKER_NAME" != "$LEGACY_WORKER" ]]; then
		delete_worker "$LEGACY_WORKER"
	elif [[ -z "$WORKER_NAME" ]]; then
		delete_worker "$LEGACY_WORKER"
	fi

	delete_kv "$KV_NAME"
	delete_d1 "$D1_NAME"
	delete_r2 "$R2_NAME"

	log ""
	log "Done. Build triggers and secrets were not removed automatically."
}

main "$@"
