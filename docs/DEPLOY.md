# Deploy

mealsplit is static files: nginx serves `dist/` from the VPS, with no server process and no
database (all data stays in the browser on each device). It sits next to bookmarks behind the
same nginx and Let's Encrypt setup.

```text
internet → nginx :443 (mealsplit.georgeanagnostou.com) → /var/www/mealsplit/current → releases/<id>/
```

| Path on the VPS | Purpose |
|-----------------|---------|
| `/etc/nginx/sites-available/mealsplit.georgeanagnostou.com` | nginx site (from `deploy/nginx/mealsplit.conf`, including TLS) |
| `/var/www/mealsplit/releases/<UTC time>-<commit>/` | One directory per deploy; the last 5 are kept |
| `/var/www/mealsplit/current` | Symlink to the live release; this is nginx's `root` |
| `/var/www/mealsplit/acme/` | Webroot for this site's certificate challenges and renewals |

Deploys are manual, from your Mac, like `make update` for bookmarks. Nothing in GitHub deploys,
and no secrets are stored anywhere.

## One-time setup

You need: SSH access to the VPS through the `kapnizo` alias in `~/.ssh/config`, sudo on the VPS,
and `rsync` on both ends (Debian: `sudo apt-get install rsync`). Only MealSplit's site, certificate,
and `/var/www/mealsplit` directory are added. Existing service configurations stay untouched.

1. **DNS.** At Epik, add an A record: host `mealsplit`, value `45.77.187.37`. A specific record
   wins over the `*` wildcard that points other subdomains at Vercel.

