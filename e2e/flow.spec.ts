import { expect, type Page, test } from '@playwright/test';
import { addFriend, assign, parseText, setMoney, tab } from './helpers';

const ITEMS = 'Burrito Bowl   $12.00\nChips   $6.00\nSoda   $3.00\nTax   $2.10\nTotal   $23.10';

/** A bill with two friends and three items, on the Assign step. */
async function ready(page: Page) {
  await page.goto('/');
  await parseText(page, ITEMS);
  await addFriend(page, 'Sam');
  await addFriend(page, 'Alex');
  await tab(page, 'Assign').click();
}

const row = (page: Page, name: string) => page.getByRole('group', { name: new RegExp(name) });
const toast = (page: Page) => page.locator('.toastwrap');

test('the step bar shows where you are, and Back / Next walk the flow', async ({ page }) => {
  await page.goto('/');
  const steps = page.getByRole('navigation', { name: 'Steps' });
  const current = steps.locator('[aria-current="step"]');
  await expect(current).toHaveText(/Receipt/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Add the receipt');
  await expect(page.getByRole('button', { name: /Back/ })).toHaveCount(0);

  const flow = page.getByRole('navigation', { name: 'Back and next' });
  await flow.getByRole('button', { name: 'Next: People ›' }).click();
  await expect(current).toHaveText(/People/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await flow.getByRole('button', { name: 'Next: Assign ›' }).click();
  await expect(current).toHaveText(/Assign/);
  await flow.getByRole('button', { name: /Back/ }).click();
  await expect(current).toHaveText(/People/);

  // The step bar jumps too, and History sits outside the steps.
  await steps.getByRole('button', { name: 'Split' }).click();
  await expect(current).toHaveText(/Split/);
  await expect(flow.getByRole('button', { name: 'Save to history' })).toBeVisible();
  await tab(page, 'History').click();
  await expect(steps.locator('[aria-current="step"]')).toHaveCount(0);
  await expect(flow).toHaveCount(0);
  await page.getByRole('banner').getByRole('button', { name: /Bill/ }).click();
  await expect(current).toHaveText(/Split/);
});

test('step bar marks finished steps', async ({ page }) => {
  await ready(page);
  const steps = page.getByRole('navigation', { name: 'Steps' });
  await expect(steps.getByRole('button', { name: /Receipt.*done/ })).toBeVisible();
  await expect(steps.getByRole('button', { name: /People.*done/ })).toBeVisible();
  await expect(steps.getByRole('button', { name: /Assign.*done/ })).toHaveCount(0);
});

test('select several items, then tap people once for all of them', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Select several' }).click();
  await row(page, 'Burrito').getByRole('button').first().click();
  await row(page, 'Chips').getByRole('button').first().click();
  const picker = page.locator('.picker');
  await expect(picker).toContainText('2 items · $18.00');
  await picker.getByRole('button', { name: 'Sam' }).click();
  await expect(row(page, 'Burrito')).toContainText('Shared by Sam');
  await expect(row(page, 'Chips')).toContainText('Shared by Sam');
  await expect(row(page, 'Soda')).toContainText('Not assigned');

  // A person only some have shows as mixed, and tapping adds them to the rest.
  await picker.getByRole('button', { name: 'Sam' }).click(); // all had Sam: removed from both
  await row(page, 'Burrito').getByRole('button').first().click(); // unpick Burrito
  await picker.getByRole('button', { name: 'Alex' }).click(); // Chips: Alex
  await row(page, 'Burrito').getByRole('button').first().click(); // pick Burrito again
  await expect(picker.getByRole('button', { name: 'Alex' })).toHaveAttribute(
    'aria-pressed',
    'mixed',
  );
  await picker.getByRole('button', { name: 'Alex' }).click();
  await expect(row(page, 'Burrito')).toContainText('Shared by Alex');
  await expect(row(page, 'Chips')).toContainText('Shared by Alex');

  await page.getByRole('button', { name: 'Pick unassigned' }).click();
  await expect(picker).toContainText('Soda · $3.00');
});

test('split among everyone: one item, the rest, and everything', async ({ page }) => {
  await ready(page);
  await row(page, 'Chips').getByRole('button', { name: 'Split Chips among everyone' }).click();
  await expect(row(page, 'Chips')).toContainText('Shared by George, Sam, Alex');
  await expect(page.locator('.banner')).toContainText('2 items not assigned');

  await page.getByRole('button', { name: 'Split the rest among everyone' }).click();
  await expect(page.locator('.banner')).toContainText('Everything is assigned');
  await expect(toast(page)).toContainText('Split the rest among everyone');

  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('.banner')).toContainText('3 items not assigned');
  await page.getByRole('button', { name: 'Everyone shares everything' }).click();
  await expect(page.locator('.banner')).toContainText('Everything is assigned');
});

test('undo walks assignments back, from the button and from the toast', async ({ page }) => {
  await ready(page);
  const undo = page.getByRole('button', { name: '↶ Undo' });
  await expect(undo).toBeDisabled();
  await assign(page, 'Soda', ['Sam']);
  await expect(row(page, 'Soda')).toContainText('Shared by Sam');
  await undo.click();
  await expect(row(page, 'Soda')).toContainText('Not assigned');
  await expect(undo).toBeDisabled();

  await page.getByRole('button', { name: 'Everyone shares everything' }).click();
  await expect(page.locator('.banner')).toContainText('Everything is assigned');
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.banner')).toContainText('3 items not assigned');
});

