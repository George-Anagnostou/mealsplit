# Preview and production releases

MealSplit is static files served by the existing VPS nginx. GitHub builds and tests; the VPS
only receives files. There is no additional daemon, container, database, or self-hosted runner.

| Branch | GitHub environment | URL | Directory | SSH user |
|---|---|---|---|---|
| `main` | `production` | https://mealsplit.georgeanagnostou.com | `/var/www/mealsplit` | `mealsplit-deploy` |
| `preview` | `preview` | https://preview.mealsplit.georgeanagnostou.com | `/var/www/mealsplit-preview` | `mealsplit-preview` |

## Everyday workflow

1. Branch from up-to-date `preview`, make changes, commit, and push.
2. Open a PR into `preview`. Once checks pass, merge it. Its push deploys preview automatically.
3. Try the preview URL on your phone.
4. Open a PR **from `preview` into `main`**, review the changes, and merge when ready.
5. The successful `main` push deploys production. Check the Actions deployment result.

```sh
git switch preview
git pull --ff-only
git switch -c feature/my-change
# edit, then:
git add <files>
git commit -m "Describe the change"
git push -u origin HEAD
gh pr create --base preview

# After testing the merged preview:
gh pr create --base main --head preview --title "Release preview to production"
```

Use **merge commits** for promotions, not squash/rebase, and keep both long-lived branches.
After promotion, merge `main` back into `preview` through a PR to synchronize the merge commit.
Urgent fixes on `main` should also be merged back. Branch rules require PRs and passing checks;
no second reviewer is required for this solo project. Merging the release PR is the approval.

A local commit alone does not deploy. Feature branches and PR checks never get deployment
credentials. Preview and production have separate browser storage and service workers.

## Pipeline and rollback

`.github/workflows/ci.yml` requires the Node 20/22 checks, deploy-script/config checks, and
WebKit/Chromium browser tests. The browser-test job uploads the exact `dist/` it tested, tagged
with its commit in `release.json`. The deployment job downloads that artifact without rebuilding.

The upload goes into a `.partial` release; activation is an atomic symlink rename. Unchanged
files are hard-linked to the previous release. Five releases are kept per environment.
CI serializes each branch, never cancels an active deploy, and skips superseded commits.
Routine updates do not modify nginx or restart services.

Production verifies HTTPS response headers, OCR content headers, and the deployed commit.
A failed post-activation check reports a failed deployment; it does **not** automatically
roll back. Inspect Actions and use rollback if needed. Wait for active deployments to finish.

From a clean checkout with administrative `ssh kapnizo` available:

```sh
MEALSPLIT_DEPLOY_HOST=kapnizo \
MEALSPLIT_DEPLOY_PATH=/var/www/mealsplit \
MEALSPLIT_URL=https://mealsplit.georgeanagnostou.com \
sh scripts/deploy.sh rollback
```

For preview, substitute its directory and URL. `list` shows retained releases; `verify`
checks public headers. Revert the problematic commit through a PR as well, so the next deploy
does not reintroduce it. File rollback does not reverse browser-storage migrations: the parser
release changes storage to v3, which older app versions may refuse to load.

Existing open copies of the PWA offer **Reload** when their service worker detects the update.

## GitHub configuration

Each environment allows deployments **only from its matching branch** and has:

| Setting | Kind | Purpose |
|---|---|---|
| `DEPLOY_SSH_KEY` | Secret | Dedicated environment SSH private key |
| `DEPLOY_KNOWN_HOSTS` | Secret | VPS host key verified through administrative SSH |
| `DEPLOY_HOST` | Variable | VPS IP/hostname |
| `DEPLOY_USER` | Variable | Isolated account from the table above |
| `DEPLOY_PATH` | Variable | Environment directory |
| `VERIFY_URL` | Variable | Public HTTPS URL checked after deployment |

The accounts have no sudo, no SSH forwarding, and cannot write the other environment or
nginx configuration. Keys are generated for these accounts, never copied from your personal
SSH key. Rotate by replacing the account's authorized key and its environment secret.

Both branches require `check (20)`, `check (22)`, `deploy-files`, and `e2e` on an up-to-date PR.
Force pushes and branch deletion are disabled. `Deploy` is not a required PR check, since
deployment only happens after merging.

To retry the current branch through checks and deployment:

```sh
gh workflow run ci.yml --ref preview   # or --ref main
```

Re-running an old commit won't roll the site backward: the tip check skips it.

## Finish preview DNS and HTTPS

The production site is already configured. Preview initially uploads files with public
verification disabled until its DNS and certificate exist. The Actions summary explicitly
reports this bootstrap state; it does not mean the preview URL is reachable.

1. In the DNS zone for `georgeanagnostou.com`, add:

   ```text
   Type: A
   Host/name: preview.mealsplit
   Value: 45.77.187.37
   TTL: 300 (or provider default)
   ```

   Remove a conflicting AAAA or CNAME at that exact name if present.

2. Check propagation:

   ```sh
   dig +short preview.mealsplit.georgeanagnostou.com A @1.1.1.1
   ```

3. From an updated checkout of `main` or `preview`, run:

   ```sh
   sh scripts/setup-preview-tls.sh
   ```

   This uses `ssh kapnizo` and GitHub CLI. It issues a separate webroot certificate, validates
   and installs only the preview nginx site, gracefully reloads nginx, verifies HTTPS, and
   sets preview's GitHub `VERIFY_URL`. Existing Certbot renewal handles the certificate.
   It is safe to rerun if certificate issuance fails while DNS is still propagating.

4. Open preview, then rerun `gh workflow run ci.yml --ref preview` to confirm a fully verified
   automatic deployment. Review the parser changes there before merging the release PR.

Production's `VERIFY_URL` is mandatory; its workflow cannot silently skip public verification.
