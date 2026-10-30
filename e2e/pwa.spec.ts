import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const RECEIPT = fileURLToPath(new URL('./fixtures/receipt.png', import.meta.url));

// Polled across a reload, so a navigation mid-call counts as "not yet" rather than an error.
const cacheNames = (page: Page) => page.evaluate(() => caches.keys()).catch(() => [] as string[]);
const controlled = (page: Page) => page.evaluate(() => !!navigator.serviceWorker.controller);

/** Wait for the worker to install and take control of the page. */
async function waitForControl(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => controlled(page)).toBe(true);
}

test.describe('installability (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'uses Chrome DevTools Protocol');

  test('the manifest is valid and Chromium finds nothing blocking install', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await waitForControl(page);

    const cdp = await context.newCDPSession(page);
    const { url, errors, data } = await cdp.send('Page.getAppManifest');
    expect(url).toMatch(/\/manifest\.webmanifest$/);
    expect(errors.map((e) => e.message)).toEqual([]);
    const manifest = JSON.parse(data ?? '{}');
    expect(manifest.display).toBe('standalone');

    // "Add to Home Screen" is offered when this list is empty.
    await expect
      .poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors)
      .toEqual([]);
  });

  test('the manifest has what installs need: id, scope, start_url and separate icon purposes', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifestUrl = new URL(href ?? '', page.url());
    const m = await (await request.get(manifestUrl.href)).json();

    expect(m.id).toBe('./');
    expect(m.display).toBe('standalone');
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);

    // start_url sits inside scope, and the worker's scope covers both.
    const scope = new URL(m.scope, manifestUrl);
    const start = new URL(m.start_url, manifestUrl);
    expect(start.href.startsWith(scope.href)).toBe(true);
    const swScope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(swScope).toBe(scope.href);
    expect(start.href.startsWith(swScope)).toBe(true);

    // Each icon exists, is the PNG size it claims, and "maskable" is not shared with "any".
    for (const icon of m.icons) {
      const res = await request.get(new URL(icon.src, manifestUrl).href);
      expect(res.status(), icon.src).toBe(200);
      const png = await res.body();
      const [w, h] = icon.sizes.split('x').map(Number);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], icon.src).toEqual([w, h]);
    }
    const purposes = (m.icons as { sizes: string; purpose?: string }[]).map(
      (i) => `${i.sizes}:${i.purpose ?? 'any'}`,
    );
    expect(purposes).toEqual(
      expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']),
    );
    expect(purposes.some((p) => p.includes('any maskable'))).toBe(false);
  });
});

test('the page declares its iOS home-screen icon, titles and light/dark theme colours', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const meta = (name: string) => page.locator(`meta[name="${name}"]`);
  await expect(meta('apple-mobile-web-app-capable')).toHaveAttribute('content', 'yes');
  await expect(meta('apple-mobile-web-app-title')).toHaveAttribute('content', 'mealsplit');
  await expect(meta('apple-mobile-web-app-status-bar-style')).toHaveAttribute('content', 'default');

  const themes = await page
    .locator('meta[name="theme-color"]')
    .evaluateAll((els) => els.map((e) => [e.getAttribute('media'), e.getAttribute('content')]));
  expect(themes).toEqual([
    ['(prefers-color-scheme: light)', '#f4f5f7'],
    ['(prefers-color-scheme: dark)', '#0f1115'],
  ]);

  const icon = page.locator('link[rel="apple-touch-icon"]');
  const res = await request.get(new URL((await icon.getAttribute('href')) ?? '', page.url()).href);
  expect(res.status()).toBe(200);
  const png = await res.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
});

