import { describe, expect, test } from 'vitest';
import type { ParsedReceipt } from '../core/parser';
import { type Action, keptEdits, reducer, UNDO_LIMIT } from './reducer';
import { describeFields } from './selectors';
import { friend, item, makeState } from './testing';
import { type AppState, ME } from './types';

const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);
const whoOf = (s: AppState) => Object.fromEntries(s.bill.items.map((i) => [i.id, i.who]));

const table = () =>
  makeState({
    people: [friend('sam', 'Sam'), friend('alex', 'Alex')],
    bill: {
      here: ['sam', 'alex'],
      items: [item('a', 1000, ['sam']), item('b', 500), item('c', 300, ['sam', 'alex'])],
    },
  });

const parsed = (over: Partial<ParsedReceipt> = {}): ParsedReceipt =>
  ({
    items: [{ name: 'Bowl', cents: 1195, confidence: 1, reasons: [] }],
    taxC: 100,
    feesC: 200,
    discountC: 300,
    totalC: 1500,
    hasTip: false,
    tipC: 0,
    warnings: [],
    ...over,
  }) as ParsedReceipt;

describe('multi-assign', () => {
  test('toggleWhoMany adds a person to every item that lacks them', () => {
    const s = run(table(), { type: 'toggleWhoMany', itemIds: ['a', 'b'], partyId: 'alex' });
    expect(whoOf(s)).toEqual({ a: ['sam', 'alex'], b: ['alex'], c: ['sam', 'alex'] });
  });

  test('toggleWhoMany removes them only when every picked item has them', () => {
    const s = run(table(), { type: 'toggleWhoMany', itemIds: ['a', 'c'], partyId: 'sam' });
    expect(whoOf(s)).toEqual({ a: [], b: [], c: ['alex'] });
    // a is picked too but doesn't have alex, so the first tap adds rather than removes
    const mixed = run(table(), { type: 'toggleWhoMany', itemIds: ['a', 'c'], partyId: 'alex' });
    expect(whoOf(mixed)).toEqual({ a: ['sam', 'alex'], b: [], c: ['sam', 'alex'] });
  });

  test('toggleWhoMany with no matching items changes nothing and records no undo', () => {
    const before = table();
    const s = run(before, { type: 'toggleWhoMany', itemIds: ['nope'], partyId: 'sam' });
    expect(s).toBe(before);
  });

  test('setWhoMany sets exactly who had each picked item', () => {
    const s = run(table(), { type: 'setWhoMany', itemIds: ['a', 'b'], who: [ME, 'alex'] });
    expect(whoOf(s)).toEqual({ a: [ME, 'alex'], b: [ME, 'alex'], c: ['sam', 'alex'] });
    // The lists are copies, so later edits to one item can't change another.
    expect(s.bill.items[0].who).not.toBe(s.bill.items[1].who);
  });

  test('single-item toggle and set still work', () => {
    const s = run(
      table(),
      { type: 'toggleWho', itemId: 'b', partyId: 'sam' },
      { type: 'toggleWho', itemId: 'b', partyId: 'sam' },
      { type: 'toggleWho', itemId: 'b', partyId: 'alex' },
      { type: 'setWho', itemId: 'a', who: [ME] },
    );
    expect(whoOf(s)).toMatchObject({ a: [ME], b: ['alex'] });
  });
});

describe('undo', () => {
  test('puts the previous assignments back, one change at a time', () => {
    const s0 = table();
    const s1 = run(s0, { type: 'toggleWho', itemId: 'b', partyId: 'sam' });
    const s2 = run(s1, { type: 'setWhoMany', itemIds: ['a', 'b'], who: [] });
    expect(s2.undo).toHaveLength(2);
    const back1 = run(s2, { type: 'undo' });
    expect(whoOf(back1)).toEqual(whoOf(s1));
    const back2 = run(back1, { type: 'undo' });
    expect(whoOf(back2)).toEqual(whoOf(s0));
    expect(back2.undo).toEqual([]);
  });

  test('undoes assignAll, clearAssign and an everyone tap', () => {
    for (const action of [
      { type: 'assignAll', ids: ['sam', 'alex', ME] },
      { type: 'clearAssign' },
      { type: 'setWho', itemId: 'b', who: ['sam', 'alex', ME] },
    ] as Action[]) {
      const before = table();
      const after = run(before, action);
      expect(whoOf(after)).not.toEqual(whoOf(before));
      expect(whoOf(run(after, { type: 'undo' }))).toEqual(whoOf(before));
    }
  });

  test('with nothing to undo it returns the same state', () => {
    const s = table();
    expect(reducer(s, { type: 'undo' })).toBe(s);
  });

  test('a change that changes nothing adds no undo step', () => {
    const s = run(table(), { type: 'clearAssign' }, { type: 'clearAssign' });
    expect(s.undo).toHaveLength(1);
    const same = run(table(), { type: 'setWho', itemId: 'a', who: ['sam'] });
    expect(same.undo).toEqual([]);
  });

  test('keeps at most UNDO_LIMIT steps, newest first', () => {
    let s = table();
    for (let n = 0; n < UNDO_LIMIT + 5; n++) {
      s = reducer(s, { type: 'toggleWho', itemId: 'b', partyId: n % 2 ? 'sam' : 'alex' });
    }
    expect(s.undo).toHaveLength(UNDO_LIMIT);
    expect(s.undo[0].items[1].who).not.toEqual(s.bill.items[1].who);
  });

  test('editing items, amounts, people or the bill makes old snapshots stale', () => {
    const assigned = run(table(), { type: 'clearAssign' });
    expect(assigned.undo).toHaveLength(1);
    const actions: Action[] = [
      { type: 'editItem', id: 'a', patch: { cents: 1 } },
      { type: 'addItem', id: 'z' },
      { type: 'removeItem', id: 'a' },
      { type: 'money', field: 'taxC', cents: 5 },
      { type: 'tipPct', pct: 18 },
      { type: 'feesEven', value: true },
      { type: 'toggleHere', id: 'sam' },
      { type: 'addFriend', friend: friend('new') },
      { type: 'deleteFriend', id: 'sam' },
      { type: 'newBill', stamp: { id: 'n', today: '2026-10-31', now: 5 } },
    ];
    for (const a of actions) expect(reducer(assigned, a).undo, a.type).toEqual([]);
  });

  test('typing a title or switching steps keeps Undo available', () => {
    const s = run(
      table(),
      { type: 'clearAssign' },
      { type: 'meta', field: 'title', value: 'Tacos' },
      { type: 'setTab', tab: 'split' },
    );
    expect(s.undo).toHaveLength(1);
    expect(whoOf(run(s, { type: 'undo' })).a).toEqual(['sam']);
  });

  test('importing or duplicating starts with a clean slate', () => {
    const s = run(table(), { type: 'clearAssign' });
    expect(reducer(s, { type: 'importState', state: table() }).undo).toEqual([]);
  });

  test('a re-parse can be undone, and undo brings back the items, assignments and amounts', () => {
    const before = run(table(), { type: 'money', field: 'taxC', cents: 250 });
    const after = run(before, { type: 'applyParsed', parsed: parsed(), ids: ['x'] });
    expect(after.bill.items.map((i) => i.id)).toEqual(['x']);
    expect(after.undo).toEqual([before.bill]);
    expect(run(after, { type: 'undo' }).bill).toEqual(before.bill);
  });
});

