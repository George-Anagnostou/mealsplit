# mealsplit: notes and roadmap

## Principles
- Simple and clean over clever. Small modules, clear names, no framework unless it earns its keep.
- Personal first. Phase 1 is a polished tool for one user (George). Nothing in Phase 1 should block a later multi-user version, but nothing gets built for it early either.
- Keep the core logic pure. Split math, parsing, and link building are plain functions with no DOM or storage access, fully unit-tested. The UI and storage sit on top.
- Rules first, model second. The rules-based parser is the default; a cheap model is only a fallback for receipts the rules can't read.
- Never touch money. The app calculates and creates requests. Payment happens in Venmo, Apple Cash, or Zelle.
- Nothing goes to production without George's review and approval.

## Business model (later): simple freemium
- Free: manual entry, pasted receipts, rules-based parsing, splitting, payment links.
- Paid (about $2-3/month or $15/year): photo scanning with the model fallback, meal history synced across devices, saved groups, reminders for unpaid shares.
- Billing would use Stripe Checkout plus the customer portal for subscriptions only. There are no per-transaction fees and the app never handles money between friends.
- Break-even is cheap: the model calls and hosting are the only variable costs.

## Phase 1: polished personal app (now)
Goal: an app George uses for real meals, which is fast, reliable, and pleasant.

1. Architecture cleanup
   - Split the code into `core/` (split, parser, links; pure), `state/` (one store with explicit actions), `storage/` (a small adapter over localStorage, with versioned schema and migrations), and `ui/` (views per step).
   - Use a typed codebase (TypeScript or JSDoc types checked by `tsc`), with a lint and format setup and a single `npm run check`.
   - Bundle third-party code (the OCR library) locally or pin it with a fixed version and subresource-integrity hash. No unpinned CDN scripts. (Done: tesseract.js 7.0.0 and its files are served from the app's own origin; a test fails if a CDN URL appears.)
2. Core flow polish (done: step bar with Back/Next, multi-select, undo, unassigned warnings, edit-tracked amounts, accessibility pass)
   - The steps are receipt, people, assign, split, and request, with a clear progress indicator and back/next.
   - Fast assignment: multi-select, "split among everyone", and undo.
   - Clear reconciliation: a visible check that shares sum to the receipt total, plus unassigned-item warnings.
   - Editable tip ($ or %), tax, fees, discounts, and an "even fees" toggle.
3. Parser quality
   - Grow the fixture set with real receipts (restaurant, DoorDash, Uber Eats, Grubhub, Toast and Square printouts).
   - Give each parsed line a confidence score, and highlight low-confidence lines for review.
4. Payments
   - Confirm the Venmo charge link format on a real iPhone, keep the `venmo://` fallback, and copy-text as a last resort.
   - Apple Cash: a prefilled iMessage via `sms:`. Zelle: copyable text with the amount.
5. Local persistence
   - Friends list, George's own payment details, and recent meals (last 20) kept in localStorage, with export/import as JSON and a "clear all data" button.
6. Quality bar
   - Unit tests for all core logic, a Playwright smoke test of the full flow at a mobile viewport, and checks for accessibility basics (labels, contrast, tap targets).
   - Offline-capable PWA (precached shell, update prompt, OCR cached on first use), installable on iOS, light and dark mode.
7. Optional: model fallback (behind a flag, off by default)
   - A tiny serverless function holds the API key, gated by a passcode or Cloudflare Access, with rate limits.
   - It's a cheap vision model (e.g. Gemini Flash or GPT-4o-mini) that returns the same JSON shape as the rules parser.
   - It's only called when the rules parser's confidence is low, or on request.

Hosting: George will set up a subdomain on his own site later. Until then, it isn't deployed.

## Phase 2: multi-user foundation (later, only if pursued)
- Accounts via email magic link or Sign in with Apple/Google.
- Postgres (Supabase or Neon) with row-level security so every meal, receipt, and friend is scoped to its owner.
- The storage adapter gets a second implementation (remote) behind the same interface, so the UI doesn't change.
- Share links for friends who aren't users: a read-only page showing what they owe, with no login.
- Receipt photos aren't stored by default; if they are, they go in private storage with auto-expiry.
- Privacy policy, terms, account deletion, backups, and error monitoring.

## Phase 3: freemium launch (later)
- Stripe subscriptions, feature flags per plan, and usage limits on model scans.
- A small landing page, plus analytics that respect privacy.
- An App Store wrapper is only worth it if the web app proves itself.

## Open questions
- Subdomain and host (George to set up).
- Whether to add the model fallback in Phase 1 or wait.
