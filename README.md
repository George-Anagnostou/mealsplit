# mealsplit

A tiny static web app for splitting a food bill with friends and requesting payment. No backend, no accounts. Everything (friends, current bill) stays in your browser's localStorage.

![mealsplit on a phone](screenshot.png)

## What it does

1. **Receipt**: paste receipt text, or scan/upload a photo (OCR runs in the browser via [tesseract.js](https://github.com/naptha/tesseract.js), loaded from a CDN on demand). It parses items, subtotal, tax, tip, fees and discounts. Every item is editable; tip can be `$` or `%` of the subtotal.
2. **People**: save friends (name, Venmo username, phone/email for Zelle/Apple Cash). You ("me") are never charged.
3. **Assign**: tap an item, then tap who had it. Shared items split evenly.
4. **Split**: per-person breakdown plus:
   - **Request on Venmo**: `https://venmo.com/?txn=charge&audience=private&recipients=USER&amount=X.XX&note=…` (and a `venmo://paycharge` app link as fallback)
   - **Text · Apple Cash**: opens Messages with a prefilled `sms:` message
   - **Copy · Zelle** / **Copy message**: clipboard text (Zelle has no request deep links)
   - **Copy summary for the group**

Tax, tip and discounts are allocated in proportion to each person's item subtotal; fees can instead be split evenly. Cents are allocated with the largest-remainder method, so the shares always add up to exactly the receipt total.

## Develop

Vite + React + TypeScript (strict). Needs Node 20 or newer.

```sh
npm ci            # install the exact locked versions
npm run dev       # dev server at http://localhost:5173
npm run check     # typecheck + lint (Biome) + unit tests with a coverage floor (Vitest); run before pushing
npm run build     # production build into dist/ (any static host works)
npm run preview   # serve dist/ locally, including the service worker
```

On iPhone: open the served page, then Share → Add to Home Screen. The service worker only registers in production builds (`build` + `preview`), so dev reloads are never cached.

Other scripts: `npm run test:e2e` (see below), `npm test`, `npm run test:coverage`, `npm run test:watch`, `npm run typecheck`, `npm run lint`, `npm run format` (Biome auto-fix).

CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests, a build and the e2e smoke test on every pull request (and on pushes to `main`). It has read-only permissions, no secrets, and never deploys.

## Test

Vitest covers the pure core: the split math (proportional tax/tip, shared items, penny reconciliation, edge cases), the receipt parser on seven sample receipts (`src/core/__fixtures__/receipts/`, including an `edge-cases.txt` of known probes), the link/message builders, and money formatting. Tests sit next to the code as `*.test.ts`. `npm run test:coverage` enforces thresholds on `src/core` (see `vite.config.ts`).

The parser gives every item a `confidence` (0 to 1) and typed `reasons`. Items below `LOW_CONFIDENCE` get a subtle highlight in the item list until you edit them. The rules for what counts as a fee, a discount, or an item are documented at the top of `src/core/parser.ts`.

### End-to-end smoke test

Playwright drives a production build (`vite preview`, port 4173, started automatically) on an iPhone 14 profile in **WebKit**, plus a Pixel 7 profile in Chromium. It walks Example receipt → friends → assign (with a shared item) → Split (shares add up, Venmo link recipient/amount), checks that a reload keeps state, that the manifest loads, and that the service worker registers and the shell loads offline.

```sh
npx playwright install --with-deps webkit chromium   # once; --with-deps needs sudo on Linux
npm run test:e2e
npm run test:e2e -- --project=iphone-webkit          # one browser
npx playwright show-report                           # after a failure
```

## Layout

```
index.html                  Vite entry
public/                     manifest, service worker, home-screen icons (copied as-is)
src/core/                   pure logic, no DOM or storage; fully unit-tested
  money.ts                  integer-cent helpers
  split.ts                  split math (largest-remainder allocation)
  parser.ts                 receipt text → items + totals
  links.ts                  Venmo / sms: links and message text
src/state/                  app state: types, reducer, selectors, localStorage, context
src/ocr/                    photo → text (tesseract.js, loaded on demand)
src/ui/                     React components: one view per tab, plus small shared pieces
src/main.tsx  src/styles.css
e2e/                        Playwright smoke test (playwright.config.ts at the root)
```

## Limits

- OCR accuracy depends on the photo; always check items and totals (the app shows whether your total matches the receipt's).
- Apple Cash and Zelle can't be pre-filled as requests. The app gives you ready-to-send text instead.
- Venmo's link format is unofficial/historical; if it stops prefilling, use the app-link fallback or the copied message.
