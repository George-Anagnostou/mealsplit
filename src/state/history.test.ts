import { describe, expect, test } from 'vitest';
import { addMeal, HISTORY_LIMIT, isWorthSaving, mealFrom, saveCurrent } from './history';
import { friend, item, makeState, meal } from './testing';

describe('history', () => {
  test('the limit is 20', () => {
    expect(HISTORY_LIMIT).toBe(20);
  });

  test('newest first', () => {
    const h = addMeal(addMeal([], meal('a', 1)), meal('b', 2));
    expect(h.map((m) => m.bill.id)).toEqual(['b', 'a']);
  });

  test('keeps only the last 20, dropping the oldest', () => {
    let h = [] as ReturnType<typeof addMeal>;
    for (let n = 1; n <= 25; n++) h = addMeal(h, meal(`m${n}`, n));
    expect(h).toHaveLength(20);
    expect(h[0].bill.id).toBe('m25');
    expect(h[19].bill.id).toBe('m6');
    expect(h.some((m) => m.bill.id === 'm5')).toBe(false);
  });

  test('exactly 20 are all kept; the 21st pushes one out', () => {
    let h = [] as ReturnType<typeof addMeal>;
    for (let n = 1; n <= 20; n++) h = addMeal(h, meal(`m${n}`, n));
    expect(h).toHaveLength(20);
    expect(addMeal(h, meal('m21', 21))).toHaveLength(20);
  });

  test('a custom limit is honoured', () => {
    expect(addMeal([meal('a', 1), meal('b', 0)], meal('c', 2), 2).map((m) => m.bill.id)).toEqual([
      'c',
      'a',
    ]);
  });

  test('saving the same bill again replaces it (and moves it to the front) instead of duplicating', () => {
    const h = addMeal(addMeal(addMeal([], meal('a', 1)), meal('b', 2)), meal('a', 3));
    expect(h.map((m) => m.bill.id)).toEqual(['a', 'b']);
    expect(h[0].savedAt).toBe(3);
  });

  test('a re-save at the cap does not push anything out', () => {
    let h = [] as ReturnType<typeof addMeal>;
    for (let n = 1; n <= 20; n++) h = addMeal(h, meal(`m${n}`, n));
    const again = addMeal(h, meal('m1', 99));
    expect(again).toHaveLength(20);
    expect(again[0].bill.id).toBe('m1');
  });

  test('empty bills are not worth saving', () => {
    const empty = makeState();
    expect(isWorthSaving(empty)).toBe(false);
    expect(saveCurrent(empty, 5)).toBe(empty.history);
    const some = makeState({ bill: { items: [item('i', 100)] } });
    expect(isWorthSaving(some)).toBe(true);
    expect(saveCurrent(some, 5)).toHaveLength(1);
  });

  test('a meal remembers the friends who were there, not the whole list', () => {
    const s = makeState({
      people: [friend('sam'), friend('alex'), friend('kim')],
      bill: { here: ['alex', 'sam'], items: [item('i', 100)] },
    });
    const m = mealFrom(s, 42);
    expect(m.savedAt).toBe(42);
    expect(m.people.map((p) => p.id)).toEqual(['sam', 'alex']); // list order
    expect(m.bill).toBe(s.bill);
  });
});
