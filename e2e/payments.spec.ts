import { expect, test } from '@playwright/test';
import { addFriend, assign, parseText, tab } from './helpers';

test('zero net share has no payment requests', async ({ page }) => {
  await page.goto('/');
  await parseText(page, 'Burger 10\nFries 5\nDiscount -15');
  await addFriend(page, 'Sam', '@sam');
  await tab(page, 'Assign').click();
  for (const name of ['Burger', 'Fries', 'Discount']) await assign(page, name, ['Sam']);
  await tab(page, 'Split').click();
  const sam = page.locator('.pcard', { hasText: 'Sam' });
  await expect(sam.locator('h2 .big')).toHaveText('$0.00');
  await expect(sam.locator('.owes0')).toContainText('Owes nothing');
  await expect(sam.getByRole('link')).toHaveCount(0);
  await expect(sam.getByRole('button', { name: /Zelle|message/i })).toHaveCount(0);
  await expect(page.locator('.pcard.me').getByRole('link')).toHaveCount(0);
  await expect(page.locator('.recon')).toContainText('not verified');
  await expect(page.locator('.recon')).not.toContainText('✓');
});

test('credits are not capped, and negative net shares never request payment', async ({ page }) => {
  await page.goto('/');
  await parseText(page, 'Burger 10\nDiscount -20');
  await expect(page.locator('.totals')).toContainText('-$10.00');
  await addFriend(page, 'Sam');
  await tab(page, 'Assign').click();
  await assign(page, 'Burger', ['Sam']);
  await assign(page, 'Discount', ['Sam']);
  await tab(page, 'Split').click();
  const sam = page.locator('.pcard', { hasText: 'Sam' });
  await expect(sam.locator('h2 .big')).toHaveText('-$10.00');
  await expect(sam.locator('.owes0')).toContainText('Credit of $10.00');
  await expect(sam.getByRole('link')).toHaveCount(0);
});

test('an unassigned negative row is excluded without claiming assigned shares are smaller', async ({
  page,
}) => {
  await page.goto('/');
  await parseText(page, 'Burger 10\ncredit -2');
  await addFriend(page, 'Sam', '@sam');
  await tab(page, 'Assign').click();
  await assign(page, 'Burger', ['Sam']);
  await tab(page, 'Split').click();
  await expect(page.getByRole('alert')).toContainText('excluded from the assigned shares');
  const sam = page.locator('.pcard', { hasText: 'Sam' });
  await expect(sam.locator('h2 .big')).toHaveText('$10.00');
  await expect(sam.getByRole('link', { name: 'Request on Venmo' })).toBeVisible();
  await expect(page.locator('.recon')).toContainText(
    'Draft subtotal $8.00 (including unassigned rows)',
  );
});
