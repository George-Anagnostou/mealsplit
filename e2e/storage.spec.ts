import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { addFriend, assign, parseText, tab } from './helpers';

// What the app saved before there was a version: one object under "mealsplit.v1".
const V1 = {
  me: { name: 'George', venmo: 'george-a', contact: '555-010-0100' },
  people: [
    { id: 'sam1', name: 'Sam', venmo: 'sam-w', contact: '' },
    { id: 'alex2', name: 'Alex', venmo: '', contact: 'alex@example.com' },
  ],
  bill: {
    title: 'Burritos',
    date: '2026-10-12',
    raw: '',
    items: [
      { id: 'i1', name: 'Burrito Bowl', cents: 1195, who: ['sam1'] },
      { id: 'i2', name: 'Chips & Guac', cents: 890, who: ['sam1', 'alex2', 'me'] },
      { id: 'i3', name: 'Soda', cents: 299, who: [] },
    ],
    taxC: 362,
    feesC: 639,
    discountC: 500,
    tipMode: 'amt',
    tipPct: 18,
    tipAmtC: 500,
    feesEven: true,
    here: ['sam1', 'alex2'],
    parsedTotalC: null,
  },
};

/** Put raw text into localStorage as an earlier visit would have, then reload so the app reads it. */
async function seed(page: Page, entries: Record<string, string>) {
  await page.goto('/');
  // The app saves its starting state right after it first renders. Let that happen before
  // seeding, or it can land afterwards and overwrite the seed (a rare flake).
  await page.waitForFunction(() => localStorage.getItem('mealsplit') !== null);
  await page.evaluate((e) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v);
  }, entries);
  await page.reload();
}

const stored = (page: Page, key = 'mealsplit') =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw === null ? null : JSON.parse(raw);
  }, key);

const acceptDialogs = (page: Page, messages: string[] = []) =>
  page.on('dialog', (d) => {
    messages.push(d.message());
    void d.accept();
  });

test.describe('old data survives', () => {
  test('a v1 save is migrated: details, friends, bill and who-is-here all come through', async ({
    page,
  }) => {
    await seed(page, { 'mealsplit.v1': JSON.stringify(V1) });

    await tab(page, 'People').click();
    await expect(page.getByLabel('My Venmo')).toHaveValue('george-a');
    await expect(page.locator('.friend', { hasText: 'Sam' })).toContainText('@sam-w');
    await expect(page.locator('.friend', { hasText: 'Alex' })).toContainText('alex@example.com');
    await expect(page.getByLabel('Sam is at this meal')).toBeChecked();
    await expect(page.getByLabel('Alex is at this meal')).toBeChecked();

    await tab(page, 'Receipt').click();
    await expect(page.getByLabel('Item name')).toHaveCount(3);
    await expect(page.locator('.totals')).toContainText('$33.85');

    await tab(page, 'Split').click();
    await expect(page.locator('.pcard', { hasText: 'Sam' })).toBeVisible();
    await expect(page.locator('.pcard', { hasText: 'Alex' })).toBeVisible();

    // It was rewritten as a v2 envelope, and the old copy is still there to roll back to.
    const env = await stored(page);
    expect(env.version).toBe(2);
    expect(env.data.people).toHaveLength(2);
    expect(env.data.bill.id).toBeTruthy();
    expect(env.data.history).toEqual([]);
    expect(await stored(page, 'mealsplit.v1')).toEqual(V1);
    await expect(page.locator('.notice')).toHaveCount(0);
  });

  test('an old `me` with keys missing never shows "undefined"', async ({ page }) => {
    await seed(page, {
      'mealsplit.v1': JSON.stringify({
        me: { name: 'Georgie' },
        people: [{ id: 'p', name: 'Sam' }],
      }),
    });
    await tab(page, 'People').click();
    await expect(page.getByLabel('Name', { exact: true }).first()).toHaveValue('Georgie');
    await expect(page.getByLabel('My Venmo')).toHaveValue('');
    await expect(page.locator('.friend', { hasText: 'Sam' })).toContainText('no payment details');
    await expect(page.locator('body')).not.toContainText(/undefined|null|NaN/);
    await tab(page, 'Split').click();
    await expect(page.locator('body')).not.toContainText(/undefined|null|NaN/);
  });
});

