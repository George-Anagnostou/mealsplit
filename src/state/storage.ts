import type { AppState, Bill } from './types';

// Same key and shape as the pre-React app, so existing data keeps working.
// Versioned schema + migrations arrive in a later PR.
const KEY = 'mealsplit.v1';

const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const newBill = (): Bill => ({
  title: '',
  date: todayISO(),
  raw: '',
  items: [],
  taxC: 0,
  feesC: 0,
  discountC: 0,
  tipMode: 'pct',
  tipPct: 0,
  tipAmtC: 0,
  feesEven: false,
  here: [],
  parsedTotalC: null,
});

export const defaultState = (): AppState => ({
  me: { name: 'George', venmo: '', contact: '' },
  people: [],
  bill: newBill(),
});

export function loadState(): AppState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<AppState>;
    const base = defaultState();
    return { ...base, ...saved, bill: { ...newBill(), ...saved.bill } };
  } catch {
    return defaultState();
  }
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full or unavailable (e.g. private mode): keep working in memory.
  }
}
