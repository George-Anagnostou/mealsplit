import { describe, expect, test } from 'vitest';
import type { ParsedReceipt } from '../core/parser';
import { defaultState } from './defaults';
import { type Action, reducer } from './reducer';
import { friend, item, makeState, meal, stamp } from './testing';
import { type AppState, ME } from './types';

const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);

const withItems = () =>
  makeState({
    people: [friend('sam', 'Sam'), friend('alex', 'Alex')],
    bill: {
      here: ['sam', 'alex'],
      items: [item('a', 1000, ['sam', ME]), item('b', 500, ['alex'])],
    },
  });

describe('bill editing', () => {
  test('meta fields', () => {
    const s = run(
      makeState(),
      { type: 'meta', field: 'title', value: 'Tacos' },
      { type: 'meta', field: 'date', value: '2026-10-02' },
      { type: 'meta', field: 'raw', value: 'x 1.00' },
    );
    expect(s.bill).toMatchObject({ title: 'Tacos', date: '2026-10-02', raw: 'x 1.00' });
  });

  test('applyParsed replaces the items and fills the money fields', () => {
    const parsed = {
      items: [
        { name: 'Bowl', cents: 1195, confidence: 1, reasons: [] },
        { name: 'Soda', cents: 299, confidence: 1, reasons: [] },
      ],
      taxC: 100,
      feesC: 200,
      discountC: 300,
      totalC: 1500,
      hasTip: false,
      tipC: 0,
    } as unknown as ParsedReceipt;
    const s = reducer(makeState(), { type: 'applyParsed', parsed: parsed, ids: ['x', 'y'] });
    expect(s.bill.items).toEqual([
      { id: 'x', name: 'Bowl', cents: 1195, who: [] },
      { id: 'y', name: 'Soda', cents: 299, who: [] },
    ]);
    expect(s.bill).toMatchObject({
      taxC: 100,
      feesC: 200,
      discountC: 300,
      parsedTotalC: 1500,
      tipMode: 'pct',
    });
    const tipped = reducer(makeState(), {
      type: 'applyParsed',
      parsed: { ...parsed, hasTip: true, tipC: 450 } as ParsedReceipt,
      ids: ['x', 'y'],
    });
    expect(tipped.bill).toMatchObject({ tipMode: 'amt', tipAmtC: 450 });
  });

  test('items: add, edit, remove', () => {
    let s = reducer(makeState(), { type: 'addItem', id: 'n1' });
    expect(s.bill.items).toEqual([{ id: 'n1', name: '', cents: 0, who: [] }]);
    s = reducer(s, { type: 'editItem', id: 'n1', patch: { name: 'Fries', cents: 450 } });
    expect(s.bill.items[0]).toMatchObject({ name: 'Fries', cents: 450 });
    s = reducer(s, { type: 'editItem', id: 'missing', patch: { name: 'x' } });
    expect(s.bill.items).toHaveLength(1);
    expect(reducer(s, { type: 'removeItem', id: 'n1' }).bill.items).toEqual([]);
  });

  test('money fields never go negative', () => {
    const s = run(
      makeState(),
      { type: 'money', field: 'taxC', cents: 250 },
      { type: 'money', field: 'feesC', cents: -5 },
      { type: 'money', field: 'discountC', cents: 100 },
      { type: 'tipAmt', cents: -9 },
    );
    expect(s.bill).toMatchObject({ taxC: 250, feesC: 0, discountC: 100, tipAmtC: 0 });
  });

  test('tip and fee settings', () => {
    const s = run(
      makeState(),
      { type: 'tipMode', mode: 'amt' },
      { type: 'tipPct', pct: 25 },
      { type: 'tipAmt', cents: 700 },
      { type: 'feesEven', value: true },
    );
    expect(s.bill).toMatchObject({ tipMode: 'amt', tipPct: 25, tipAmtC: 700, feesEven: true });
  });

  test('assignment: toggle, set, assign all, clear', () => {
    let s = withItems();
    s = reducer(s, { type: 'toggleWho', itemId: 'b', partyId: 'sam' });
    expect(s.bill.items[1].who).toEqual(['alex', 'sam']);
    s = reducer(s, { type: 'toggleWho', itemId: 'b', partyId: 'alex' });
    expect(s.bill.items[1].who).toEqual(['sam']);
    s = reducer(s, { type: 'setWho', itemId: 'a', who: ['alex'] });
    expect(s.bill.items[0].who).toEqual(['alex']);
    s = reducer(s, { type: 'assignAll', ids: [ME, 'sam'] });
    expect(s.bill.items.map((i) => i.who)).toEqual([
      [ME, 'sam'],
      [ME, 'sam'],
    ]);
    expect(s.bill.items[0].who).not.toBe(s.bill.items[1].who); // not shared arrays
    s = reducer(s, { type: 'clearAssign' });
    expect(s.bill.items.map((i) => i.who)).toEqual([[], []]);
  });

  test('unknown actions change nothing', () => {
    const s = makeState();
    expect(reducer(s, { type: 'nope' } as unknown as Action)).toBe(s);
  });
});

