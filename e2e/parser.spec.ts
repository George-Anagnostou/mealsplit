import { expect, test } from '@playwright/test';

test('parser: numeric names stay intact and doubtful lines are highlighted until edited', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('textarea')
    .fill('7 Up 2.50\n2 Tacos 8.00\nDelivery Pizza 18.00\n9 Lives Stout 3.00');
  await page.getByRole('button', { name: 'Parse text' }).click();

  const names = page.getByLabel('Item name');
  await expect(names).toHaveCount(4);
  const expected = ['7 Up', '2× Tacos', 'Delivery Pizza', '9 Lives Stout'];
  for (const [i, name] of expected.entries()) await expect(names.nth(i)).toHaveValue(name);
  // Only the genuinely ambiguous line is highlighted.
  const rows = page.locator('.itemrow');
  await expect(page.locator('.itemrow.lowconf')).toHaveCount(1);
  await expect(rows.nth(3)).toHaveClass(/lowconf/);

  // Editing the row clears the highlight.
  await names.nth(3).fill('9 Lives Stout Beer');
  await expect(page.locator('.itemrow.lowconf')).toHaveCount(0);
});
