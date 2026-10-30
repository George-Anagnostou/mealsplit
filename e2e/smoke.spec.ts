import { expect, type Page, test } from '@playwright/test';

const cents = (text: string): number => Math.round(Number(text.replace(/[^0-9.-]/g, '')) * 100);

const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name });

/** Tap an item on the Assign tab, then toggle people in the picker. */
async function assign(page: Page, item: string, people: string[]) {
  await page.getByRole('button', { name: new RegExp(item) }).click();
  const picker = page.locator('.picker');
  for (const p of people) await picker.getByRole('button', { name: p }).click();
}

test('receipt → people → assign → split, and state survives a reload', async ({ page }) => {
  await page.goto('/');

  await test.step('parse the example receipt', async () => {
    await page.getByRole('button', { name: 'Example' }).click();
    await expect(page.getByLabel('Item name')).toHaveCount(5);
    await expect(page.locator('.totals')).toContainText('Receipt total');
    await expect(page.locator('.totals')).toContainText('$49.80');
  });

  await test.step('add two friends', async () => {
    await tab(page, 'People').click();
    const form = page.locator('.addfriend');
    for (const [name, venmo] of [
      ['Sam', '@sam'],
      ['Alex', ''],
    ]) {
      await form.getByLabel('Name', { exact: true }).fill(name);
      await form.getByLabel('Venmo').fill(venmo);
      await form.getByRole('button', { name: 'Add friend' }).click();
    }
    await expect(page.locator('.friend')).toHaveCount(2);
  });

  await test.step('assign items, including a shared one', async () => {
    await tab(page, 'Assign').click();
    await assign(page, 'Burrito Bowl', ['Sam']);
    await assign(page, 'Chips & Guacamole', ['Sam', 'Alex', 'George']); // shared three ways
    await assign(page, 'Kids Quesadilla', ['George']);
    await assign(page, 'Fountain Drink', ['Alex']);
    await assign(page, 'Tacos', ['Alex']);
    await expect(page.locator('.banner')).toContainText('Everything is assigned');
  });

  await test.step('split: shares add up and the Venmo link is right', async () => {
    await tab(page, 'Split').click();
    const cards = page.locator('.pcard');
    await expect(cards).toHaveCount(3);

    const totals = await cards.locator('h3 .big').allInnerTexts();
    expect(totals.map(cents).reduce((a, b) => a + b, 0)).toBe(4980);
    await expect(page.locator('.recon')).toContainText('$49.80 ✓');

    // The shared item appears on all three cards as 1/3.
    for (let i = 0; i < 3; i++) await expect(cards.nth(i)).toContainText('(1/3)');

    const sam = cards.filter({ hasText: 'Sam' });
    const href = await sam.getByRole('link', { name: 'Request on Venmo' }).getAttribute('href');
    const url = new URL(href ?? '');
    expect(url.origin + url.pathname).toBe('https://venmo.com/');
    expect(url.searchParams.get('recipients')).toBe('sam');
    expect(url.searchParams.get('txn')).toBe('charge');
    const samTotal = cents((await sam.locator('h3 .big').textContent()) ?? '');
    expect(cents(url.searchParams.get('amount') ?? '')).toBe(samTotal);
  });

  await test.step('reload keeps the state', async () => {
    await page.reload();
    await expect(page.getByLabel('Item name')).toHaveCount(5);
    await expect(page.locator('.totals')).toContainText('$49.80');
    await tab(page, 'People').click();
    await expect(page.locator('.friend')).toHaveCount(2);
    await tab(page, 'Split').click();
    await expect(page.locator('.pcard')).toHaveCount(3);
    await expect(page.locator('.recon')).toContainText('$49.80 ✓');
  });
});

test('typing a price keeps what was typed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Example' }).click();
  const price = page.getByLabel('Price').first();
  await price.fill('');
  await price.pressSequentially('12.');
  await expect(price).toHaveValue('12.');
  await price.pressSequentially('5');
  await expect(price).toHaveValue('12.5');
});

test('the web manifest loads', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(new URL(href ?? '', page.url()).href);
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test('the app shell works offline for a returning visitor', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Reload once so the page is controlled and its hashed JS/CSS are cached at runtime.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Example' }).click();
  await expect(page.getByLabel('Item name')).toHaveCount(5);
});

// Known gap, fixed by the PWA hardening PR: the service worker only caches JS/CSS it sees
// *after* it takes control, so going offline straight after the very first visit leaves a
// blank page. test.fail() flips to a failure once precaching lands, as a reminder to
// turn this into a normal test.
test.fail('the app shell works offline after a single visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Example' })).toBeVisible({ timeout: 3000 });
});

test('the service worker registers (all browsers)', async ({ page }) => {
  await page.goto('/');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);
});
