import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { addFriend, assign, parseText, tab } from './helpers';

// Automated checks catch roughly a third of accessibility problems (contrast, names, roles,
// landmarks). The rest is in docs/IPHONE_CHECKLIST.md.
for (const scheme of ['light', 'dark'] as const) {
  test(`no axe violations on any step (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const scan = async (where: string) => {
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .analyze();
      const summary = violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      );
      expect(summary, `${where} (${scheme})`).toEqual([]);
    };

    await scan('empty receipt');
    await parseText(
      page,
      'Burrito Bowl   $12.00\nChips   $6.00\nSoda   $3.00\nTax   $2.10\nTotal   $23.10',
    );
    await scan('receipt with items');
    await addFriend(page, 'Sam', '@sam');
    await addFriend(page, 'Alex');
    await scan('people');
    await tab(page, 'Assign').click();
    await scan('assign, nothing picked');
    await page.getByRole('button', { name: 'Select several' }).click();
    await assign(page, 'Burrito', ['Sam']);
    await page.getByRole('group', { name: /Chips/ }).getByRole('button').first().click();
    await scan('assign, picker open');
    await tab(page, 'Split').click();
    await scan('split with an unassigned warning');
    await tab(page, 'Assign').click();
    await page.getByRole('button', { name: 'Everyone shares everything' }).click();
    await tab(page, 'Split').click();
    await scan('split');
    await page.getByRole('button', { name: 'Save to history' }).click();
    await tab(page, 'History').click();
    await scan('history');
  });
}
