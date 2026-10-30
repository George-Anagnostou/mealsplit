import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

const RECEIPT = fileURLToPath(new URL('./fixtures/receipt.png', import.meta.url));
const ROTATED = fileURLToPath(new URL('./fixtures/receipt-exif-rotated.jpg', import.meta.url));
const photo = (page: Page) => page.locator('input[type=file][accept="image/*"]');

/** Watch every request the page makes. */
function watchRequests(page: Page) {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  return urls;
}

test('the OCR files are served from the app itself', async ({ request }) => {
  const files: [string, RegExp, number][] = [
    ['/ocr/worker.min.js', /javascript/, 100_000],
    ['/ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js', /javascript/, 3_000_000],
    ['/ocr/core/tesseract-core-simd-lstm.wasm.js', /javascript/, 3_000_000],
    ['/ocr/core/tesseract-core-lstm.wasm.js', /javascript/, 3_000_000],
    ['/ocr/lang/eng.traineddata.gz', /^(application\/(gzip|x-gzip|octet-stream)|)$/, 2_000_000],
    ['/ocr/licenses/tesseract.js.LICENSE.md', /^/, 1000],
    ['/ocr/licenses/tesseract.js-core.LICENSE', /^/, 1000],
  ];
  for (const [path, type, minBytes] of files) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type'], path).toMatch(type);
    expect(res.headers()['content-type'], path).not.toMatch(/html/); // not the SPA fallback
    expect((await res.body()).length, path).toBeGreaterThan(minBytes);
  }
  // Some hosts send .gz files with Content-Encoding: gzip, so the browser hands over the plain
  // data. Others send the gzip bytes as they are. tesseract.js accepts both.
  const res = await request.get('/ocr/lang/eng.traineddata.gz');
  const data = await res.body();
  if (res.headers()['content-encoding'] === 'gzip') expect(data.length).toBeGreaterThan(5_000_000);
  else expect([data[0], data[1]]).toEqual([0x1f, 0x8b]);
});

test('nothing OCR-related loads until a photo is chosen', async ({ page }) => {
  const urls = watchRequests(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(urls.filter((u) => u.includes('/ocr/') || /tesseract/i.test(u))).toEqual([]);
});

test('scanning a photo runs OCR on this device and fills in the receipt', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const urls = watchRequests(page);
  await page.goto('/');
  const started = Date.now();
  await photo(page).setInputFiles(RECEIPT);

  const status = page.locator('.status');
  await expect(status).toContainText(/Preparing|Loading|Reading/);
  await expect(status).toContainText('Done.', { timeout: 100_000 });
  const seconds = (Date.now() - started) / 1000;
  console.log(`[${info.project.name}] real OCR took ${seconds.toFixed(1)}s`);

  // The text and the parsed items come from the photo.
  const text = await page.locator('textarea').inputValue();
  expect(text).toMatch(/Burrito/i);
  expect(text).toContain('11.95');
  expect(text).toContain('2.99');
  await expect(page.getByLabel('Item name')).toHaveCount(3);

  // Every request stayed on this origin, and the files came from /ocr/.
  const origin = new URL(page.url()).origin;
  const external = urls.filter(
    (u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'),
  );
  expect(external).toEqual([]);
  expect(urls.some((u) => u.endsWith('/ocr/worker.min.js'))).toBe(true);
  expect(urls.some((u) => /\/ocr\/core\/tesseract-core-.*lstm\.wasm\.js$/.test(u))).toBe(true);
  expect(urls.some((u) => u.endsWith('/ocr/lang/eng.traineddata.gz'))).toBe(true);
});

test('a photo saved sideways (EXIF orientation) is read upright', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await photo(page).setInputFiles(ROTATED);
  await expect(page.locator('.status')).toContainText('Done.', { timeout: 100_000 });
  const text = await page.locator('textarea').inputValue();
  expect(text).toMatch(/Burrito/i);
  expect(text).toContain('11.95');
  await expect(page.getByLabel('Item name')).toHaveCount(3);
});

test('a scan can be cancelled', async ({ page }) => {
  await page.goto('/');
  await photo(page).setInputFiles(RECEIPT);
  const status = page.locator('.status');
  await expect(status.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await status.getByRole('button', { name: 'Cancel' }).click();

  await expect(status).toContainText('Scan cancelled');
  await expect(status.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expect(page.locator('textarea')).toHaveValue('');
  // Back to normal: the button works again.
  await expect(photo(page)).toBeEnabled();
});

test.describe('when the OCR files cannot load', () => {
  // Without this the app's own service worker answers the request and Playwright never sees it.
  test.use({ serviceWorkers: 'block' });

  test('a failed load says so and leaves paste working', async ({ page }) => {
    // The worker script is requested by the page, so Playwright can block it. (It cannot see the
    // worker's own requests for the core and language data.)
    await page.route('**/ocr/worker.min.js', (route) => route.abort());
    await page.goto('/');
    await photo(page).setInputFiles(RECEIPT);
    await expect(page.locator('.status')).toContainText('Scan failed', { timeout: 60_000 });
    await expect(page.locator('.status')).toContainText('You can still paste the text');
    await expect(photo(page)).toBeEnabled();

    await page.locator('textarea').fill('Soda   $3.00');
    await page.getByRole('button', { name: 'Parse text' }).click();
    await expect(page.getByLabel('Item name')).toHaveCount(1);
  });
});

test('a file that is not an image fails politely', async ({ page }) => {
  await page.goto('/');
  await photo(page).setInputFiles({
    name: 'oops.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.locator('.status')).toContainText('Scan failed');
  await expect(page.locator('.status')).toContainText('Could not read that image');
});
