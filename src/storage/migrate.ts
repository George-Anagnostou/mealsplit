import { defaultState, newBill } from '../state/defaults';
import { HISTORY_LIMIT } from '../state/history';
import { todayISO, uid } from '../state/ids';
import { type AppState, type Bill, type Friend, ME, type Meal, TABS } from '../state/types';

/** Bump this when the saved shape changes, and add a migration from the old version. */
export const CURRENT_VERSION = 2;

export interface Ctx {
  /** Makes an id for anything that arrives without one. Injectable so tests are deterministic. */
  makeId: () => string;
  today: string;
}

const defaultCtx = (): Ctx => ({ makeId: uid, today: todayISO() });

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

// Small total coercions: whatever is in storage, we get back a value of the right type.
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const cents = (v: unknown): number => Math.max(0, Math.round(num(v)));
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
const objects = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObj) : []);
const isoDate = (v: unknown, d: string): string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d;

/** An id that is non-empty and not yet used. */
function freshId(v: unknown, seen: Set<string>, ctx: Ctx): string {
  let id = typeof v === 'string' && v ? v : ctx.makeId();
  while (seen.has(id) || id === ME) id = ctx.makeId();
  seen.add(id);
  return id;
}

function friends(v: unknown, ctx: Ctx): Friend[] {
  const seen = new Set<string>();
  return objects(v).map((f) => ({
    id: freshId(f.id, seen, ctx),
    name: str(f.name),
    venmo: str(f.venmo),
    contact: str(f.contact),
  }));
}

/** Fill a bill from untrusted data, key by key, over the defaults. */
function bill(v: unknown, people: Friend[], ctx: Ctx): Bill {
  const src = isObj(v) ? v : {};
  const d = newBill({ id: ctx.makeId(), today: ctx.today });
  const ids = new Set(people.map((p) => p.id));
  const seen = new Set<string>();
  return {
    id: str(src.id) || d.id,
    title: str(src.title),
    date: isoDate(src.date, d.date),
    raw: str(src.raw),
    items: objects(src.items).map((it) => ({
      id: freshId(it.id, seen, ctx),
      name: str(it.name),
      cents: cents(it.cents),
      who: strings(it.who).filter((w) => w === ME || ids.has(w)),
    })),
    taxC: cents(src.taxC),
    feesC: cents(src.feesC),
    discountC: cents(src.discountC),
    tipMode: src.tipMode === 'amt' ? 'amt' : 'pct',
    tipPct: Math.max(0, num(src.tipPct)),
    tipAmtC: cents(src.tipAmtC),
    feesEven: src.feesEven === true,
    here: strings(src.here).filter((id) => ids.has(id)),
    parsedTotalC:
      typeof src.parsedTotalC === 'number' && Number.isFinite(src.parsedTotalC)
        ? src.parsedTotalC
        : null,
  };
}

function history(v: unknown, ctx: Ctx): Meal[] {
  const seen = new Set<string>();
  return objects(v)
    .map((m): Meal => {
      const people = friends(m.people, ctx);
      return { savedAt: num(m.savedAt), bill: bill(m.bill, people, ctx), people };
    })
    .filter((m) => m.bill.items.length > 0)
    .sort((a, b) => b.savedAt - a.savedAt)
    .filter((m) => !seen.has(m.bill.id) && !!seen.add(m.bill.id))
    .slice(0, HISTORY_LIMIT);
}

/**
 * Turn any saved data into a complete, valid AppState: a deep merge over the defaults, so a
 * missing or wrong-typed key falls back to its default instead of showing as "undefined".
 */
export function normalizeState(raw: unknown, ctx: Ctx = defaultCtx()): AppState {
  const src = isObj(raw) ? raw : {};
  const base = defaultState({ id: ctx.makeId(), today: ctx.today });
  const me = isObj(src.me) ? src.me : {};
  const people = friends(src.people, ctx);
  return {
    me: {
      name: str(me.name, base.me.name),
      venmo: str(me.venmo),
      contact: str(me.contact),
    },
    people,
    bill: bill(src.bill, people, ctx),
    history: history(src.history, ctx),
    tab: TABS.find((t) => t === src.tab) ?? base.tab,
  };
}

/** Each step upgrades data saved by version N to version N + 1. */
const MIGRATIONS: Record<number, (data: Json, ctx: Ctx) => Json> = {
  // v1 (the unversioned `mealsplit.v1` blob) had { me, people, bill }.
  // v2 adds a bill id, the meal history, and the remembered tab.
  1: (d, ctx) => ({
    ...d,
    bill: { ...(isObj(d.bill) ? d.bill : {}), id: ctx.makeId() },
    history: [],
    tab: 'receipt',
  }),
};

/** Upgrade `data` from `from` to the current version. */
export function migrate(from: number, data: Json, ctx: Ctx = defaultCtx()): Json {
  let out = data;
  for (let v = from; v < CURRENT_VERSION; v++) out = MIGRATIONS[v](out, ctx);
  return out;
}

export type Decoded =
  | { kind: 'ok'; state: AppState; fromVersion: number }
  | { kind: 'corrupt'; reason: string }
  | { kind: 'future'; version: number };

const looksLikeV1 = (o: Json): boolean => isObj(o.me) || Array.isArray(o.people) || isObj(o.bill);

/**
 * Read saved or imported text: a `{ version, data }` envelope, or the old unversioned v1 shape.
 * Never throws; anything unusable comes back as `corrupt` or `future`.
 */
export function decode(text: string, ctx: Ctx = defaultCtx()): Decoded {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'corrupt', reason: 'Not valid JSON.' };
  }
  if (!isObj(parsed)) return { kind: 'corrupt', reason: 'Not a mealsplit data file.' };

  if ('version' in parsed || 'data' in parsed) {
    const { version, data } = parsed;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return { kind: 'corrupt', reason: 'Unreadable version number.' };
    }
    if (parsed.app !== undefined && parsed.app !== 'mealsplit') {
      return { kind: 'corrupt', reason: 'This file is from a different app.' };
    }
    if (version > CURRENT_VERSION) return { kind: 'future', version };
    if (!isObj(data)) return { kind: 'corrupt', reason: 'The file has no data.' };
    return {
      kind: 'ok',
      state: normalizeState(migrate(version, data, ctx), ctx),
      fromVersion: version,
    };
  }

  if (!looksLikeV1(parsed)) return { kind: 'corrupt', reason: 'Not a mealsplit data file.' };
  return { kind: 'ok', state: normalizeState(migrate(1, parsed, ctx), ctx), fromVersion: 1 };
}