describe('me and friends', () => {
  test('payment details', () => {
    const s = run(
      makeState(),
      { type: 'setMe', field: 'name', value: 'Geo' },
      { type: 'setMe', field: 'venmo', value: 'geo-a' },
      { type: 'setMe', field: 'contact', value: '555' },
    );
    expect(s.me).toEqual({ name: 'Geo', venmo: 'geo-a', contact: '555' });
  });

  test('a new friend is ticked as present', () => {
    const s = reducer(makeState(), { type: 'addFriend', friend: friend('sam') });
    expect(s.people.map((p) => p.id)).toEqual(['sam']);
    expect(s.bill.here).toEqual(['sam']);
  });

  test('edit and delete (delete also unticks and unassigns)', () => {
    let s = reducer(withItems(), { type: 'editFriend', id: 'sam', field: 'venmo', value: 'sam-w' });
    expect(s.people[0].venmo).toBe('sam-w');
    s = reducer(s, { type: 'deleteFriend', id: 'sam' });
    expect(s.people.map((p) => p.id)).toEqual(['alex']);
    expect(s.bill.here).toEqual(['alex']);
    expect(s.bill.items[0].who).toEqual([ME]);
  });

  test('toggleHere', () => {
    let s = withItems();
    s = reducer(s, { type: 'toggleHere', id: 'sam' });
    expect(s.bill.here).toEqual(['alex']);
    s = reducer(s, { type: 'toggleHere', id: 'sam' });
    expect(s.bill.here).toEqual(['alex', 'sam']);
  });
});

describe('tab', () => {
  test('setTab', () => {
    expect(reducer(makeState(), { type: 'setTab', tab: 'history' }).tab).toBe('history');
  });
});

describe('finishBill', () => {
  test('saves the bill to history and keeps it open', () => {
    const s = reducer(withItems(), { type: 'finishBill', now: 500 });
    expect(s.history).toHaveLength(1);
    expect(s.history[0].savedAt).toBe(500);
    expect(s.history[0].people.map((p) => p.id)).toEqual(['sam', 'alex']);
    expect(s.bill).toEqual(withItems().bill);
  });

  test('finishing twice updates one entry, not two', () => {
    const s = run(withItems(), { type: 'finishBill', now: 1 }, { type: 'finishBill', now: 2 });
    expect(s.history).toHaveLength(1);
    expect(s.history[0].savedAt).toBe(2);
  });

  test('an empty bill is not saved', () => {
    expect(reducer(makeState(), { type: 'finishBill', now: 1 }).history).toEqual([]);
  });
});

