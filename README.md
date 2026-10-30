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

## Run
```sh
python3 -m http.server 8080   # or: npx serve
# open http://localhost:8080  (on iPhone: Share → Add to Home Screen)
```
It is plain HTML/CSS/ES modules: no build step. Any static host works.

## Test
```sh
npm test    # node's built-in test runner, no dependencies
```
Covers the split math (proportional tax/tip, shared items, penny reconciliation, edge cases), the receipt parser on four realistic sample receipts (`test/receipts/`), and the link/message builders.

## Layout
```
index.html  manifest.webmanifest  sw.js
css/styles.css
js/split.js    split math (integer cents)
js/parser.js   receipt text → items + totals
js/links.js    Venmo / sms: links and message text
js/app.js      UI
icons/         home-screen icons
test/          node tests + sample receipts
```

## Limits
- OCR accuracy depends on the photo; always check items and totals (the app shows whether your total matches the receipt's).
- Apple Cash and Zelle can't be pre-filled as requests. The app gives you ready-to-send text instead.
- Venmo's link format is unofficial/historical; if it stops prefilling, use the app-link fallback or the copied message.
