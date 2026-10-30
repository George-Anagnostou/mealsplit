import { describe, expect, test } from 'vitest';
import { defaultState } from '../state/defaults';
import { type AppState, ME } from '../state/types';
import corruptTruncated from './__fixtures__/corrupt-truncated.json?raw';
import future from './__fixtures__/future.json?raw';
import v1Full from './__fixtures__/v1-full.json?raw';
import { CURRENT_VERSION } from './migrate';
import { browserStorage, createStorage, KEYS, type KV } from './storage';

/** An in-memory stand-in for localStorage. */
function fakeKV(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const kv: KV = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
  return { kv, data };
}

const throwing = (name: string, message = 'boom'): KV => ({
  getItem: () => null,
  setItem: () => {
    const e = new Error(message);
    e.name = name;
    throw e;
  },
  removeItem: () => {
    throw new Error('nope');
  },
});

const sample = (): AppState => ({
  ...defaultState({ id: 'b1', today: '2026-10-30' }),
  me: { name: 'George', venmo: 'g', contact: '555-0100' },
  people: [{ id: 'sam1', name: 'Sam', venmo: 'sam', contact: '' }],
});

describe('load', () => {
  test('nothing saved: a fresh app, no issue', () => {
    const r = createStorage(fakeKV().kv).load();
    expect(r.issue).toBeNull();
    expect(r.migratedFrom).toBeNull();
    expect(r.state.people).toEqual([]);
  });

  test('save then load round-trips the whole state, including history and tab', () => {
    const { kv, data } = fakeKV();
    const s = createStorage(kv);
    const state: AppState = { ...sample(), tab: 'history' };
    expect(s.save(state)).toEqual({ ok: true });
    expect(JSON.parse(data.get(KEYS.main) ?? '').version).toBe(CURRENT_VERSION);
    expect(s.load().state).toEqual(state);
  });

  test('old v1 data is migrated, and the original is left in place as a rollback copy', () => {
    const { kv, data } = fakeKV({ [KEYS.legacy]: v1Full });
    const r = createStorage(kv).load();
    expect(r.migratedFrom).toBe(1);
    expect(r.issue).toBeNull();
    expect(r.state.people.map((p) => p.name)).toEqual(['Sam', 'Alex']);
    expect(r.state.bill.items.map((i) => i.who.includes(ME))).toEqual([false, true, false]);
    expect(data.get(KEYS.legacy)).toBe(v1Full);
  });

  test('once v2 exists, the old v1 copy is ignored', () => {
    const { kv } = fakeKV({ [KEYS.legacy]: v1Full });
    const s = createStorage(kv);
    s.save(sample());
    const r = s.load();
    expect(r.migratedFrom).toBeNull();
    expect(r.state.people.map((p) => p.name)).toEqual(['Sam']);
  });

  test('corrupt data: backed up, app starts fresh, issue reported', () => {
    const { kv, data } = fakeKV({ [KEYS.main]: corruptTruncated });
    const s = createStorage(kv, () => new Date('2026-10-30T12:00:00Z'));
    const r = s.load();
    expect(r.issue).toEqual({ kind: 'corrupt', backedUp: true });
    expect(r.state.people).toEqual([]);
    expect(s.readBackup()).toEqual({
      at: '2026-10-30T12:00:00.000Z',
      reason: 'Not valid JSON.',
      raw: corruptTruncated,
    });
    // The bad data is not deleted by loading.
    expect(data.get(KEYS.main)).toBe(corruptTruncated);
  });

  test('corrupt legacy data is handled the same way', () => {
    const { kv } = fakeKV({ [KEYS.legacy]: '[1,2' });
    const s = createStorage(kv);
    expect(s.load().issue).toEqual({ kind: 'corrupt', backedUp: true });
    expect(s.readBackup()?.raw).toBe('[1,2');
  });

  test('data from a newer version: backed up, not overwritten without a trace', () => {
    const { kv } = fakeKV({ [KEYS.main]: future });
    const s = createStorage(kv);
    const r = s.load();
    expect(r.issue).toEqual({ kind: 'future', version: 99, backedUp: true });
    expect(s.readBackup()?.raw).toBe(future);
    expect(s.readBackup()?.reason).toMatch(/newer version \(99\)/);
  });

  test('if the backup itself cannot be written, the issue says so', () => {
    const kv: KV = {
      ...fakeKV({ [KEYS.main]: '{oops' }).kv,
      setItem: throwing('QuotaExceededError').setItem,
    };
    expect(createStorage(kv).load().issue).toEqual({ kind: 'corrupt', backedUp: false });
    // Same with no storage object at all.
    expect(createStorage(null).load().issue).toBeNull();
  });

  test('reading that throws is treated as empty, never a crash', () => {
    const kv: KV = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const r = createStorage(kv).load();
    expect(r.issue).toBeNull();
    expect(r.state.people).toEqual([]);
  });

  test('an empty string counts as nothing saved', () => {
    expect(createStorage(fakeKV({ [KEYS.main]: '' }).kv).load().issue).toBeNull();
  });
});

