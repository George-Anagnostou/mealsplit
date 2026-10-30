import { describe, expect, test } from 'vitest';
import { defaultState } from '../state/defaults';
import type { AppState } from '../state/types';
import future from './__fixtures__/future.json?raw';
import v1Full from './__fixtures__/v1-full.json?raw';
import v2Full from './__fixtures__/v2-full.json?raw';
import { CURRENT_VERSION, decode } from './migrate';
import { buildExport, describeImport, encodeEnvelope, parseImport } from './transfer';

const ctx = () => {
  let n = 0;
  return { makeId: () => `gen${++n}`, today: '2026-10-30' };
};

const full = (): AppState => {
  const d = decode(v2Full, ctx());
  if (d.kind !== 'ok') throw new Error('fixture');
  return d.state;
};

describe('export / import', () => {
  test('round trip: exporting then importing gives back the same data', () => {
    const state = full();
    const file = buildExport(state, new Date('2026-10-30T20:00:00Z'));
    expect(file.filename).toBe('mealsplit-2026-10-30.json');
    expect(file.mimeType).toBe('application/json');
    const r = parseImport(file.text, ctx());
    if (!r.ok) throw new Error(r.error);
    // The tab is where you were, not data, so it is not exported.
    expect(r.state).toEqual({ ...state, tab: 'receipt' });
  });

  test('the file is readable JSON that says what it is', () => {
    const file = buildExport(full(), new Date('2026-10-30T20:00:00Z'));
    const j = JSON.parse(file.text);
    expect(j).toMatchObject({
      app: 'mealsplit',
      version: CURRENT_VERSION,
      exportedAt: '2026-10-30T20:00:00.000Z',
    });
    expect(Object.keys(j.data).sort()).toEqual(['bill', 'history', 'me', 'people']);
    expect(file.text).toContain('\n'); // pretty-printed
  });

  test('the default export date is today', () => {
    expect(buildExport(defaultState()).filename).toMatch(/^mealsplit-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('the storage envelope round-trips too, tab included', () => {
    const state = full();
    const d = decode(encodeEnvelope(state), ctx());
    expect(d.kind === 'ok' && d.state).toEqual(state);
  });

  test('importing an old v1 file migrates it', () => {
    const r = parseImport(v1Full, ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.people).toHaveLength(2);
    expect(r.state.history).toEqual([]);
    expect(r.summary).toBe('2 friends, 0 past meals and a bill with 3 items (Oct 12, 2026)');
  });

  test('the default context works', () => {
    expect(parseImport(v1Full).ok).toBe(true);
  });

  test.each([
    ['not json', 'Not valid JSON'],
    ['{}', 'Not a mealsplit data file'],
    ['[1]', 'Not a mealsplit data file'],
    ['{"app":"budgeter","version":2,"data":{}}', 'different app'],
    ['{"version":2}', 'no data'],
  ])('rejects %s with a clear message', (text, message) => {
    const r = parseImport(text);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('can’t be imported');
      expect(r.error).toContain(message);
    }
  });

  test('rejects a file from a newer version and says so', () => {
    const r = parseImport(future);
    expect(r).toEqual({
      ok: false,
      error: expect.stringContaining('newer version of mealsplit (data version 99)'),
    });
  });

  test('describeImport reads naturally, singular and plural', () => {
    const s = full();
    expect(describeImport(s)).toBe('1 friend, 1 past meal and a bill with 1 item (Oct 30, 2026)');
    expect(describeImport({ ...s, history: [], people: [], bill: { ...s.bill, items: [] } })).toBe(
      '0 friends, 0 past meals and an empty bill',
    );
  });
});
