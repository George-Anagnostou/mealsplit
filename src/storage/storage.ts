import { defaultState } from '../state/defaults';
import type { AppState } from '../state/types';
import { decode } from './migrate';
import { encodeEnvelope } from './transfer';

/** The one place localStorage is touched. Everything else goes through this module. */
export const KEYS = {
  /** The versioned envelope `{ version, data }`. */
  main: 'mealsplit',
  /** The old unversioned shape. Read once to migrate, then left alone as a rollback copy. */
  legacy: 'mealsplit.v1',
  /** The last data we couldn't use, kept so nothing is silently thrown away. */
  backup: 'mealsplit.backup',
} as const;

/** The slice of the Web Storage API we use, so tests can swap in a fake. */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage, or null where even reading it throws (some privacy modes). */
export function browserStorage(): KV | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export type LoadIssue = ({ kind: 'corrupt' } | { kind: 'future'; version: number }) & {
  /** Whether a copy of the unusable data was kept (it may not be, if storage is full). */
  backedUp: boolean;
};

export interface LoadResult {
  state: AppState;
  /** Set when saved data couldn't be used; a backup was kept and the app starts fresh. */
  issue: LoadIssue | null;
  /** The version the data was upgraded from, when it was upgraded. */
  migratedFrom: number | null;
}

export type SaveFailure = 'full' | 'unavailable';
export type SaveResult = { ok: true } | { ok: false; reason: SaveFailure };

export interface Backup {
  at: string;
  reason: string;
  raw: string;
}

const isQuota = (e: unknown): boolean =>
  e instanceof Error &&
  (e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(e.message));

export interface Storage {
  load(): LoadResult;
  save(state: AppState): SaveResult;
  /** Remove everything we stored, including the backup. */
  clear(): boolean;
  readBackup(): Backup | null;
}

export function createStorage(
  kv: KV | null = browserStorage(),
  now: () => Date = () => new Date(),
): Storage {
  const read = (key: string): string | null => {
    try {
      return kv?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  const keepBackup = (raw: string, reason: string): boolean => {
    try {
      const backup: Backup = { at: now().toISOString(), reason, raw };
      if (!kv) return false;
      kv.setItem(KEYS.backup, JSON.stringify(backup));
      return true;
    } catch {
      return false; // nowhere to put it; carry on
    }
  };

  return {
    load() {
      const fresh = (issue: LoadIssue | null): LoadResult => ({
        state: defaultState(),
        issue,
        migratedFrom: null,
      });
      const text = read(KEYS.main) || read(KEYS.legacy);
      if (!text) return fresh(null);
      const d = decode(text);
      if (d.kind === 'ok') {
        return {
          state: d.state,
          issue: null,
          migratedFrom: d.fromVersion < 2 ? d.fromVersion : null,
        };
      }
      if (d.kind === 'future') {
        const backedUp = keepBackup(text, `saved by a newer version (${d.version})`);
        return fresh({ kind: 'future', version: d.version, backedUp });
      }
      return fresh({ kind: 'corrupt', backedUp: keepBackup(text, d.reason) });
    },

    save(state) {
      try {
        if (!kv) return { ok: false, reason: 'unavailable' };
        kv.setItem(KEYS.main, encodeEnvelope(state));
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: isQuota(e) ? 'full' : 'unavailable' };
      }
    },

    clear() {
      try {
        for (const key of Object.values(KEYS)) kv?.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },

    readBackup() {
      const text = read(KEYS.backup);
      if (!text) return null;
      try {
        const b = JSON.parse(text) as Partial<Backup>;
        return typeof b.raw === 'string'
          ? { at: String(b.at ?? ''), reason: String(b.reason ?? ''), raw: b.raw }
          : null;
      } catch {
        return null;
      }
    },
  };
}

/** The app's storage, on the browser's localStorage. */
export const storage: Storage = createStorage();
