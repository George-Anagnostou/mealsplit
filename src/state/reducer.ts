import type { ParsedReceipt } from '../core/parser';
import type { TipMode } from '../core/split';
import { newBill } from './defaults';
import { saveCurrent } from './history';
import type { Stamp } from './ids';
import type { AppState, Friend, Tab } from './types';

export type Action =
  | { type: 'meta'; field: 'title' | 'date' | 'raw'; value: string }
  | { type: 'applyParsed'; parsed: ParsedReceipt; ids: string[] }
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
  | { type: 'assignAll'; ids: string[] }
  | { type: 'clearAssign' };

export function reducer(s: AppState, a: Action): AppState {
  const b = s.bill;
  const withBill = (patch: Partial<typeof b>): AppState => ({ ...s, bill: { ...b, ...patch } });
  const mapItem = (id: string, f: (it: (typeof b.items)[number]) => (typeof b.items)[number]) =>
    withBill({ items: b.items.map((it) => (it.id === id ? f(it) : it)) });

  switch (a.type) {
    case 'meta':
      return withBill({ [a.field]: a.value });
    case 'applyParsed': {
      const p = a.parsed;
      return withBill({
        items: p.items.map((i, n) => ({ id: a.ids[n], name: i.name, cents: i.cents, who: [] })),
        taxC: p.taxC,
        feesC: p.feesC,
        discountC: p.discountC,
        parsedTotalC: p.totalC,
        ...(p.hasTip ? { tipMode: 'amt' as const, tipAmtC: p.tipC } : {}),
      });
    }
    case 'addItem':
      return withBill({ items: [...b.items, { id: a.id, name: '', cents: 0, who: [] }] });
    case 'editItem':
      return mapItem(a.id, (it) => ({ ...it, ...a.patch }));
    case 'removeItem':
      return withBill({ items: b.items.filter((it) => it.id !== a.id) });
    case 'money':
      return withBill({ [a.field]: Math.max(0, a.cents) });
    case 'tipMode':
      return withBill({ tipMode: a.mode });
    case 'tipPct':
      return withBill({ tipPct: a.pct });
    case 'tipAmt':
      return withBill({ tipAmtC: Math.max(0, a.cents) });
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
        tab: 'receipt',
      };
    }
    case 'importState':
      return { ...a.state, tab: s.tab };
    case 'resetAll':
      return a.state;
    case 'setMe':
      return { ...s, me: { ...s.me, [a.field]: a.value } };
    case 'addFriend':
      return {
        ...s,
        people: [...s.people, a.friend],
        bill: { ...b, here: [...b.here, a.friend.id] },
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
      };
    case 'toggleHere':
      return withBill({
        here: b.here.includes(a.id) ? b.here.filter((x) => x !== a.id) : [...b.here, a.id],
      });
    case 'toggleWho':
      return mapItem(a.itemId, (it) => ({
        ...it,
        who: it.who.includes(a.partyId)
          ? it.who.filter((x) => x !== a.partyId)
          : [...it.who, a.partyId],
      }));
    case 'setWho':
      return mapItem(a.itemId, (it) => ({ ...it, who: a.who }));
    case 'assignAll':
      return withBill({ items: b.items.map((it) => ({ ...it, who: [...a.ids] })) });
    case 'clearAssign':
      return withBill({ items: b.items.map((it) => ({ ...it, who: [] })) });
    default:
      return s;
  }
}
