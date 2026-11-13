#!/bin/sh
# Deploy mealsplit to the VPS as static files. See docs/DEPLOY.md.
#
#   scripts/deploy.sh [deploy]   check, build, upload a new release, switch to it, keep the last few
#   scripts/deploy.sh rollback   switch back to the release before the current one
#   scripts/deploy.sh list       show the releases on the server
#   scripts/deploy.sh verify     check the live site's headers
#
# Settings come from the environment or from .env.deploy (KEY=value lines; the environment
# wins). See .env.deploy.example. Server layout under MEALSPLIT_DEPLOY_PATH:
#
#   releases/20261113T151400Z-9cb9a5f/   one directory per deploy (UTC time, commit)
#   current -> releases/...              what nginx serves; switched with one atomic rename
#
# No sudo: the SSH user must own MEALSPLIT_DEPLOY_PATH (one-time setup in docs/DEPLOY.md).
set -eu

ACTION="${1:-deploy}"
ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

die() {
	echo "deploy: $*" >&2
	exit 1
}

# Read .env.deploy without executing it. Only MEALSPLIT_* keys, and values already set win.
ENV_FILE="${MEALSPLIT_ENV_FILE:-$ROOT_DIR/.env.deploy}"
if [ -f "$ENV_FILE" ]; then
	while IFS= read -r line || [ -n "$line" ]; do
		case "$line" in '' | '#'*) continue ;; esac
		key="${line%%=*}"
		value="${line#*=}"
		case "$key" in
			MEALSPLIT_*) ;;
			*) die "$ENV_FILE: expected MEALSPLIT_NAME=value, got: $line" ;;
		esac
		case "$key" in *[!A-Z_]*) die "$ENV_FILE: bad name: $key" ;; esac
		eval "already=\${$key-}" # $key is checked above: capitals and underscores only
		if [ -z "$already" ]; then export "$key=$value"; fi
	done <"$ENV_FILE"
fi

LOCAL="${MEALSPLIT_DEPLOY_LOCAL:-}"
HOST="${MEALSPLIT_DEPLOY_HOST:-}"
SSH_USER="${MEALSPLIT_DEPLOY_USER:-}"
DEPLOY_PATH="${MEALSPLIT_DEPLOY_PATH:-/var/www/mealsplit}"
KEEP="${MEALSPLIT_KEEP_RELEASES:-5}"
URL="${MEALSPLIT_URL:-}"
URL="${URL%/}"
DIST="${MEALSPLIT_DIST_DIR:-dist}" # tests point this at a fake build

case "$DEPLOY_PATH" in
	/*) ;;
	*) die "MEALSPLIT_DEPLOY_PATH must be absolute: $DEPLOY_PATH" ;;
esac
case "$DEPLOY_PATH" in
	*[!A-Za-z0-9._/-]* | / | */) die "MEALSPLIT_DEPLOY_PATH may only use letters, digits and ._/- and must not end in /" ;;
esac
case "$KEEP" in
	'' | *[!0-9]*) die "MEALSPLIT_KEEP_RELEASES must be a number" ;;
esac
[ "$KEEP" -ge 2 ] || die "MEALSPLIT_KEEP_RELEASES must be at least 2 so rollback has somewhere to go"

if [ "$LOCAL" = "1" ]; then
	# Testing: "deploy" into a directory on this machine, no SSH. Same steps otherwise.
	DEST="$DEPLOY_PATH"
	WHERE="$DEPLOY_PATH (local)"
else
	[ -n "$HOST" ] || die "set MEALSPLIT_DEPLOY_HOST (an SSH host or ~/.ssh/config alias) in .env.deploy"
	case "$HOST$SSH_USER" in *[!A-Za-z0-9._@-]*) die "MEALSPLIT_DEPLOY_HOST/USER have unexpected characters" ;; esac
	if [ -n "$SSH_USER" ]; then REMOTE="$SSH_USER@$HOST"; else REMOTE="$HOST"; fi
	DEST="$REMOTE:$DEPLOY_PATH"
	WHERE="$REMOTE:$DEPLOY_PATH"
fi

# The server side of every action lives in deploy-server.sh and is piped over SSH.
server_script() {
	cat "$ROOT_DIR/scripts/deploy-server.sh"
}

on_server() {
	if [ "$LOCAL" = "1" ]; then
		server_script | sh -eu -s -- "$@"
	else
		# Every argument is checked above to be free of spaces and quotes.
		server_script | ssh "$REMOTE" sh -eu -s -- "$@"
	fi
}

# Check the live site: the app, no-cache on the files that must update, and the OCR data
# served as raw gzip (tesseract.js unzips it itself).
verify_site() {
	if [ -z "$URL" ]; then
		echo "MEALSPLIT_URL not set; skipping the live check"
		return 0
	fi
	echo "checking $URL"
	headers="$(curl -fsSI --max-time 10 "$URL/")" || die "$URL/ did not answer"
	printf '%s\n' "$headers" | grep -qi '^cache-control: no-cache' || die "index.html is missing Cache-Control: no-cache"
	headers="$(curl -fsSI --max-time 10 "$URL/sw.js")" || die "$URL/sw.js did not answer"
	printf '%s\n' "$headers" | grep -qi '^cache-control: no-cache' || die "sw.js is missing Cache-Control: no-cache"
	headers="$(curl -fsSI --max-time 10 "$URL/ocr/lang/eng.traineddata.gz")" || die "OCR language data did not answer"
	printf '%s\n' "$headers" | grep -qi '^content-type: application/gzip' || die "eng.traineddata.gz should be application/gzip"
	if printf '%s\n' "$headers" | grep -qi '^content-encoding:'; then die "eng.traineddata.gz must not have Content-Encoding"; fi
	echo "live site looks right"
}

case "$ACTION" in
deploy) ;;
rollback)
	echo "rolling back on $WHERE"
	on_server rollback "$DEPLOY_PATH"
	verify_site
	exit 0
	;;
list)
	on_server list "$DEPLOY_PATH"
	exit 0
	;;
verify)
	verify_site
	exit 0
	;;
*) die "usage: $0 [deploy|rollback|list|verify]" ;;
esac

# Deploy what is committed, so every release maps to a commit.
SHA="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain)" ]; then
	[ "${MEALSPLIT_ALLOW_DIRTY:-}" = "1" ] || die "uncommitted changes; commit them or set MEALSPLIT_ALLOW_DIRTY=1"
	SHA="$SHA-dirty"
fi
ID="$(date -u +%Y%m%dT%H%M%SZ)-$SHA"

if [ "${MEALSPLIT_SKIP_BUILD:-}" = "1" ]; then
	echo "using the existing $DIST/ (MEALSPLIT_SKIP_BUILD=1)"
else
	npm ci
	npm run check
	npm run build
fi
if [ ! -f "$DIST/index.html" ] || [ ! -f "$DIST/sw.js" ]; then die "$DIST/ is not a complete build; run npm run build"; fi

echo "deploying $ID to $WHERE"
LIVE="$(on_server prepare "$DEPLOY_PATH")"

# Upload into a .partial directory. Files unchanged since the live release become hard links
# to it (--link-dest), so only what changed crosses the network. Compared by checksum (-c),
# since every build writes fresh modification times.
set -- -rlc --delete --exclude='.*'
if [ -n "$LIVE" ]; then set -- "$@" --link-dest="$DEPLOY_PATH/releases/$LIVE/"; fi
rsync "$@" "$DIST/" "$DEST/releases/$ID.partial/"

on_server activate "$DEPLOY_PATH" "$ID" "$KEEP"
verify_site
echo "deployed $ID"
