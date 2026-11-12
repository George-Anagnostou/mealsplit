import { describe, expect, test } from 'vitest';
import { ME } from '../state/types';
import corruptTruncated from './__fixtures__/corrupt-truncated.json?raw';
import future from './__fixtures__/future.json?raw';
import v1Full from './__fixtures__/v1-full.json?raw';
import v1MeMissing from './__fixtures__/v1-me-missing-keys.json?raw';
import v1Sparse from './__fixtures__/v1-sparse-bill.json?raw';
import v2Full from './__fixtures__/v2-full.json?raw';
import { CURRENT_VERSION, decode, migrate, normalizeState } from './migrate';

/** Deterministic ids for anything missing one. */
const mkCtx = () => {
  let n = 0;
  return { makeId: () => `gen${++n}`, today: '2026-10-30' };
};

const ok = (text: string) => {
  const d = decode(text, mkCtx());
  if (d.kind !== 'ok') throw new Error(`expected ok, got ${d.kind}`);
  return d;
};

/** Nothing in a state may be undefined, null or NaN (the one allowed null is parsedTotalC). */
function expectComplete(value: unknown, path = 'state'): void {
  const bad =
    value === undefined ||
    (value === null && !path.endsWith('parsedTotalC')) ||
    Number.isNaN(value);
  if (bad) throw new Error(`${path} is ${String(value)}`);
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) expectComplete(v, `${path}[${i}]`);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) expectComplete(v, `${path}.${k}`);
  }
}

describe('v1 -> v2 migration', () => {
  test('a full v1 save keeps everything and gains the v2 fields', () => {
    const d = ok(v1Full);
    expect(d.fromVersion).toBe(1);
    const s = d.state;
    expect(s.me).toEqual({ name: 'George', venmo: 'george-a', contact: '555-010-0100' });
    expect(s.people).toEqual([
      { id: 'sam1', name: 'Sam', venmo: 'sam-w', contact: '(555) 123-4567' },
      { id: 'alex2', name: 'Alex', venmo: '', contact: 'alex@example.com' },
    ]);
    expect(s.bill).toMatchObject({
      title: 'Burritos',
      date: '2026-10-12',
      taxC: 362,
      feesC: 639,
      discountC: 500,
      tipMode: 'amt',
      tipAmtC: 500,
      feesEven: true,
      here: ['sam1', 'alex2'],
      parsedTotalC: 4980,
    });
    expect(s.bill.items.map((i) => i.who)).toEqual([['sam1'], ['sam1', 'alex2', ME], []]);
    // New in v2:
    expect(s.bill.id).toBeTruthy();
    expect(s.history).toEqual([]);
    expect(s.tab).toBe('receipt');
    expectComplete(s);
  });

  test('an old `me` missing keys never shows "undefined"', () => {
    const s = ok(v1MeMissing).state;
    expect(s.me).toEqual({ name: 'Georgie', venmo: '', contact: '' });
    expect(s.people).toEqual([{ id: 'p1', name: 'Sam', venmo: '', contact: '' }]);
    expectComplete(s);
    // And a `me` that is missing, null or the wrong type falls back to the defaults.
    for (const me of [undefined, null, 'x', 5, []]) {
      expect(normalizeState({ me }, mkCtx()).me).toEqual({
        name: 'George',
        venmo: '',
        contact: '',
      });
    }
  });

  test('a sparse, badly typed bill is repaired key by key', () => {
    const s = ok(v1Sparse).state;
    expectComplete(s);
    // Friends: the non-object is dropped, a missing id is generated, a duplicate id is replaced.
    expect(s.people).toHaveLength(3);
    expect(s.people[0]).toEqual({ id: 'p1', name: 'Sam', venmo: '', contact: '' });
    expect(new Set(s.people.map((p) => p.id)).size).toBe(3);
    expect(s.people.every((p) => p.id)).toBe(true);
    const b = s.bill;
    expect(b.title).toBe('');
    expect(b.date).toBe('2026-10-30'); // "last tuesday" is not a date
    expect(b.taxC).toBe(0);
    expect(b.tipMode).toBe('pct');
    expect(b.tipPct).toBe(0); // "20" (a string) is not trusted
    expect(b.parsedTotalC).toBeNull();
    expect(b.here).toEqual(['p1']); // unknown friends dropped
    expect(b.items).toHaveLength(3); // the bare 42 is dropped
    expect(b.items[0]).toMatchObject({ name: 'No id or price', cents: 0, who: [] });
    expect(b.items[1]).toMatchObject({ id: 'x', name: 'Fish', cents: 0, who: ['p1', ME] });
    expect(b.items[2].cents).toBe(0); // negative price is not allowed
    expect(b.items[2].who).toEqual([]);
    expect(new Set(b.items.map((i) => i.id)).size).toBe(3);
  });

  test('an empty object is not mealsplit data, but an empty `me`/`people`/`bill` is', () => {
    expect(decode('{}', mkCtx()).kind).toBe('corrupt');
    expect(decode('{"people": []}', mkCtx()).kind).toBe('ok');
  });

  test('migrate() upgrades step by step and leaves current data alone', () => {
    const out = migrate(1, { me: {}, bill: { title: 'x' } }, mkCtx());
    expect(out).toMatchObject({ history: [], tab: 'receipt', bill: { title: 'x', id: 'gen1' } });
    expect(migrate(CURRENT_VERSION, { a: 1 }, mkCtx())).toEqual({ a: 1 });
    // A v1 file with no bill at all still gets one.
    expect(migrate(1, {}, mkCtx())).toMatchObject({ bill: { id: 'gen1' } });
  });
});

describe('v2 data', () => {
  test('is read as it is, with history and tab', () => {
    const d = ok(v2Full);
    expect(d.fromVersion).toBe(2);
    expect(d.state.tab).toBe('split');
    expect(d.state.bill.id).toBe('b-now');
    expect(d.state.history).toHaveLength(1);
    expect(d.state.history[0].bill.items[0].name).toBe('Al pastor');
    expect(d.state.history[0].people[0].name).toBe('Sam');
  });

  test('history is sorted newest first, deduped by bill id, capped at 20, and drops empty bills', () => {
    const meal = (id: string, savedAt: number, items = 1) => ({
      savedAt,
      people: [],
      bill: {
        id,
        items: Array.from({ length: items }, (_, n) => ({
          id: `${id}-${n}`,
          name: 'x',
          cents: 100,
        })),
      },
    });
    const history = [
      ...Array.from({ length: 25 }, (_, n) => meal(`m${n}`, 1000 + n)),
      meal('m3', 5), // older duplicate of m3
      meal('empty', 9999, 0),
    ];
    const s = normalizeState({ history }, mkCtx());
    expect(s.history).toHaveLength(20);
    expect(s.history[0].bill.id).toBe('m24');
    expect(s.history[19].bill.id).toBe('m5');
    expect(s.history.some((m) => m.bill.id === 'empty')).toBe(false);
    const dup = normalizeState({ history: [meal('a', 1), meal('a', 2)] }, mkCtx());
    expect(dup.history.map((m) => m.savedAt)).toEqual([2]);
  });

  test('an unknown tab falls back to receipt', () => {
    expect(normalizeState({ tab: 'nope' }, mkCtx()).tab).toBe('receipt');
    expect(normalizeState({ tab: 'history' }, mkCtx()).tab).toBe('history');
  });

  test('a bad history entry cannot take the app down', () => {
    const s = normalizeState(
      { history: [null, 3, 'x', { bill: 7 }, { savedAt: 'soon' }] },
      mkCtx(),
    );
    expect(s.history).toEqual([]);
  });
});

describe('unusable data never throws', () => {
  test('corrupt JSON', () => {
    const d = decode(corruptTruncated, mkCtx());
    expect(d).toEqual({ kind: 'corrupt', reason: 'Not valid JSON.' });
  });

  test.each([
    '',
    'null',
    '[]',
    '"hi"',
    '42',
    'true',
    '{"version":"2","data":{}}',
    '{"version":0,"data":{}}',
    '{"version":1.5,"data":{}}',
    '{"version":2}',
    '{"version":2,"data":[]}',
    '{"version":2,"data":"x"}',
  ])('not usable: %s', (text) => {
    expect(decode(text, mkCtx()).kind).toBe('corrupt');
  });

  test('a file from another app is refused', () => {
    expect(decode('{"app":"other","version":2,"data":{}}', mkCtx()).kind).toBe('corrupt');
    expect(decode('{"app":"mealsplit","version":2,"data":{}}', mkCtx()).kind).toBe('ok');
  });

  test('a future version is reported, not guessed at', () => {
    expect(decode(future, mkCtx())).toEqual({ kind: 'future', version: 99 });
    expect(decode(`{"version":${CURRENT_VERSION + 1},"data":{}}`, mkCtx())).toEqual({
      kind: 'future',
      version: CURRENT_VERSION + 1,
    });
  });

  test('default context works too (real ids and today)', () => {
    const d = decode(v1Full);
    expect(d.kind).toBe('ok');
    expect(normalizeState(null).bill.id).toBeTruthy();
  });
});
