import { billNote, cleanVenmo } from '../core/links';
import {
  clampDiscount,
  computeSplit,
  computeTip,
  discountNotice,
  type Reconciliation,
  reconcile,
  type SplitOptions,
  type SplitResult,
  UNASSIGNED,
} from '../core/split';
import { type AppState, type Bill, type Friend, ME, type Meal } from './types';

export interface Party {
  id: string;
  name: string;
  me?: boolean;
}

/** "Me" first, then the friends ticked as present. */
export const partiesOf = (s: AppState): Party[] => [
  { id: ME, name: s.me.name || 'Me', me: true },
  ...s.people.filter((p) => s.bill.here.includes(p.id)),
];

export const nameOf = (s: AppState, id: string): string =>
  id === ME ? s.me.name || 'Me' : s.people.find((p) => p.id === id)?.name || '?';

export const friendById = (s: AppState, id: string): Friend | undefined =>
  s.people.find((p) => p.id === id);

export const subtotalOf = (b: Bill): number => b.items.reduce((a, i) => a + (i.cents || 0), 0);
export const tipOf = (b: Bill): number => computeTip(subtotalOf(b), b.tipMode, b.tipPct, b.tipAmtC);
export const noteOf = (b: Bill): string => billNote(b.title || 'Dinner', b.date);
export const grandTotalOf = (b: Bill): number =>
  subtotalOf(b) + b.taxC + tipOf(b) + b.feesC - clampDiscount(b.discountC, subtotalOf(b));

/** Only people who are present count as assignees. */
export const presentWho = (b: Bill, who: string[]): string[] =>
  who.filter((id) => id === ME || b.here.includes(id));

const splitOptions = (b: Bill): SplitOptions => ({
  taxC: b.taxC,
  tipC: tipOf(b),
  feesC: b.feesC,
  discountC: b.discountC,
  feesEven: b.feesEven,
});

export const computeBill = (b: Bill): SplitResult =>
  computeSplit(
    b.items.map((i) => ({ cents: i.cents, who: presentWho(b, i.who) })),
    splitOptions(b),
  );

/** The numbers shown under the Receipt tab's inputs. */
export interface BillTotals {
  subtotalC: number;
  tipC: number;
  totalC: number;
  /** The discount actually applied (capped at the items subtotal). */
  discountC: number;
  discountNotice: string | null;
  /** Computed total minus the receipt's own total, or null when no receipt total was parsed. */
  receiptDiffC: number | null;
}

export function billTotals(b: Bill): BillTotals {
  const subtotalC = subtotalOf(b);
  const totalC = grandTotalOf(b);
  return {
    subtotalC,
    tipC: tipOf(b),
    totalC,
    discountC: clampDiscount(b.discountC, subtotalC),
    discountNotice: discountNotice(b.discountC, subtotalC),
    receiptDiffC: b.parsedTotalC == null ? null : totalC - b.parsedTotalC,
  };
}

/** Everything the Split tab shows, worked out in one place. */
export interface SplitSummary {
  result: SplitResult;
  note: string;
  meName: string;
  discountNotice: string | null;
  recon: Reconciliation;
  unassigned: SplitResult['parties'][string] | undefined;
  /** Friends at the meal who have a share, in tick order. */
  friends: { party: Party; totals: SplitResult['parties'][string]; friend?: Friend }[];
  meTotals: SplitResult['parties'][string] | undefined;
}

export function splitSummary(s: AppState): SplitSummary {
  const result = computeBill(s.bill);
  return {
    result,
    note: noteOf(s.bill),
    meName: s.me.name || 'Me',
    discountNotice: discountNotice(s.bill.discountC, result.subtotalC),
    recon: reconcile(result.totalC, s.bill.parsedTotalC),
    unassigned: result.parties[UNASSIGNED],
    friends: partiesOf(s)
      .filter((p) => p.id !== ME && result.parties[p.id])
      .map((party) => ({
        party,
        totals: result.parties[party.id],
        friend: friendById(s, party.id),
      })),
    meTotals: result.parties[ME],
  };
}

/** A friend as typed into the add form: trimmed, with a clean Venmo username. Null if unnamed. */
export function friendFromInput(
  id: string,
  input: { name: string; venmo: string; contact: string },
): Friend | null {
  const name = input.name.trim();
  if (!name) return null;
  return { id, name, venmo: cleanVenmo(input.venmo), contact: input.contact.trim() };
}

/** "2026-10-30" -> "Oct 30, 2026". Anything else is returned as it is. */
export function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Reject dates that only parse by rolling over (2026-02-31, 2026-13-45).
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export interface MealSummary {
  id: string;
  date: string;
  /** The title, else the first item, else "Meal". */
  label: string;
  totalC: number;
  /** Everyone who was there, you first. */
  people: string[];
}

export function mealSummary(m: Meal, meName: string): MealSummary {
  const b = m.bill;
  return {
    id: b.id,
    date: b.date,
    label: b.title.trim() || b.items.find((i) => i.name.trim())?.name.trim() || 'Meal',
    totalC: grandTotalOf(b),
    people: [meName || 'Me', ...m.people.map((p) => p.name || '?')],
  };
}

/** A past meal laid over your current payment details, so it can be shown with the Split views. */
export const mealState = (s: AppState, m: Meal): AppState => ({
  ...s,
  people: m.people,
  bill: m.bill,
});
