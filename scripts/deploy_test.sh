#!/bin/sh
# Tests for scripts/deploy.sh in local mode (MEALSPLIT_DEPLOY_LOCAL=1): the same upload,
# atomic switch, pruning and rollback steps as a real deploy, into a temp directory, no SSH.
# Run with: npm run test:deploy
set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
DEPLOY="$ROOT_DIR/scripts/deploy.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ENV_FILE="$WORK/env.deploy"
: >"$ENV_FILE"
export MEALSPLIT_ENV_FILE="$ENV_FILE" # never read a real .env.deploy
export MEALSPLIT_DEPLOY_LOCAL=1
export MEALSPLIT_DEPLOY_PATH="$WORK/srv/mealsplit"
export MEALSPLIT_SKIP_BUILD=1
export MEALSPLIT_ALLOW_DIRTY=1
export MEALSPLIT_KEEP_RELEASES=5
unset MEALSPLIT_URL MEALSPLIT_DEPLOY_HOST MEALSPLIT_DEPLOY_USER

failures=0
pass() { echo "ok - $1"; }
fail() {
	echo "FAIL - $1" >&2
	failures=$((failures + 1))
}
check() { # check "name" command...
	name="$1"
	shift
	if "$@"; then pass "$name"; else fail "$name"; fi
}

# A fake build whose index.html says which version it is, plus one big unchanged file.
make_build() {
	dist="$WORK/dist-$1"
	mkdir -p "$dist/ocr/lang" "$dist/assets"
	echo "<!doctype html><title>v$1</title>" >"$dist/index.html"
	echo "// sw v$1" >"$dist/sw.js"
	echo "console.log($1)" >"$dist/assets/index-v$1.js"
	head -c 100000 /dev/zero >"$dist/ocr/lang/eng.traineddata.gz"
	echo "$dist"
}

deploy_version() {
	MEALSPLIT_DIST_DIR="$(make_build "$1")" "$DEPLOY" >"$WORK/out.log" 2>&1 || {
		cat "$WORK/out.log" >&2
		return 1
	}
	sleep 1 # release ids have one-second resolution
}

serving() { grep -q "<title>v$1</title>" "$MEALSPLIT_DEPLOY_PATH/current/index.html"; }
release_count() { find "$MEALSPLIT_DEPLOY_PATH/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' '; }

# 1. The deploy path must exist (the one-time setup creates it).
if MEALSPLIT_DIST_DIR="$(make_build 0)" "$DEPLOY" >"$WORK/out.log" 2>&1; then
	fail "refuses a missing deploy path"
else
	check "refuses a missing deploy path" grep -q "must exist" "$WORK/out.log"
fi
mkdir -p "$MEALSPLIT_DEPLOY_PATH"

# 2. First deploy.
deploy_version 1
check "first deploy is served" serving 1
relative_link() { case "$(readlink "$MEALSPLIT_DEPLOY_PATH/current")" in releases/*) ;; *) return 1 ;; esac; }
no_partials() { ! ls -d "$MEALSPLIT_DEPLOY_PATH"/releases/*.partial >/dev/null 2>&1; }
readable() { [ "$(stat -c %a "$MEALSPLIT_DEPLOY_PATH/current/index.html")" = 644 ]; }
check "current is a relative symlink into releases/" relative_link
check "no .partial directory is left behind" no_partials
check "files are world-readable for nginx" readable

# 3. More deploys: newest is served, only 5 releases are kept, unchanged files are hard links.
for v in 2 3 4 5 6 7; do deploy_version "$v"; done
check "latest deploy is served" serving 7
check "keeps the last 5 releases" [ "$(release_count)" = 5 ]
check "old assets are not mixed into new releases" [ ! -e "$MEALSPLIT_DEPLOY_PATH/current/assets/index-v6.js" ]
inodes="$(for d in "$MEALSPLIT_DEPLOY_PATH"/releases/*/; do stat -c %i "$d/ocr/lang/eng.traineddata.gz"; done | sort -u | wc -l | tr -d ' ')"
check "unchanged files are hard-linked between releases" [ "$inodes" = 1 ]

# 4. Rollback goes one release back each time, and list marks the live one.
"$DEPLOY" rollback >"$WORK/out.log" 2>&1
check "rollback serves the previous release" serving 6
"$DEPLOY" rollback >"$WORK/out.log" 2>&1
check "a second rollback goes back again" serving 5
"$DEPLOY" list >"$WORK/list.log" 2>&1
check "list shows 5 releases" [ "$(wc -l <"$WORK/list.log" | tr -d ' ')" = 5 ]
check "list marks the live release" [ "$(grep -c '^\* ' "$WORK/list.log")" = 1 ]

# 5. Deploying after a rollback serves the new build and still keeps 5.
deploy_version 8
check "deploy after rollback is served" serving 8
check "still keeps 5 releases" [ "$(release_count)" = 5 ]

# 6. A broken build is refused before anything changes.
broken="$WORK/dist-broken"
mkdir -p "$broken"
echo "<title>broken</title>" >"$broken/index.html"
if MEALSPLIT_DIST_DIR="$broken" "$DEPLOY" >"$WORK/out.log" 2>&1; then
	fail "refuses a build without sw.js"
else
	pass "refuses a build without sw.js"
fi
check "live site unchanged after a refused deploy" serving 8

# 7. Rollback stops at the oldest release.
for _ in 1 2 3 4 5; do "$DEPLOY" rollback >"$WORK/out.log" 2>&1 || break; done
check "rollback refuses to go past the oldest release" grep -q "no release older" "$WORK/out.log"

# 8. .env.deploy: values are read, the environment wins, other keys are rejected.
printf '# comment\nMEALSPLIT_KEEP_RELEASES=1\n' >"$ENV_FILE"
if env -u MEALSPLIT_KEEP_RELEASES "$DEPLOY" list >"$WORK/out.log" 2>&1; then
	fail ".env.deploy values are read"
else
	check ".env.deploy values are read" grep -q "at least 2" "$WORK/out.log"
fi
overrides() { "$DEPLOY" list >/dev/null 2>&1; }
check "the environment overrides .env.deploy" overrides
printf 'PATH=/tmp\n' >"$ENV_FILE"
if "$DEPLOY" list >"$WORK/out.log" 2>&1; then
	fail ".env.deploy only accepts MEALSPLIT_ keys"
else
	pass ".env.deploy only accepts MEALSPLIT_ keys"
fi
: >"$ENV_FILE"

# 9. A remote deploy needs a host, and paths are checked.
if MEALSPLIT_DEPLOY_LOCAL='' "$DEPLOY" list >"$WORK/out.log" 2>&1; then
	fail "remote mode requires MEALSPLIT_DEPLOY_HOST"
else
	check "remote mode requires MEALSPLIT_DEPLOY_HOST" grep -q "MEALSPLIT_DEPLOY_HOST" "$WORK/out.log"
fi
if MEALSPLIT_DEPLOY_PATH='/var/www/meal split' "$DEPLOY" list >"$WORK/out.log" 2>&1; then
	fail "rejects unsafe deploy paths"
else
	pass "rejects unsafe deploy paths"
fi

if [ "$failures" -gt 0 ]; then
	echo "$failures deploy test(s) failed" >&2
	exit 1
fi
echo "all deploy tests passed"
