#!/bin/sh
# Render preview from the production template; keep caching and CSP identical.
set -eu
root="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
case "${1:-https}" in
	http) template="$root/deploy/nginx/mealsplit-http.conf" ;;
	https) template="$root/deploy/nginx/mealsplit.conf" ;;
	*) echo "usage: $0 [http|https]" >&2; exit 1 ;;
esac
sed \
	-e 's/mealsplit\.georgeanagnostou\.com/preview.mealsplit.georgeanagnostou.com/g' \
	-e 's|/var/www/mealsplit|/var/www/mealsplit-preview|g' \
	-e 's/mealsplit_cache_control/mealsplit_preview_cache_control/g' \
	-e 's/mealsplit_ssl/mealsplit_preview_ssl/g' \
	"$template"