test('the service worker lists the whole build, and none of the OCR files', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await waitForControl(page);
  const worker = await (await request.get('/sw.js')).text();
  expect(worker).not.toContain('__');
  const list = JSON.parse(/const PRECACHE = (\[.*\]);/.exec(worker)?.[1] ?? '[]') as string[];
  expect(list).toContain('index.html');
  expect(list.some((u) => /^assets\/.+\.js$/.test(u))).toBe(true);
  expect(list.some((u) => /^assets\/.+\.css$/.test(u))).toBe(true);
  expect(list).toContain('manifest.webmanifest');
  expect(list.some((u) => u.startsWith('ocr/'))).toBe(false);

  // What the worker cached is exactly that list.
  const cached = await page.evaluate(async () => {
    const name = (await caches.keys()).find((k) => k.startsWith('mealsplit-shell-')) ?? '';
    const cache = await caches.open(name);
    return (await cache.keys()).map((r) => new URL(r.url).pathname.replace(/^\//, ''));
  });
  expect(cached.sort()).toEqual([...list].sort());
});

test('a scan works offline once the OCR files have been fetched', async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await waitForControl(page);

  // Online: the first scan downloads the OCR files and the worker keeps them.
  await page.locator('input[type=file][accept="image/*"]').setInputFiles(RECEIPT);
  await expect(page.locator('.status')).toContainText('Done.', { timeout: 100_000 });
  expect((await cacheNames(page)).some((k) => k.startsWith('mealsplit-ocr-'))).toBe(true);

  // Offline: reload the app and scan again.
  await context.setOffline(true);
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Example' })).toBeVisible();
  await page.locator('input[type=file][accept="image/*"]').setInputFiles(RECEIPT);
  await expect(page.locator('.status')).toContainText('Done.', { timeout: 100_000 });
  expect(await page.locator('textarea').inputValue()).toMatch(/Burrito/i);
  await expect(page.getByLabel('Item name')).toHaveCount(3);
  expect(failed).toEqual([]);
});

// A second build is simulated by serving dist/ from a tiny local server whose sw.js can be
// switched to a different version, as a deploy would. (Playwright cannot rewrite the worker
// script's own requests, and the real preview server has only one build.)
test.describe('updates', () => {
  const TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
  };
  const NEXT = 'next-build';
  let server: Server;
  let origin = '';
  let shipped = false;

  test.beforeEach(async () => {
    shipped = false;
    server = createServer((req, res) => {
      const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
      const file = normalize(join(DIST, path === '/' ? 'index.html' : path));
      try {
        if (!file.startsWith(DIST)) throw new Error('outside dist');
        let body: string | Buffer = readFileSync(file);
        if (path === '/sw.js' && shipped) {
          body = body.toString().replace(/const VERSION = '[^']+'/, `const VERSION = '${NEXT}'`);
        }
        res.writeHead(200, {
          'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
          'cache-control': 'no-cache',
        });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const addr = server.address();
    origin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
  });
  test.afterEach(async () => {
    server.closeAllConnections(); // the browser keeps connections alive; don't wait for them
    await new Promise((ok) => server.close(ok));
  });

  const checkForUpdate = (page: Page) =>
    page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      await reg.update();
    });
  const banner = (page: Page) => page.getByText('Update available');

  test('a new build is fetched in the background and offered with a Reload button', async ({
    page,
  }) => {
    await page.goto(origin);
    await waitForControl(page);
    // The first visit is quiet: no prompt, no surprise reload.
    await expect(banner(page)).toHaveCount(0);
    const [first] = await cacheNames(page);
    expect(first).toMatch(/^mealsplit-shell-/);

    await page.getByRole('button', { name: 'Example' }).click();
    await expect(page.getByLabel('Item name')).toHaveCount(5);

    shipped = true;
    await checkForUpdate(page);
    await expect(banner(page)).toBeVisible();
    await expect(page.getByText('Your bill is saved')).toBeVisible();
    // Installed beside the old one, not replacing it: the open page keeps working as it was.
    await expect.poll(() => cacheNames(page)).toContain(`mealsplit-shell-${NEXT}`);
    expect(await cacheNames(page)).toContain(first);
    await expect(page.getByLabel('Item name')).toHaveCount(5);

    // Reload: the new worker takes over, the page reloads once, the old cache is cleaned up
    // and the bill is still there.
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect.poll(() => cacheNames(page)).toEqual([`mealsplit-shell-${NEXT}`]);
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Example' })).toBeVisible();
    await expect(page.getByLabel('Item name')).toHaveCount(5);
    expect(await controlled(page)).toBe(true);
  });

  test('"Later" hides the prompt and the update waits for the next visit', async ({ page }) => {
    await page.goto(origin);
    await waitForControl(page);
    shipped = true;
    await checkForUpdate(page);
    await expect(banner(page)).toBeVisible();

    await page.getByRole('button', { name: 'Later' }).click();
    await expect(banner(page)).toHaveCount(0);
    // Nothing was swapped under the person.
    expect(await cacheNames(page)).toHaveLength(2);

    // Closing every tab lets the waiting worker take over; here a navigation does not, so the
    // prompt stays away and the old build keeps serving.
    await checkForUpdate(page);
    await expect(banner(page)).toHaveCount(0);
  });
});