test.describe('bad data never crashes the app', () => {
  test('corrupt data: a notice, a fresh start, and a copy kept', async ({ page }) => {
    await seed(page, { mealsplit: '{"version":2,"data":{"me":' });
    await expect(page.locator('.notice')).toContainText('couldn’t be read');
    await expect(page.locator('.notice')).toContainText('A copy is kept');
    await tab(page, 'Receipt').click();
    await expect(page.getByRole('button', { name: 'Parse text' })).toBeVisible();

    const backup = await stored(page, 'mealsplit.backup');
    expect(backup.raw).toBe('{"version":2,"data":{"me":');

    // The app works, and saves over the broken data. The backup is offered under Your data.
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.locator('.notice')).toHaveCount(0);
    await tab(page, 'History').click();
    await expect(page.getByRole('button', { name: 'Download it' })).toBeVisible();
    expect((await stored(page)).version).toBe(2);
  });

  test('data from a newer version is left alone with a notice', async ({ page }) => {
    const future = JSON.stringify({ version: 99, data: { shiny: true } });
    await seed(page, { mealsplit: future });
    await expect(page.locator('.notice')).toContainText('newer version');
    expect((await stored(page, 'mealsplit.backup')).raw).toBe(future);
  });

  test('when saving fails (storage full) you get a small notice and the app keeps working', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('full', 'QuotaExceededError');
      };
    });
    await page.goto('/');
    await expect(page.locator('.notice')).toContainText('storage is full');
    await expect(page.locator('.notice')).toContainText('Export your data');
    // Not blocking: you can still use the app.
    await parseText(page, 'Burger 10.00');
    await expect(page.getByLabel('Item name')).toHaveCount(1);
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.locator('.notice')).toHaveCount(0);
  });
});

test.describe('history', () => {
  async function dinner(page: Page) {
    await page.goto('/');
    await parseText(page, 'Burger 10.00\nFries 5.00');
    await page.getByLabel('What was it?').fill('Burger night');
    await addFriend(page, 'Sam', '@sam');
    await tab(page, 'Assign').click();
    await assign(page, 'Burger', ['Sam']);
    await assign(page, 'Fries', ['Sam']);
  }

  test('save a meal, see it in the list, open it read-only, duplicate it', async ({ page }) => {
    await dinner(page);
    await tab(page, 'Split').click();
    await page.getByRole('button', { name: 'Save to history' }).click();

    await tab(page, 'History').click();
    const row = page.locator('.history .meal');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Burger night');
    await expect(row).toContainText('George, Sam');
    await expect(row).toContainText('$15.00');

    // Open it: read-only (no editing controls), with the split.
    await row.click();
    await expect(page.getByText('read-only')).toBeVisible();
    await expect(page.locator('.pcard', { hasText: 'Sam' }).locator('h2 .big')).toHaveText(
      '$15.00',
    );
    // (The Receipt tab stays mounted but hidden, so look for visible editing controls.)
    await expect(page.locator('[aria-label="Item name"]:visible')).toHaveCount(0);

    // Back works.
    await page.getByRole('button', { name: '‹ History' }).click();
    await expect(page.locator('.history .meal')).toHaveCount(1);

    // Duplicate it into a new bill, which opens on the Receipt tab.
    await row.click();
    await page.getByRole('button', { name: 'Duplicate into new bill' }).click();
    await expect(page.getByRole('button', { name: 'Parse text' })).toBeVisible();
    await expect(page.getByLabel('Item name')).toHaveCount(2);
    await expect(page.getByLabel('What was it?')).toHaveValue('Burger night');

    // The meal is still in history, and it survives a reload.
    await page.reload();
    await tab(page, 'History').click();
    await expect(page.locator('.history .meal')).toHaveCount(1);
  });

  test('New bill saves the old bill and keeps your usual friends ticked', async ({ page }) => {
    await dinner(page);
    await page.getByRole('button', { name: 'New bill' }).click();

    // No confirm, nothing lost: the old bill is in History.
    await expect(page.getByLabel('Item name')).toHaveCount(0);
    await tab(page, 'People').click();
    await expect(page.getByLabel('Sam is at this meal')).toBeChecked();
    await tab(page, 'History').click();
    await expect(page.locator('.history .meal')).toHaveCount(1);
    await expect(page.locator('.history .meal')).toContainText('Burger night');

    // An untouched, empty bill is not saved again.
    await page.getByRole('button', { name: 'New bill' }).click();
    await tab(page, 'History').click();
    await expect(page.locator('.history .meal')).toHaveCount(1);
  });

  test('only the last 20 meals are kept', async ({ page }) => {
    // 22 bills through the real UI: ~20s in WebKit on a busy machine, close to the 30s default.
    test.slow();
    await page.goto('/');
    for (let n = 1; n <= 22; n++) {
      await parseText(page, `Meal ${n} ${n}.00`);
      await page.getByRole('button', { name: 'New bill' }).click();
    }
    await tab(page, 'History').click();
    const rows = page.locator('.history .meal');
    await expect(rows).toHaveCount(20);
    await expect(rows.first()).toContainText('Meal 22');
    await expect(rows.last()).toContainText('Meal 3');
  });
});

