import { expect, test } from '@playwright/test';
import { addFriend, assign, parseText, tab } from './helpers';

test('unit prices, literal labels, and credits form read-only draft rows', async ({ page }) => {
  await page.goto('/');
  await parseText(page, '2x burger $10.00\n1 fries 3\ntip $3.22\ncredit -2.5\nTri Tip Steak 18');
  const rows = page.locator('.itemrow');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText('2× burger');
  await expect(rows.nth(0)).toContainText('$10.00 each');
  await expect(rows.nth(0)).toContainText('$20.00');
  await expect(rows.nth(3)).toContainText('-$2.50');
  await expect(rows.nth(4)).toContainText('Tri Tip Steak');
  await expect(rows.locator('input, button')).toHaveCount(0);
  await expect(page.getByLabel('Tax', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Tip', { exact: true })).toHaveCount(0);
  await expect(page.locator('.totals')).toContainText('Draft subtotal');
  await expect(page.locator('.totals')).toContainText('$41.72');
});

test('invalid lines are reported and cannot replace a draft or expose stale payment links', async ({
  page,
}) => {
  await page.goto('/');
  await parseText(page, 'burger 10');
  await addFriend(page, 'Sam', 'sam');
  await tab(page, 'Assign').click();
  await assign(page, 'burger', ['Sam']);
  await tab(page, 'Receipt').click();
  await parseText(page, 'burger 10\n\nfries 3.123\n0x soda 2');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Line 3');
  await expect(alert).toContainText('Line 4');
  await expect(page.locator('.totals')).toHaveCount(0);
  await tab(page, 'Split').click();
  await expect(page.getByRole('link', { name: 'Request on Venmo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save to history' })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Request on Venmo' })).toHaveCount(0);
  await tab(page, 'Receipt').click();
  await parseText(page, 'burger 10\nfries 3.12');
  await expect(page.locator('.itemrow')).toHaveCount(2);
  await expect(page.locator('.totals')).toContainText('$13.12');
  await tab(page, 'Assign').click();
  await expect(page.getByRole('group', { name: /burger/ })).toContainText('Not assigned');
});

test('fractional allocation and credits survive reload', async ({ page }) => {
  await page.goto('/');
  await parseText(page, '3x burger 10\ncredit -0.01');
  await addFriend(page, 'Sam');
  await addFriend(page, 'Alex');
  await tab(page, 'Assign').click();
  await assign(page, 'burger', ['Sam', 'Alex']);
  await assign(page, 'credit', ['Sam', 'Alex']);
  await tab(page, 'Split').click();
  await expect(page.locator('.pcard', { hasText: 'Sam' })).toContainText('1.5 units');
  await expect(page.locator('.recon')).toContainText('$29.99');
  await page.reload();
  await expect(page.locator('.recon')).toContainText('$29.99');
  await expect(page.locator('.pcard', { hasText: 'Alex' })).toContainText('1.5 units');
  await tab(page, 'Receipt').click();
  await expect(page.locator('.itemrow').nth(1)).toContainText('-$0.01');
});