describe('newBill', () => {
  test('saves the old bill, starts a fresh one and keeps the usual friends ticked', () => {
    const before = withItems();
    const s = reducer(before, { type: 'newBill', stamp: stamp(7, 777) });
    expect(s.history.map((m) => m.bill.id)).toEqual([before.bill.id]);
    expect(s.history[0].savedAt).toBe(777);
    expect(s.bill).toMatchObject({
      id: 'bill-7',
      date: '2026-10-30',
      title: '',
      items: [],
      taxC: 0,
      here: ['sam', 'alex'],
    });
    // Friends and payment details stay.
    expect(s.people).toEqual(before.people);
    expect(s.me).toEqual(before.me);
  });

  test('only friends who are still on the list stay ticked', () => {
    const s = makeState({
      people: [friend('sam')],
      bill: { here: ['sam', 'deleted'], items: [item('a', 1)] },
    });
    expect(reducer(s, { type: 'newBill', stamp: stamp() }).bill.here).toEqual(['sam']);
  });

  test('an empty bill is not saved to history, but a new one still starts', () => {
    const s = makeState({ people: [friend('sam')], bill: { here: ['sam'] } });
    const next = reducer(s, { type: 'newBill', stamp: stamp(2) });
    expect(next.history).toEqual([]);
    expect(next.bill.id).toBe('bill-2');
    expect(next.bill.here).toEqual(['sam']);
  });

  test('history stays capped at 20 across many bills', () => {
    let s = makeState({ people: [friend('sam')] });
    for (let n = 1; n <= 25; n++) {
      s = reducer(
        { ...s, bill: { ...s.bill, items: [item(`i${n}`, 100 * n)] } },
        { type: 'newBill', stamp: stamp(n) },
      );
    }
    expect(s.history).toHaveLength(20);
    expect(s.history[0].savedAt).toBe(25_000);
  });
});

describe('duplicateMeal', () => {
  const past = () => ({
    ...meal('old', 100, [item('x', 1200, ['sam', ME]), item('y', 300, ['kim'])]),
    people: [friend('sam', 'Sam'), friend('kim', 'Kim')],
  });

  test('copies the meal into a new bill with a new id and today’s date, on the Receipt tab', () => {
    const base = makeState({ people: [friend('sam', 'Sam')], tab: 'history' });
    const s = reducer(
      { ...base, history: [past()] },
      { type: 'duplicateMeal', billId: 'old', stamp: stamp(3) },
    );
    expect(s.bill.id).toBe('bill-3');
    expect(s.bill.date).toBe('2026-10-30');
    expect(s.bill.items.map((i) => i.name)).toEqual(['x', 'y']);
    expect(s.tab).toBe('receipt');
    // The original stays in history, untouched.
    expect(s.history.find((m) => m.bill.id === 'old')?.bill.id).toBe('old');
  });

  test('brings back a friend who was deleted since, so no item points at nobody', () => {
    const base = makeState({ people: [friend('sam', 'Sam')] });
    const s = reducer(
      { ...base, history: [past()] },
      { type: 'duplicateMeal', billId: 'old', stamp: stamp() },
    );
    expect(s.people.map((p) => p.id)).toEqual(['sam', 'kim']);
  });

  test('saves the bill you were on first', () => {
    const base = withItems();
    const s = reducer(
      { ...base, history: [past()] },
      { type: 'duplicateMeal', billId: 'old', stamp: stamp(3, 900) },
    );
    expect(s.history.map((m) => m.bill.id)).toEqual([base.bill.id, 'old']);
  });

  test('an unknown meal does nothing', () => {
    const s = withItems();
    expect(reducer(s, { type: 'duplicateMeal', billId: 'nope', stamp: stamp() })).toBe(s);
  });
});

describe('import and reset', () => {
  test('importState replaces the data but keeps the tab you are on', () => {
    const incoming = makeState({ me: { name: 'Imported', venmo: '', contact: '' }, tab: 'split' });
    const s = reducer(makeState({ tab: 'history' }), { type: 'importState', state: incoming });
    expect(s.me.name).toBe('Imported');
    expect(s.tab).toBe('history');
  });

  test('resetAll goes back to a fresh app', () => {
    const fresh = defaultState({ id: 'f', today: '2026-10-30' });
    expect(reducer(withItems(), { type: 'resetAll', state: fresh })).toBe(fresh);
  });
});

describe('purity', () => {
  test('actions never mutate the previous state', () => {
    const before = withItems();
    const snapshot = structuredClone(before);
    run(
      before,
      { type: 'toggleWho', itemId: 'a', partyId: 'alex' },
      { type: 'deleteFriend', id: 'sam' },
      { type: 'newBill', stamp: stamp() },
    );
    expect(before).toEqual(snapshot);
  });
});