test('the tab you were on is still there after a reload', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'People').click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Friends' })).toBeVisible();
});

test.describe('your data', () => {
  test('export downloads a file, import restores it (after a confirm), clear wipes it', async ({
    page,
  }, testInfo) => {
    const dialogs: string[] = [];
    acceptDialogs(page, dialogs);

    await page.goto('/');
    await parseText(page, 'Burger 10.00\nFries 5.00');
    await addFriend(page, 'Sam', '@sam');
    await page.getByRole('button', { name: 'New bill' }).click();
    await tab(page, 'History').click();

    // Export
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^mealsplit-\d{4}-\d{2}-\d{2}\.json$/);
    const path = testInfo.outputPath('export.json');
    await download.saveAs(path);
    const file = JSON.parse(readFileSync(path, 'utf8'));
    expect(file).toMatchObject({ app: 'mealsplit', version: 2 });
    expect(file.data.people.map((p: { name: string }) => p.name)).toEqual(['Sam']);
    expect(file.data.history).toHaveLength(1);

    // Clear all data: confirm, then everything is gone.
    await page.getByRole('button', { name: 'Clear all data' }).click();
    expect(dialogs.at(-1)).toContain('Delete all mealsplit data');
    await expect(page.locator('.history .meal')).toHaveCount(0);
    await tab(page, 'People').click();
    await expect(page.locator('.friend')).toHaveCount(0);

    // Import it back: validated, confirmed, then replaced.
    await tab(page, 'History').click();
    await page.getByLabel('Import file').setInputFiles(path);
    await expect(page.locator('.history .meal')).toHaveCount(1);
    expect(dialogs.at(-1)).toContain('1 friend, 1 past meal');
    await tab(page, 'People').click();
    await expect(page.locator('.friend', { hasText: 'Sam' })).toContainText('@sam');
  });

  test('declining the confirm changes nothing', async ({ page }) => {
    page.on('dialog', (d) => void d.dismiss());
    await page.goto('/');
    await addFriend(page, 'Sam');
    await tab(page, 'History').click();
    await page.getByRole('button', { name: 'Clear all data' }).click();
    await page.getByLabel('Import file').setInputFiles({
      name: 'x.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ app: 'mealsplit', version: 2, data: { people: [] } })),
    });
    await tab(page, 'People').click();
    await expect(page.locator('.friend', { hasText: 'Sam' })).toBeVisible();
  });

  test('a bad import file is refused with a message and nothing is replaced', async ({ page }) => {
    acceptDialogs(page);
    await page.goto('/');
    await addFriend(page, 'Sam');
    await tab(page, 'History').click();
    const upload = (name: string, text: string) =>
      page
        .getByLabel('Import file')
        .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });

    await upload('notes.json', 'this is not json');
    await expect(page.getByRole('alert')).toContainText('can’t be imported');

    await upload('future.json', JSON.stringify({ version: 99, data: {} }));
    await expect(page.getByRole('alert')).toContainText('newer version');

    await tab(page, 'People').click();
    await expect(page.locator('.friend', { hasText: 'Sam' })).toBeVisible();
  });
});
