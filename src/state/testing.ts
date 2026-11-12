// Small builders shared by the state tests. Not imported by the app.
import { defaultState } from './defaults';
import type { AppState, Bill, Friend, Item, Meal } from './types';

export const stamp = (n = 1, now = 1_000 * n) => ({ id: `bill-${n}`, today: '2026-10-30', now });

export const friend = (id: string, name = id, venmo = '', contact = ''): Friend => ({
  id,
  name,
  venmo,
  contact,
});

export const item = (id: string, cents: number, who: string[] = [], name = id): Item => ({
  id,
  name,
  cents,
  who,
});

/** A state with the given overrides on top of the defaults. */
export function makeState(
  over: Partial<Omit<AppState, 'bill'>> & { bill?: Partial<Bill> } = {},
): AppState {
  const base = defaultState({ id: 'bill-0', today: '2026-10-01' });
  const { bill, ...rest } = over;
  return { ...base, ...rest, bill: { ...base.bill, ...bill } };
}

export const meal = (
  id: string,
  savedAt: number,
  items: Item[] = [item(`${id}-i`, 1000)],
): Meal => ({
  savedAt,
  people: [],
  bill: { ...makeState().bill, id, items },
});