describe('save failures are reported, not thrown', () => {
  test('quota exceeded -> full', () => {
    expect(createStorage(throwing('QuotaExceededError')).save(sample())).toEqual({
      ok: false,
      reason: 'full',
    });
    expect(createStorage(throwing('NS_ERROR_DOM_QUOTA_REACHED')).save(sample())).toEqual({
      ok: false,
      reason: 'full',
    });
    expect(createStorage(throwing('Error', 'The quota has been exceeded')).save(sample())).toEqual({
      ok: false,
      reason: 'full',
    });
  });

  test('private mode / blocked -> unavailable', () => {
    expect(createStorage(throwing('SecurityError')).save(sample())).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    const odd: KV = {
      getItem: () => null,
      setItem: () => {
        throw 'a string, not an Error';
      },
      removeItem: () => {},
    };
    expect(createStorage(odd).save(sample())).toEqual({ ok: false, reason: 'unavailable' });
  });

  test('no storage at all -> unavailable', () => {
    expect(createStorage(null).save(sample())).toEqual({ ok: false, reason: 'unavailable' });
  });

  test('recovers: a later save succeeds when storage works again', () => {
    let failing = true;
    const { kv } = fakeKV();
    const flaky: KV = {
      ...kv,
      setItem: (k, v) => {
        if (failing) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
        kv.setItem(k, v);
      },
    };
    const s = createStorage(flaky);
    expect(s.save(sample()).ok).toBe(false);
    failing = false;
    expect(s.save(sample()).ok).toBe(true);
    expect(s.load().state.people).toHaveLength(1);
  });
});

describe('clear and backup', () => {
  test('clear removes the data, the old v1 copy and the backup', () => {
    const { kv, data } = fakeKV({ [KEYS.legacy]: v1Full, [KEYS.backup]: '{"raw":"x"}' });
    const s = createStorage(kv);
    s.save(sample());
    expect(s.clear()).toBe(true);
    expect(data.size).toBe(0);
    expect(s.load().state.people).toEqual([]);
  });

  test('clear reports failure instead of throwing', () => {
    expect(createStorage(throwing('SecurityError')).clear()).toBe(false);
    expect(createStorage(null).clear()).toBe(true);
  });

  test('readBackup tolerates junk', () => {
    for (const junk of ['', 'not json', '{"at":1}', 'null']) {
      expect(createStorage(fakeKV({ [KEYS.backup]: junk }).kv).readBackup()).toBeNull();
    }
    expect(createStorage(fakeKV({ [KEYS.backup]: '{"raw":"x"}' }).kv).readBackup()).toEqual({
      at: '',
      reason: '',
      raw: 'x',
    });
  });
});

describe('browserStorage', () => {
  test('returns null outside a browser, or where access throws', () => {
    expect(browserStorage()).toBeNull(); // vitest runs in node: no localStorage
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      expect(browserStorage()).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
