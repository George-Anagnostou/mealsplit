# Try it on your iPhone (no hosting)

mealsplit is not deployed anywhere. To try a build on a phone you serve it from your own computer and open it over your home Wi‑Fi. Nothing here needs an account, a secret, or a server.

You need a Mac (or any computer) with Node 20 or newer, and your iPhone on the same Wi‑Fi.

## Step 1: build and serve (plain http, about two minutes)

```sh
git fetch origin
git checkout phase1/pwa        # or main, once the pull requests are merged
npm ci
npm run build
npm run preview -- --host      # prints a "Network:" address
```

Find your Mac's Wi‑Fi address if the "Network:" line is not obvious: `ipconfig getifaddr en0` (try `en1` if it prints nothing). On the iPhone, open Safari and go to `http://<that address>:4173`.

**What works over plain `http://` on your LAN:** the whole app, with everything saved on the phone: receipt parsing, people, assigning, the split, Venmo and Messages links, history, export, scanning a photo, dark mode.

**What does not:** Safari only allows a service worker, and so offline mode and Add to Home Screen as a real standalone app, on `https://` (or `localhost`). A LAN address like `http://192.168.1.20:4173` is neither, so you can use the app but cannot test offline or install it. That is a browser rule, not an app bug.

## Step 2: HTTPS on your LAN (to test offline and Add to Home Screen)

The simplest way with no hosting and no secrets is a certificate you make yourself with [mkcert](https://github.com/FiloSottile/mkcert), which your iPhone has to be told to trust. A bare self-signed certificate is not enough: Safari will not run a service worker on a page whose certificate it does not trust.

On the Mac:

```sh
brew install mkcert
mkcert -install                                   # trusts the mkcert CA on the Mac
mkdir -p ~/.mealsplit-certs && cd ~/.mealsplit-certs
mkcert -key-file key.pem -cert-file cert.pem <mac-LAN-IP> localhost
mkcert -CAROOT                                    # prints the folder holding rootCA.pem
```

Then, from the repo folder:

```sh
PREVIEW_CERT=$HOME/.mealsplit-certs/cert.pem PREVIEW_KEY=$HOME/.mealsplit-certs/key.pem \
  npm run preview -- --host
```

`PREVIEW_CERT` and `PREVIEW_KEY` are only file paths read by `vite.config.ts` for `preview`. Leave them out and preview is plain http, as before. The key stays in your home folder, never in the repo (`*.pem` is also git-ignored).

Teach the iPhone to trust the mkcert CA, once:

1. AirDrop (or email yourself) `rootCA.pem` from the folder `mkcert -CAROOT` printed.
2. On the iPhone, tap the file, then **Settings → General → VPN & Device Management** and install the profile.
3. **Settings → General → About → Certificate Trust Settings**: switch on full trust for the mkcert root.

Open `https://<mac-LAN-IP>:4173` in Safari. The padlock should be clean, and now the service worker registers. Then:

- Wait a few seconds and reload once. Switch on Airplane Mode and reload: the app still loads (that is the offline check).
- **Share → Add to Home Screen.** Launch it from the Home Screen: it opens full screen with no Safari bar.
- Work through [`docs/IPHONE_CHECKLIST.md`](IPHONE_CHECKLIST.md).

When you are done, remove the profile (**Settings → General → VPN & Device Management**) so the phone no longer trusts a CA whose key lives on your Mac.

## Seeing an update

Rebuild (`npm run build`) while the preview is running and reload the app a couple of times: a small "Update available" bar appears with **Reload** and **Later**. Tapping **Reload** swaps in the new version and keeps your bill.