describe('edit tracking', () => {
  test('typing an amount marks it edited, once', () => {
    const s = run(
      makeState(),
      { type: 'money', field: 'taxC', cents: 100 },
      { type: 'money', field: 'taxC', cents: 150 },
      { type: 'tipPct', pct: 20 },
      { type: 'tipMode', mode: 'amt' },
      { type: 'tipAmt', cents: 500 },
      { type: 'money', field: 'feesC', cents: 1 },
      { type: 'money', field: 'discountC', cents: 2 },
    );
    expect(s.bill.edited).toEqual(['taxC', 'tip', 'feesC', 'discountC']);
  });

  test('parsing fills amounts you have not touched', () => {
    const s = run(makeState(), {
      type: 'applyParsed',
      parsed: parsed({ hasTip: true, tipC: 450 }),
      ids: ['x'],
    });
    expect(s.bill).toMatchObject({
      taxC: 100,
      feesC: 200,
      discountC: 300,
      tipMode: 'amt',
      tipAmtC: 450,
      edited: [],
    });
  });

  test('parsing again keeps what you edited, and fills the rest', () => {
    const s = run(
      makeState(),
      { type: 'money', field: 'taxC', cents: 999 },
      { type: 'tipPct', pct: 18 },
      { type: 'applyParsed', parsed: parsed({ hasTip: true, tipC: 450 }), ids: ['x'] },
    );
    expect(s.bill).toMatchObject({
      taxC: 999, // kept
      feesC: 200, // filled
      discountC: 300, // filled
      tipMode: 'pct', // kept: the tip was edited
      tipPct: 18,
      parsedTotalC: 1500, // always follows the receipt
      edited: ['taxC', 'tip'],
    });
    expect(s.bill.items).toHaveLength(1);
  });

  test('overwrite takes everything from the receipt and forgets the edits', () => {
    const s = run(
      makeState(),
      { type: 'money', field: 'feesC', cents: 999 },
      { type: 'applyParsed', parsed: parsed(), ids: ['x'], overwrite: true },
    );
    expect(s.bill).toMatchObject({ feesC: 200, edited: [] });
  });

  test('forgetEdits lets the next parse fill everything', () => {
    const s = run(
      makeState(),
      { type: 'money', field: 'taxC', cents: 999 },
      { type: 'forgetEdits' },
      { type: 'applyParsed', parsed: parsed(), ids: ['x'] },
    );
    expect(s.bill).toMatchObject({ taxC: 100, edited: [] });
  });

  test('a new bill starts with nothing edited', () => {
    const s = run(
      makeState(),
      { type: 'money', field: 'taxC', cents: 999 },
      { type: 'newBill', stamp: { id: 'n', today: '2026-10-31', now: 5 } },
    );
    expect(s.bill.edited).toEqual([]);
  });

  test('keptEdits lists only edits the parse would have changed', () => {
    const s = run(
      makeState(),
      { type: 'money', field: 'taxC', cents: 100 }, // same as the receipt
      { type: 'money', field: 'feesC', cents: 5 }, // different
      { type: 'tipPct', pct: 18 }, // receipt has no tip
    );
    expect(keptEdits(s.bill, parsed())).toEqual(['feesC']);
    expect(keptEdits(s.bill, parsed({ hasTip: true, tipC: 450 }))).toEqual(['feesC', 'tip']);
    const same = run(
      s,
      { type: 'tipMode', mode: 'amt' },
      { type: 'tipAmt', cents: 450 },
      { type: 'money', field: 'discountC', cents: 7 },
    );
    expect(keptEdits(same.bill, parsed({ hasTip: true, tipC: 450 }))).toEqual([
      'feesC',
      'discountC',
    ]);
  });

  test('describeFields reads as a list', () => {
    expect(describeFields([])).toBe('');
    expect(describeFields(['taxC'])).toBe('tax');
    expect(describeFields(['taxC', 'tip'])).toBe('tax and tip');
    expect(describeFields(['taxC', 'feesC', 'discountC', 'tip'])).toBe(
      'tax, fees, discount and tip',
    );
  });
});
