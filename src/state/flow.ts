// The four steps of a bill, in order, and what is left to do in each. Pure: no React, no storage.
import { presentWho } from './selectors';
import type { AppState, Item, Tab } from './types';

export type Step = 'receipt' | 'people' | 'assign' | 'split';

export const STEPS: readonly { id: Step; label: string; title: string }[] = [
  { id: 'receipt', label: 'Receipt', title: 'Add the receipt' },
  { id: 'people', label: 'People', title: 'Who’s at the table?' },
  { id: 'assign', label: 'Assign', title: 'Who had what?' },
  { id: 'split', label: 'Split', title: 'Who owes what' },
];

/** The page heading for any tab (History is not a step). */
export const titleOf = (tab: Tab): string =>
  tab === 'history' ? 'History' : (STEPS.find((s) => s.id === tab)?.title ?? '');

/** Position in the flow, or -1 when the tab is not a step. */
export const stepIndex = (tab: Tab): number => STEPS.findIndex((s) => s.id === tab);

export const prevStep = (tab: Tab): Step | null => STEPS[stepIndex(tab) - 1]?.id ?? null;
export const nextStep = (tab: Tab): Step | null => {
  const i = stepIndex(tab);
  return i < 0 ? null : (STEPS[i + 1]?.id ?? null);
};

/** Items nobody at this meal is paying for yet. */
export const unassignedItems = (s: AppState): Item[] =>
  s.bill.items.filter((it) => presentWho(s.bill, it.who).length === 0);

/** Which steps look finished, for the check marks on the step bar. */
export function stepsDone(s: AppState): Record<Step, boolean> {
  const hasItems = s.bill.items.length > 0;
  return {
    receipt: hasItems,
    people: s.bill.here.length > 0,
    assign: hasItems && unassignedItems(s).length === 0,
    split: false,
  };
}
