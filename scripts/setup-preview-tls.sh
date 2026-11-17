#!/bin/sh
# Run from your Mac after preview DNS points at the VPS. Only this nginx site is installed.
set -eu
root="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
host="${MEALSPLIT_ADMIN_HOST:-kapnizo}"
domain=preview.mealsplit.georgeanagnostou.com
sh "$root/scripts/preview-nginx.sh" https | ssh "$host" 'cat > /var/www/mealsplit-preview/site.https.pending'
ssh "$host" sh -se <<'REMOTE'
domain=preview.mealsplit.georgeanagnostou.com
base=/var/www/mealsplit-preview
site=/etc/nginx/sites-available/$domain
test -f "$base/current/index.html"
test -f "$site"
certbot certonly --non-interactive --webroot \
  --webroot-path "$base/acme" --cert-name "$domain" -d "$domain" \
  --deploy-hook "nginx -t && systemctl reload nginx"
cp "$site" "$site.previous"
install -m 0644 "$base/site.https.pending" "$site"
if ! nginx -t; then
  cp "$site.previous" "$site"
  echo "Preview config restored; nginx was not reloaded." >&2
  exit 1
fi
systemctl reload nginx
rm "$base/site.https.pending"
REMOTE
MEALSPLIT_DEPLOY_HOST="$host" MEALSPLIT_URL="https://$domain" sh "$root/scripts/deploy.sh" verify
gh variable set VERIFY_URL --repo George-Anagnostou/mealsplit --env preview --body "https://$domain"
echo "Preview HTTPS is ready; future deployments will verify the public site."
