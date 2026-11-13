# Deploy targets. Everything else is in package.json (npm run check, npm run test:e2e, ...).
# Settings come from .env.deploy; see .env.deploy.example and docs/DEPLOY.md.

.PHONY: deploy rollback releases verify script-check test-deploy

# Install, check, build, upload a new release, switch to it, verify the live site.
deploy:
	./scripts/deploy.sh deploy

# Switch back to the previous release (instant: no build, no upload).
rollback:
	./scripts/deploy.sh rollback

# List the releases on the server; * marks the live one.
releases:
	./scripts/deploy.sh list

# Check the live site's headers without deploying.
verify:
	./scripts/deploy.sh verify

script-check:
	@for script in scripts/*.sh; do sh -n "$$script" || exit; done
	@if command -v shellcheck >/dev/null; then shellcheck scripts/*.sh; else echo "shellcheck not installed; skipping lint"; fi

# Deploy script tests: a local, no-SSH run of deploy, prune and rollback in a temp directory.
test-deploy: script-check
	sh scripts/deploy_test.sh
