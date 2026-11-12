# iPhone checklist

A short manual pass for the things automated tests can't prove: they need a real iPhone, Safari, and the Venmo and Messages apps. Run it before relying on a new build, and after any change to links, the service worker, or the manifest.

**You need:** an iPhone with Venmo installed and signed in, an HTTPS URL for the build, and a friend (or a second contact of your own) to test with. Service workers and Add to Home Screen only work over HTTPS, so a plain `http://` address on your Wi‑Fi won't do. Don't tap **Send** on anything unless you mean it. Every check below stops at a pre-filled screen.

**Setup:** open the app in Safari, tap **Example** on the Receipt tab, add a friend on the People tab with a real Venmo username and phone number, assign a few items on the Assign tab, and open the Split tab.

Tick each box as you go. Note the date, iOS version and build at the bottom.

## 1. Add to Home Screen
- [ ] Share button, then **Add to Home Screen**. The name reads "mealsplit" and the icon is the app icon, not a screenshot.
- [ ] Launching from the Home Screen opens full screen, with no Safari address bar.
- [ ] The status bar and safe areas look right (nothing hidden under the notch or the home indicator, and the bottom tab bar is fully tappable).

## 2. Venmo web link opens the app, pre-filled
On the Split tab, tap **Request on Venmo** on a friend's card.
- [ ] Venmo opens (not just a web page asking you to sign in).
- [ ] The recipient is the right person.
- [ ] The amount matches the card exactly.
- [ ] The note is pre-filled with the title and date (for example "Burritos 10/30").
- [ ] It is a *charge*/request, not a payment. Back out without sending.
- [ ] Repeat with a title containing an emoji and an `&` (for example "Tacos 🌮 & beer") and check the note comes through intact.

## 3. venmo:// fallback
Still on the friend's card, tap the small **Venmo app link** under the buttons.
- [ ] The Venmo app opens to a pre-filled request (the same recipient and amount; the note too if Venmo supports it).
- [ ] If it doesn't, note what happened below. This link is only a fallback, but it should not dead-end on an error page.

## 4. Apple Cash text opens Messages with the body
Tap **Text · Apple Cash**.
- [ ] Messages opens a new message to the friend's number.
- [ ] The body is pre-filled: "Hey <first name>, your share of <note> is $X.XX. …" with your Venmo and Zelle details if saved.
- [ ] A phone number saved with spaces or dashes, like `(555) 123-4567`, still works.
- [ ] A friend with no phone saved opens Messages with just the body, so you can pick the person.
- [ ] A friend saved with an email instead of a phone: note whether Messages accepts it as the recipient.
- [ ] From the Messages composer you can open the Apple Cash drawer and send the requested amount (a manual step; nothing is sent automatically).

## 5. Zelle copy
Tap **Copy · Zelle**.
- [ ] A "Zelle text copied" toast shows.
- [ ] Paste into Notes or Messages: it reads "Hey <name>, your share of <note> is $X.XX. Zelle it to <your contact>." (or the generic line if no contact is saved).
- [ ] **Copy message** and **Copy summary for the group** paste correctly too, and the summary shows a discount as "discount -$X.XX".

## 6. Offline after a second visit
- [ ] Open the app on Wi‑Fi, fully close it, and open it again (the second visit).
- [ ] Turn on Airplane Mode.
- [ ] Close the app completely and relaunch it from the Home Screen: it loads, and your bill is still there.
- [ ] You can still edit items and use the Split tab offline. (Scanning a photo needs the OCR files cached first, so expect that to need a connection the first time.)
- [ ] Turn Airplane Mode off and the app keeps working.

## 7. Dark mode
- [ ] Settings → Display & Brightness → Dark: the app switches to its dark theme with no white flashes, and text is readable everywhere (Receipt, People, Assign, Split).
- [ ] The highlighted rows (a low-confidence receipt line, a warning banner, the "owes nothing" box) are readable in both themes.
- [ ] Switch back to Light and check it again.

## 8. Money edge cases (quick sanity)
- [ ] A friend whose share is $0.00 shows "Owes nothing. No request needed.", and there are no Venmo, text or Zelle buttons on that card.
- [ ] Enter a Discount bigger than the items: a warning explains that only the item total is applied, and no share goes negative.
- [ ] After parsing a receipt that has a total, the line at the bottom of the Split tab says "receipt total $X ✓". A receipt with no total says there is nothing to check against.

---

**Tested on:** ______ (date) · iOS ______ · build / commit ______ · notes:
