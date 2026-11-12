import { describe, expect, test } from 'vitest';
import {
  billTotals,
  friendFromInput,
  mealState,
  mealSummary,
  nameOf,
  partiesOf,
  presentWho,
  prettyDate,
  splitSummary,
} from './selectors';
import { friend, item, makeState } from './testing';
import { ME } from './types';

const dinner = () =>
  makeState({
    me: { name: 'George', venmo: '', contact: '' },
    people: [friend('sam', 'Sam', 'sam-w'), friend('alex', 'Alex')],
    bill: {
      title: 'Burritos',
      date: '2026-10-12',
      items: [item('a', 2000, ['sam']), item('b', 1000, [ME, 'sam']), item('c', 500, [])],
      taxC: 350,
      tipMode: 'pct',
      tipPct: 20,
      here: ['sam'],
    },
  });

describe('parties', () => {
  test('me first, then the people ticked as here', () => {
    expect(partiesOf(dinner()).map((p) => p.id)).toEqual([ME, 'sam']);
    expect(
      partiesOf(makeState({ me: { name: '', venmo: '', contact: '' } })).map((p) => p.name),
    ).toEqual(['Me']);
  });
  test('names, with fallbacks', () => {
    const s = dinner();
    expect(nameOf(s, ME)).toBe('George');
    expect(nameOf(s, 'sam')).toBe('Sam');
    expect(nameOf(s, 'ghost')).toBe('?');
    expect(nameOf({ ...s, me: { ...s.me, name: '' } }, ME)).toBe('Me');
  });
  test('only present people count as assignees', () => {
    expect(presentWho(dinner().bill, ['sam', 'alex', ME])).toEqual(['sam', ME]);
  });
});

describe('billTotals', () => {
  test('subtotal, tip, total', () => {
    const t = billTotals(dinner().bill);
    expect(t.subtotalC).toBe(3500);
    expect(t.tipC).toBe(700);
    expect(t.totalC).toBe(3500 + 350 + 700);
    expect(t.discountC).toBe(0);
    expect(t.discountNotice).toBeNull();
    expect(t.receiptDiffC).toBeNull();
  });
  test('compares with the receipt total when there is one', () => {
    const b = { ...dinner().bill, parsedTotalC: 4500 };
    expect(billTotals(b).receiptDiffC).toBe(50);
  });
  test('a discount bigger than the subtotal is capped, with a notice', () => {
    const b = { ...dinner().bill, discountC: 99_999 };
    const t = billTotals(b);
    expect(t.discountC).toBe(3500);
    expect(t.discountNotice).toBeTruthy();
  });
});

describe('splitSummary', () => {
  test('gathers everything the Split tab shows', () => {
    const r = splitSummary(dinner());
    expect(r.meName).toBe('George');
    expect(r.note).toContain('Burritos');
    expect(r.friends.map((f) => f.party.id)).toEqual(['sam']);
    expect(r.friends[0].friend?.venmo).toBe('sam-w');
    expect(r.meTotals).toBeDefined();
    expect(r.unassigned?.itemsC).toBe(500);
    expect(r.recon).toBeDefined();
    const total =
      (r.meTotals?.totalC ?? 0) +
      (r.unassigned?.totalC ?? 0) +
      r.friends.reduce((a, f) => a + f.totals.totalC, 0);
    expect(total).toBe(r.result.totalC);
  });
  test('a friend with no share is left out, and an empty name falls back to Me', () => {
    const s = makeState({
      me: { name: '', venmo: '', contact: '' },
      people: [friend('sam')],
      bill: { here: ['sam'], items: [item('a', 100, [ME])] },
    });
    const r = splitSummary(s);
    expect(r.friends).toEqual([]);
    expect(r.meName).toBe('Me');
    expect(r.unassigned).toBeUndefined();
  });
});

describe('friendFromInput', () => {
  test('trims and cleans the Venmo name', () => {
    expect(friendFromInput('x', { name: '  Sam ', venmo: ' @sam-w ', contact: ' 555 ' })).toEqual({
      id: 'x',
      name: 'Sam',
      venmo: 'sam-w',
      contact: '555',
    });
  });
  test('needs a name', () => {
    expect(friendFromInput('x', { name: '   ', venmo: 'a', contact: '' })).toBeNull();
  });
});

describe('prettyDate', () => {
  test('formats ISO dates the same everywhere (no time zone drift)', () => {
    expect(prettyDate('2026-10-30')).toBe('Oct 30, 2026');
    expect(prettyDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(prettyDate('2026-12-31')).toBe('Dec 31, 2026');
  });
  test('anything else comes back as it is', () => {
    expect(prettyDate('')).toBe('');
    expect(prettyDate('yesterday')).toBe('yesterday');
    expect(prettyDate('2026-13-45')).toBe('2026-13-45');
    expect(prettyDate('2026-02-31')).toBe('2026-02-31');
  });
});

describe('meals', () => {
  const m = () => ({
    savedAt: 1,
    people: [friend('sam', 'Sam')],
    bill: { ...dinner().bill, id: 'old' },
  });
  test('a summary has a label, date, total and people (you first)', () => {
    expect(mealSummary(m(), 'George')).toEqual({
      id: 'old',
      date: '2026-10-12',
      label: 'Burritos',
      totalC: 4550,
      people: ['George', 'Sam'],
    });
  });
  test('the label falls back to the first named item, then "Meal"', () => {
    const base = m();
    const untitled = {
      ...base,
      bill: {
        ...base.bill,
        title: '  ',
        items: [item('a', 1, [], ' '), item('b', 1, [], ' Tacos ')],
      },
    };
    expect(mealSummary(untitled, 'G').label).toBe('Tacos');
    expect(mealSummary({ ...base, bill: { ...base.bill, title: '', items: [] } }, '').label).toBe(
      'Meal',
    );
    expect(mealSummary({ ...base, people: [friend('x', '')] }, '').people).toEqual(['Me', '?']);
  });
  test('mealState shows a past meal with your current payment details', () => {
    const s = { ...dinner(), me: { name: 'George', venmo: 'new-handle', contact: '' } };
    const view = mealState(s, m());
    expect(view.bill.id).toBe('old');
    expect(view.people.map((p) => p.id)).toEqual(['sam']);
    expect(view.me.venmo).toBe('new-handle');
  });
});
