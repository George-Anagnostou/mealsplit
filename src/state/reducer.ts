import type { ParsedReceipt } from '../core/parser';
import type { TipMode } from '../core/split';
import { newBill } from './defaults';
import { saveCurrent } from './history';
import type { Stamp } from './ids';
import type { AppState, Bill, EditableField, Friend, Item, Tab } from './types';

/** How many steps back Undo can go. */
export const UNDO_LIMIT = 30;

export type Action =
  | { type: 'meta'; field: 'title' | 'date' | 'raw'; value: string }
  /**
   * Replace the items and fill in the amounts from a parsed receipt. Amounts you edited by hand
   * are kept unless `overwrite` is set. The previous bill is kept for Undo.
   */
  | { type: 'applyParsed'; parsed: ParsedReceipt; ids: string[]; overwrite?: boolean }
  /** Forget which amounts were edited by hand, so the next parse fills them all in. */
  | { type: 'forgetEdits' }
  | { type: 'addItem'; id: string }
  | { type: 'editItem'; id: string; patch: { name?: string; cents?: number } }
  | { type: 'removeItem'; id: string }
  | { type: 'money'; field: 'taxC' | 'feesC' | 'discountC'; cents: number }
  | { type: 'tipMode'; mode: TipMode }
  | { type: 'tipPct'; pct: number }
  | { type: 'tipAmt'; cents: number }
  | { type: 'feesEven'; value: boolean }
  | { type: 'setTab'; tab: Tab }
  /** Save this bill to history, keeping it open. */
  | { type: 'finishBill'; now: number }
  /** Save this bill to history, then start a fresh one with the same friends ticked. */
  | { type: 'newBill'; stamp: Stamp }
  /** Copy a past meal into a new bill (the current bill is saved to history first). */
  | { type: 'duplicateMeal'; billId: string; stamp: Stamp }
  /** Replace everything with imported data. The tab you are on is kept. */
  | { type: 'importState'; state: AppState }
  /** Clear all data: back to a fresh app. */
  | { type: 'resetAll'; state: AppState }
  | { type: 'setMe'; field: 'name' | 'venmo' | 'contact'; value: string }
  | { type: 'addFriend'; friend: Friend }
  | { type: 'editFriend'; id: string; field: 'name' | 'venmo' | 'contact'; value: string }
  | { type: 'deleteFriend'; id: string }
  | { type: 'toggleHere'; id: string }
  | { type: 'toggleWho'; itemId: string; partyId: string }
  | { type: 'setWho'; itemId: string; who: string[] }
  /** Add `partyId` to every listed item, or take it off all of them if they all have it. */
  | { type: 'toggleWhoMany'; itemIds: string[]; partyId: string }
  /** Set exactly who had each listed item. */
  | { type: 'setWhoMany'; itemIds: string[]; who: string[] }
  | { type: 'assignAll'; ids: string[] }
  | { type: 'clearAssign' }
  /** Go back to the bill as it was before the last assignment change or re-parse. */
  | { type: 'undo' };

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameWho = (a: Item[], b: Item[]) => a.every((it, i) => same(it.who, b[i].who));

/** Which amounts a parse would change, as seen from the bill's current values. */
export function keptEdits(b: Bill, p: ParsedReceipt): EditableField[] {
  return b.edited.filter((f) => {
    if (f === 'taxC') return b.taxC !== p.taxC;
    if (f === 'feesC') return b.feesC !== p.feesC;
    if (f === 'discountC') return b.discountC !== p.discountC;
    return p.hasTip && (b.tipMode !== 'amt' || b.tipAmtC !== p.tipC);
  });
}