test('unassigned items are warned about before and on Split', async ({ page }) => {
  await ready(page);
  await assign(page, 'Burrito', ['Sam']);
  await expect(page.locator('.banner')).toContainText('2 items not assigned');
  const flow = page.getByRole('navigation', { name: 'Back and next' });
  await expect(flow.getByRole('button', { name: 'Split anyway ›' })).toBeVisible();
  await flow.getByRole('button', { name: 'Split anyway ›' }).click();

  const alert = page.getByRole('alert').filter({ hasText: 'still unassigned' });
  await expect(alert).toContainText('2 items');
  await alert.getByRole('button', { name: 'Assign them' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Steps' }).locator('[aria-current]'),
  ).toHaveText(/Assign/);

  await page.getByRole('button', { name: 'Split the rest among everyone' }).click();
  await expect(flow.getByRole('button', { name: 'Next: Split ›' })).toBeVisible();
  await flow.getByRole('button', { name: 'Next: Split ›' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'still unassigned' })).toHaveCount(0);
});

test('parsing again keeps the tax and tip you typed', async ({ page }) => {
  await page.goto('/');
  await parseText(page, ITEMS);
  await expect(page.getByLabel('Tax', { exact: true })).toHaveValue('2.10');

  await setMoney(page, 'Tax', '3.33');
  await page.getByRole('button', { name: 'Tip 20 percent' }).click();
  await expect(page.locator('.tag')).toHaveCount(2);
  await expect(page.locator('.hint.kept')).toContainText('You changed the tax and tip');

  await parseText(page, `Flan   $5.00\n${ITEMS}`);
  await expect(page.getByLabel('Tax', { exact: true })).toHaveValue('3.33');
  await expect(page.getByLabel('Item name')).toHaveCount(4);
  await expect(toast(page)).toContainText('4 items found. Kept your tax');
  await expect(page.getByRole('button', { name: 'Tip 20 percent' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Edits survive a reload, and can be handed back to the parser.
  await page.reload();
  await expect(page.locator('.tag')).toHaveCount(2);
  await page.getByRole('button', { name: 'Let parsing replace them' }).click();
  await expect(page.locator('.tag')).toHaveCount(0);
  await parseText(page, ITEMS);
  await expect(page.getByLabel('Tax', { exact: true })).toHaveValue('2.10');
});

test('re-parsing over assigned items can be undone', async ({ page }) => {
  await ready(page);
  await assign(page, 'Soda', ['Sam']);
  await tab(page, 'Receipt').click();
  await parseText(page, 'Salad   $7.00\nTotal   $7.00');
  await expect(page.getByLabel('Item name')).toHaveCount(1);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Item name')).toHaveCount(3);
  await tab(page, 'Assign').click();
  await expect(row(page, 'Soda')).toContainText('Shared by Sam');
});

test('every control is at least 44px tall', async ({ page }) => {
  await ready(page);
  await assign(page, 'Burrito', ['Sam']);
  for (const step of ['Receipt', 'People', 'Assign', 'Split']) {
    await tab(page, step).click();
    const small = await page
      .locator('button:visible, input:visible:not([type=checkbox]), textarea:visible')
      .evaluateAll((els) =>
        els
          .filter((el) => el.getBoundingClientRect().height < 43.5 && !el.closest('.sr'))
          .map(
            (el) =>
              `${el.tagName} ${el.textContent?.slice(0, 20)} ${el.getBoundingClientRect().height}`,
          ),
      );
    expect(small, `${step}: ${small.join('; ')}`).toEqual([]);
  }
});

test('toasts sit above Back/Next and the picker, never over a heading', async ({ page }) => {
  await ready(page);
  const box = async (sel: string) => {
    const b = await page.locator(sel).first().boundingBox();
    if (!b) throw new Error(`${sel} is not visible`);
    return b;
  };

  await page.getByRole('button', { name: 'Everyone shares everything' }).click();
  await expect(toast(page)).toContainText('Everyone shares everything');
  let t = await box('.toast');
  expect(t.y + t.height).toBeLessThanOrEqual((await box('.flowbar')).y);
  const flow = await box('.flowbar');
  // Close to the bottom bar (within a toast and a gap), nowhere near the headings.
  expect(flow.y - (t.y + t.height)).toBeLessThan(24);

  // With the picker open, the toast moves up above it.
  await page.getByRole('button', { name: 'Clear all' }).click();
  await row(page, 'Soda').getByRole('button').first().click();
  await expect(page.locator('.picker')).toBeVisible();
  await page.getByRole('button', { name: 'Everyone shares everything' }).click();
  await expect(toast(page)).toContainText('Everyone shares everything');
  t = await box('.toast');
  const picker = await box('.picker');
  expect(t.y + t.height).toBeLessThanOrEqual(picker.y);
  expect(picker.y - (t.y + t.height)).toBeLessThan(24);
});
