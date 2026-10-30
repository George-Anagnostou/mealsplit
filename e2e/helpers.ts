import type { Page } from '@playwright/test';

export const cents = (text: string): number =>
  Math.round(Number(text.replace(/[^0-9.-]/g, '')) * 100);

/** Go to a step (via the step bar) or, for History, via the header button. */
export const tab = (page: Page, name: string) =>
  name === 'History'
    ? page.getByRole('banner').getByRole('button', { name: 'History', exact: true })
    : page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name });

/** Tap an item on the Assign step, then toggle people in the picker. */
export async function assign(page: Page, item: string, people: string[]) {
  await page
    .getByRole('group', { name: new RegExp(item) })
    .getByRole('button')
    .first()
    .click();
  const picker = page.locator('.picker');
  for (const p of people) await picker.getByRole('button', { name: p }).click();
}

/** Paste receipt text on the Receipt step and parse it. */
export async function parseText(page: Page, text: string) {
  await page.locator('textarea').fill(text);
  await page.getByRole('button', { name: 'Parse text' }).click();
}

export async function addFriend(page: Page, name: string, venmo = '') {
  await tab(page, 'People').click();
  const form = page.locator('.addfriend');
  await form.getByLabel('Name', { exact: true }).fill(name);
  await form.getByLabel('Venmo').fill(venmo);
  await form.getByRole('button', { name: 'Add friend' }).click();
}

export async function setMoney(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel(label, { exact: true }).blur();
}