export function reducer(s: AppState, a: Action): AppState {
  const b = s.bill;
  /** Edits that make older snapshots stale: Undo only covers a run of assignment changes. */
  const withBill = (patch: Partial<Bill>): AppState => ({
    ...s,
    bill: { ...b, ...patch },
    undo: [],
  });
  /** An assignment change: the bill as it was goes on the Undo stack, unless nothing changed. */
  const assignItems = (f: (it: Item) => Item): AppState => {
    const items = b.items.map(f);
    if (sameWho(items, b.items)) return s;
    return { ...s, bill: { ...b, items }, undo: [b, ...s.undo].slice(0, UNDO_LIMIT) };
  };
  const edit = (field: EditableField, patch: Partial<Bill>): AppState => {
    const next = withBill(patch);
    return b.edited.includes(field)
      ? next
      : { ...next, bill: { ...next.bill, edited: [...b.edited, field] } };
  };
  const mapItem = (id: string, f: (it: Item) => Item) =>
    withBill({ items: b.items.map((it) => (it.id === id ? f(it) : it)) });

  switch (a.type) {
    case 'meta':
      // Typing a title or pasting text doesn't touch the items, so Undo stays available.
      return { ...s, bill: { ...b, [a.field]: a.value } };
    case 'applyParsed': {
      const p = a.parsed;
      const keep = (f: EditableField) => !a.overwrite && b.edited.includes(f);
      const next: Bill = {
        ...b,
        items: p.items.map((i, n) => ({ id: a.ids[n], name: i.name, cents: i.cents, who: [] })),
        taxC: keep('taxC') ? b.taxC : p.taxC,
        feesC: keep('feesC') ? b.feesC : p.feesC,
        discountC: keep('discountC') ? b.discountC : p.discountC,
        parsedTotalC: p.totalC,
        ...(p.hasTip && !keep('tip') ? { tipMode: 'amt' as const, tipAmtC: p.tipC } : {}),
        edited: a.overwrite ? [] : b.edited,
      };
      // The old bill is the one thing Undo brings back (not older assignment history).
      return { ...s, bill: next, undo: [b] };
    }
    case 'forgetEdits':
      return { ...s, bill: { ...b, edited: [] } };
    case 'addItem':
      return withBill({ items: [...b.items, { id: a.id, name: '', cents: 0, who: [] }] });
    case 'editItem':
      return mapItem(a.id, (it) => ({ ...it, ...a.patch }));
    case 'removeItem':
      return withBill({ items: b.items.filter((it) => it.id !== a.id) });
    case 'money':
      return edit(a.field, { [a.field]: Math.max(0, a.cents) });
    case 'tipMode':
      return edit('tip', { tipMode: a.mode });
    case 'tipPct':
      return edit('tip', { tipPct: a.pct });
    case 'tipAmt':
      return edit('tip', { tipAmtC: Math.max(0, a.cents) });
    case 'feesEven':
      return withBill({ feesEven: a.value });
    case 'setTab':
      return { ...s, tab: a.tab };
    case 'finishBill':
      return { ...s, history: saveCurrent(s, a.now) };
    case 'newBill':
      return {
        ...s,
        history: saveCurrent(s, a.stamp.now),
        undo: [],
        // The same crowd usually eats together: keep who was ticked (friends still on the list).
        bill: newBill(
          a.stamp,
          b.here.filter((id) => s.people.some((p) => p.id === id)),
        ),
      };
    case 'duplicateMeal': {
      const meal = s.history.find((m) => m.bill.id === a.billId);
      if (!meal) return s;
      // Bring back friends deleted since, so nobody's items point at a missing person.
      const missing = meal.people.filter((p) => !s.people.some((q) => q.id === p.id));
      return {
        ...s,
        history: saveCurrent(s, a.stamp.now),
        people: [...s.people, ...missing],
        bill: { ...meal.bill, id: a.stamp.id, date: a.stamp.today },
        undo: [],
        tab: 'receipt',
      };
    }
    case 'importState':
      return { ...a.state, tab: s.tab, undo: [] };
    case 'resetAll':
      return a.state;
    case 'setMe':
      return { ...s, me: { ...s.me, [a.field]: a.value } };
    case 'addFriend':
      return {
        ...s,
        people: [...s.people, a.friend],
        bill: { ...b, here: [...b.here, a.friend.id] },
        undo: [],
      };
    case 'editFriend':
      return {
        ...s,
        people: s.people.map((p) => (p.id === a.id ? { ...p, [a.field]: a.value } : p)),
      };
    case 'deleteFriend':
      return {
        ...s,
        people: s.people.filter((p) => p.id !== a.id),
        bill: {
          ...b,
          here: b.here.filter((x) => x !== a.id),
          items: b.items.map((it) => ({ ...it, who: it.who.filter((x) => x !== a.id) })),
        },
        undo: [],
      };
    case 'toggleHere':
      return withBill({
        here: b.here.includes(a.id) ? b.here.filter((x) => x !== a.id) : [...b.here, a.id],
      });
    case 'toggleWho':
      return assignItems((it) =>
        it.id !== a.itemId
          ? it
          : {
              ...it,
              who: it.who.includes(a.partyId)
                ? it.who.filter((x) => x !== a.partyId)
                : [...it.who, a.partyId],
            },
      );
    case 'setWho':
      return assignItems((it) => (it.id === a.itemId ? { ...it, who: [...a.who] } : it));
    case 'toggleWhoMany': {
      const picked = b.items.filter((it) => a.itemIds.includes(it.id));
      const remove = picked.length > 0 && picked.every((it) => it.who.includes(a.partyId));
      return assignItems((it) => {
        if (!a.itemIds.includes(it.id)) return it;
        if (remove) return { ...it, who: it.who.filter((x) => x !== a.partyId) };
        return it.who.includes(a.partyId) ? it : { ...it, who: [...it.who, a.partyId] };
      });
    }
    case 'setWhoMany':
      return assignItems((it) => (a.itemIds.includes(it.id) ? { ...it, who: [...a.who] } : it));
    case 'assignAll':
      return assignItems((it) => ({ ...it, who: [...a.ids] }));
    case 'clearAssign':
      return assignItems((it) => ({ ...it, who: [] }));
    case 'undo': {
      const [prev, ...rest] = s.undo;
      return prev ? { ...s, bill: prev, undo: rest } : s;
    }
    default:
      return s;
  }
}