2. **Wait for it.** From your Mac:

   ```sh
   dig +short mealsplit.georgeanagnostou.com A @1.1.1.1
   ```

   Continue when it prints only `45.77.187.37` (it showed the wildcard's Vercel address before).
   This usually takes minutes, up to the old record's TTL.

3. **Directory for releases**, owned by your SSH user so deploys need no sudo:

   ```sh
   ssh kapnizo 'sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 0755 /var/www/mealsplit /var/www/mealsplit/acme'
   ```

4. **Bootstrap nginx site.** Only for first setup, before the certificate exists. From your Mac:

   ```sh
   scp deploy/nginx/mealsplit-http.conf kapnizo:/var/www/mealsplit/bootstrap.conf
   ssh kapnizo 'test ! -e /etc/nginx/sites-available/mealsplit.georgeanagnostou.com &&
     sudo install -m 0644 /var/www/mealsplit/bootstrap.conf /etc/nginx/sites-available/mealsplit.georgeanagnostou.com &&
     rm /var/www/mealsplit/bootstrap.conf &&
     sudo ln -s /etc/nginx/sites-available/mealsplit.georgeanagnostou.com /etc/nginx/sites-enabled/mealsplit.georgeanagnostou.com &&
     sudo nginx -t &&
     sudo systemctl reload nginx'
   ```

5. **TLS.** Certbot's webroot mode issues a separate certificate without editing any nginx
   configuration. The existing Certbot timer handles renewals; this certificate's deploy hook
   validates and gracefully reloads nginx when renewed:

   ```sh
   ssh kapnizo 'sudo certbot certonly --non-interactive --webroot \
     --webroot-path /var/www/mealsplit/acme \
     --cert-name mealsplit.georgeanagnostou.com -d mealsplit.georgeanagnostou.com \
     --deploy-hook "nginx -t && systemctl reload nginx"'
   ```

6. **First deploy and HTTPS site.** Upload the app before enabling the HTTPS site:

   ```sh
   # No .env.deploy yet: omit the live URL until the HTTPS site is installed.
   MEALSPLIT_DEPLOY_HOST=kapnizo make deploy
   scp deploy/nginx/mealsplit.conf kapnizo:/var/www/mealsplit/site.conf
   ssh kapnizo 'sudo cp /etc/nginx/sites-available/mealsplit.georgeanagnostou.com /var/www/mealsplit/site.conf.previous &&
     sudo install -m 0644 /var/www/mealsplit/site.conf /etc/nginx/sites-available/mealsplit.georgeanagnostou.com &&
     rm /var/www/mealsplit/site.conf &&
     sudo nginx -t &&
     sudo systemctl reload nginx'
   cp .env.deploy.example .env.deploy   # host kapnizo, /var/www/mealsplit, the https URL
   ```

   Later deployments use:

   ```sh
   make deploy
   ```

7. **Check it.**

   ```sh
   make verify
   curl -sI https://mealsplit.georgeanagnostou.com/ | grep -iE '^HTTP|cache-control|content-security'
   ```

   Then on the iPhone: open `https://mealsplit.georgeanagnostou.com` in Safari, Share → Add to
   Home Screen, and open it from the icon.

## Routine deploys

```sh
git checkout main && git pull
make deploy        # or: npm run deploy
```

`make deploy`:

1. refuses uncommitted changes (`MEALSPLIT_ALLOW_DIRTY=1` overrides), so every release is a commit;
2. runs `npm ci`, `npm run check` and `npm run build`;
3. uploads `dist/` with rsync to `releases/<UTC time>-<commit>.partial/` on the server; files that
   did not change since the live release are hard-linked, so usually only a few KB cross the
   network;
4. renames it to `releases/<id>/`, points `current` at it with one atomic rename (no half-deployed
   moment), and deletes all but the newest 5 releases (never the live one);
5. checks the live site: `index.html` and `sw.js` are `no-cache`, and the OCR data is raw gzip.

Open copies of the app pick up the new version on their next visit: the service worker
downloads it in the background and offers a Reload button.

Run one deploy at a time.

## Rollback and other commands

```sh
make rollback   # point current at the previous release (instant, no build)
make releases   # list releases on the server, * marks the live one
make verify     # check the live site's headers without deploying
```

Run `make rollback` again to go further back (up to the oldest kept release). To go forward
again, deploy.

## Settings (`.env.deploy`)

`KEY=value` lines, no quotes. Values already set in the environment win over the file.

| Variable | Default | Purpose |
|----------|---------|---------|
| `MEALSPLIT_DEPLOY_HOST` | (required) | SSH target, e.g. the `kapnizo` alias |
| `MEALSPLIT_DEPLOY_USER` | from SSH config | SSH user, if the alias does not set one |
| `MEALSPLIT_DEPLOY_PATH` | `/var/www/mealsplit` | Release directory on the server |
| `MEALSPLIT_URL` | (none: no live check) | Public URL checked after deploy and by `make verify` |
| `MEALSPLIT_KEEP_RELEASES` | `5` | Releases kept for rollback (at least 2) |

## What the nginx site does

- **SPA fallback:** unknown paths serve `index.html`. `/assets/`, `/icons/`, `/ocr/`, `sw.js` and
  the manifest are real files only, so a missing file is a 404, never HTML cached as a script.
- **Caching:** `/assets/` (hashed names) is cached for a year as `immutable`. Everything else,
  including `index.html`, `sw.js`, the manifest and the OCR files, is `no-cache`: revalidated each
  time (a cheap 304). The service worker does the offline caching.
- **OCR files:** `eng.traineddata.gz` is sent as `application/gzip` with no `Content-Encoding`;
  tesseract.js unzips it itself. The OCR cores are JavaScript (their wasm is embedded) and are
  gzip-compressed on the fly. Any `.wasm` file would be served as `application/wasm`.
- **Security headers:** `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
  `Cross-Origin-Opener-Policy`, `Permissions-Policy`, HSTS (no `includeSubDomains`, since other
  subdomains are hosted elsewhere) and a Content-Security-Policy that only allows this origin.
  The CSP allows `'wasm-unsafe-eval'` (the OCR core compiles WebAssembly) and inline styles
  (React style props). Venmo, Messages and mail links are navigations, which CSP does not limit.
  The full e2e suite, OCR scans included, passes in WebKit and Chromium against this config.

If a future change trips the CSP, Safari's Web Inspector console shows "Refused to …"; adjust
the `Content-Security-Policy` line in `deploy/nginx/mealsplit.conf` and reinstall the HTTPS
site using the `scp` and `ssh` commands in step 6. The template includes TLS, so HTTPS is
preserved. Never reinstall the bootstrap site over an existing HTTPS site.

Always run `nginx -t` before a graceful reload. If validation fails, restore MealSplit's
previous site file from `/var/www/mealsplit/site.conf.previous` and validate again; do not
restart nginx or alter another service's site.

## Testing the deploy files

```sh
make test-deploy   # shellcheck + local-mode deploy tests (temp dir, no SSH)
```

`MEALSPLIT_DEPLOY_LOCAL=1` makes `scripts/deploy.sh` deploy into `MEALSPLIT_DEPLOY_PATH` on this
machine instead of over SSH (Linux only: the switch uses GNU `mv -T`, as on the VPS). CI runs
these tests and `nginx -t` on the site config; it never deploys.
