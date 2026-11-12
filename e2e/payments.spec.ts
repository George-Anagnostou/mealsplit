import { expect, test } from '@playwright/test';
import { addFriend, assign, parseText, setMoney, tab } from './helpers';

test('someone who owes $0 gets an "owes nothing" state instead of payment requests', async ({
  page,
}) => {
  await page.goto('/');
  await parseText(page, 'Burger 10.00\nFries 5.00');
  await setMoney(page, 'Discount', '15');
  await addFriend(page, 'Sam', '@sam');

  await tab(page, 'Assign').click();
  await assign(page, 'Burger', ['Sam']);
  await assign(page, 'Fries', ['Sam']);

  await tab(page, 'Split').click();
  const sam = page.locator('.pcard', { hasText: 'Sam' });
  await expect(sam.locator('h3 .big')).toHaveText('$0.00');
  await expect(sam.locator('.owes0')).toContainText('Owes nothing');
  await expect(sam.getByRole('link')).toHaveCount(0);
  await expect(sam.getByRole('button', { name: /Zelle|message/i })).toHaveCount(0);

  // The (me) card never has payment actions either.
  const me = page.locator('.pcard.me');
  await expect(me.getByRole('link')).toHaveCount(0);

  // No receipt total was parsed, so the check line says so instead of faking a tick.
  await expect(page.locator('.recon')).toContainText('no receipt total to check against');
  await expect(page.locator('.recon')).not.toContainText('✓');
});

test('a discount bigger than the items is capped and warned about on both tabs', async ({
  page,
}) => {
  await page.goto('/');
  await parseText(page, 'Burger 10.00\nFries 5.00');
  await setMoney(page, 'Discount', '20');

  const warning = 'Discount $20.00 is more than the items ($15.00), so only $15.00 is applied.';
  await expect(page.locator('.totals')).toContainText(warning);
  await expect(page.locator('.totals .grand')).toContainText('$0.00'); // never negative

  await addFriend(page, 'Sam');
  await tab(page, 'Assign').click();
  await assign(page, 'Burger', ['Sam']);
  await assign(page, 'Fries', ['Sam']);
  await tab(page, 'Split').click();
  await expect(page.locator('.banner.warn')).toContainText(warning);
  await expect(page.locator('.pcard', { hasText: 'Sam' }).locator('h3 .big')).toHaveText('$0.00');
});

test('the Split check compares against the receipt total, and flags a difference', async ({
  page,
}) => {
  await page.goto('/');
  await parseText(page, 'Burger 10.00\nSubtotal 10.00\nTotal 12.00'); // $2 we cannot see
  await addFriend(page, 'Sam', '@sam');
  await tab(page, 'Assign').click();
  await assign(page, 'Burger', ['Sam']);
  await tab(page, 'Split').click();
  const recon = page.locator('.recon');
  await expect(recon).toContainText('receipt total $12.00');
  await expect(recon).toContainText('off by $2.00');
  await expect(recon).toHaveClass(/bad/);
  // Someone who owes money still gets their requests.
  const sam = page.locator('.pcard', { hasText: 'Sam' });
  await expect(sam.getByRole('link', { name: 'Request on Venmo' })).toBeVisible();
  await expect(sam.locator('.owes0')).toHaveCount(0);
});
