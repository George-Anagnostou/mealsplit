import { expect, test } from '@playwright/test';
import { assign, cents, tab } from './helpers';

test('receipt → people → assign → split, and state survives a reload', async ({ page }) => {
  await page.goto('/');

  await test.step('parse the example receipt', async () => {
    await page.getByRole('button', { name: 'Example' }).click();
    await expect(page.locator('.itemrow')).toHaveCount(4);
    await expect(page.locator('.totals')).toContainText('Draft subtotal');
    await expect(page.locator('.totals')).toContainText('$34.22');
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
    await assign(page, 'burger', ['Sam', 'Alex']); // 3 burgers / 2 people = 1.5 each
    await expect(page.getByRole('group', { name: /burger/ })).toContainText('1.5 units each');
    await assign(page, 'fries', ['George']);
    await assign(page, 'tip', ['Sam', 'Alex', 'George']);
    await assign(page, 'discount', ['Sam', 'Alex']);
    await expect(page.locator('.banner')).toContainText('Everything is assigned');
  });

  await test.step('split: shares add up and the Venmo link is right', async () => {
    await tab(page, 'Split').click();
    const cards = page.locator('.pcard');
    await expect(cards).toHaveCount(3);

    const totals = await cards.locator('h2 .big').allInnerTexts();
    expect(totals.map(cents).reduce((a, b) => a + b, 0)).toBe(3422);
    await expect(page.locator('.recon')).toContainText('Draft subtotal $34.22');
    await expect(page.locator('.recon')).not.toContainText('✓');

    // Every row, including tip and the negative credit, is split by its chosen people.
    for (let i = 0; i < 3; i++) await expect(cards.nth(i)).toContainText('(1/3 of row');

    const sam = cards.filter({ hasText: 'Sam' });
    await expect(sam).toContainText('1.5 units');
    await expect(sam).toContainText('-$1.00');
    const href = await sam.getByRole('link', { name: 'Request on Venmo' }).getAttribute('href');
    const url = new URL(href ?? '');
    expect(url.origin + url.pathname).toBe('https://venmo.com/');
    expect(url.searchParams.get('recipients')).toBe('sam');
    expect(url.searchParams.get('txn')).toBe('charge');
    const samTotal = cents((await sam.locator('h2 .big').textContent()) ?? '');
    expect(cents(url.searchParams.get('amount') ?? '')).toBe(samTotal);
  });

  await test.step('reload keeps the state', async () => {
    await page.reload();
    await expect(page.locator('.itemrow')).toHaveCount(4);
    await tab(page, 'People').click();
    await expect(page.locator('.friend')).toHaveCount(2);
    await tab(page, 'Split').click();
    await expect(page.locator('.pcard')).toHaveCount(3);
    await expect(page.locator('.recon')).toContainText('$34.22');
  });
});

test('source text is the only item editor and preserves unfinished input', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Example' }).click();
  await expect(page.locator('.itemrow input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add item|Remove item/ })).toHaveCount(0);
  const text = page.getByLabel('Receipt text');
  await text.fill('burger 12.');
  await expect(text).toHaveValue('burger 12.');
  await text.pressSequentially('5');
  await expect(text).toHaveValue('burger 12.5');
  await page.getByRole('button', { name: 'Parse text' }).click();
  await expect(page.locator('.itemrow')).toContainText('$12.50');
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
  // Reload once so the page is controlled by the worker, as it is on any later visit.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Example' }).click();
  await expect(page.locator('.itemrow')).toHaveCount(4);
});

// The service worker precaches the whole shell when it installs, so one visit is enough.
test('the app shell works offline after a single visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Example' }).click();
  await expect(page.locator('.itemrow')).toHaveCount(4);
});

test('the service worker registers (all browsers)', async ({ page }) => {
  await page.goto('/');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);
});
