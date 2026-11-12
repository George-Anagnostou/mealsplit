import type { AppState, Meal } from './types';

/** How many past meals are kept. */
export const HISTORY_LIMIT = 20;

/** A bill is worth keeping once it has at least one item. */
export const isWorthSaving = (s: AppState): boolean => s.bill.items.length > 0;

/** Snapshot the current bill, with the friends who were at it. */
export const mealFrom = (s: AppState, now: number): Meal => ({
  savedAt: now,
  bill: s.bill,
  people: s.people.filter((p) => s.bill.here.includes(p.id)),
});

/**
 * Add a meal, newest first. Saving the same bill again replaces its earlier entry instead of
 * adding a duplicate. Only the newest `limit` are kept.
 */
export function addMeal(history: Meal[], meal: Meal, limit = HISTORY_LIMIT): Meal[] {
  return [meal, ...history.filter((m) => m.bill.id !== meal.bill.id)].slice(0, limit);
}

/** Save the current bill into history, unless it is empty. */
export function saveCurrent(s: AppState, now: number): Meal[] {
  return isWorthSaving(s) ? addMeal(s.history, mealFrom(s, now)) : s.history;
}
