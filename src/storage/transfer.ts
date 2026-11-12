import { prettyDate } from '../state/selectors';
import type { AppState } from '../state/types';
import { type Ctx, CURRENT_VERSION, decode } from './migrate';

/** The data worth saving. `tab` is where you were, not data, so exports leave it out. */
const dataOf = (s: AppState, withTab: boolean) => ({
  me: s.me,
  people: s.people,
  bill: s.bill,
  history: s.history,
  ...(withTab ? { tab: s.tab } : {}),
});

/** The text kept in localStorage: a versioned envelope. */
export const encodeEnvelope = (s: AppState): string =>
  JSON.stringify({ version: CURRENT_VERSION, data: dataOf(s, true) });

export interface ExportFile {
  filename: string;
  mimeType: string;
  text: string;
}

/** A JSON file of everything: your details, friends, current bill and history. */
export function buildExport(s: AppState, now: Date = new Date()): ExportFile {
  return {
    filename: `mealsplit-${now.toISOString().slice(0, 10)}.json`,
    mimeType: 'application/json',
    text: JSON.stringify(
      {
        app: 'mealsplit',
        version: CURRENT_VERSION,
        exportedAt: now.toISOString(),
        data: dataOf(s, false),
      },
      null,
      2,
    ),
  };
}

export type ImportResult =
  | { ok: true; state: AppState; summary: string }
  | { ok: false; error: string };

/** What an import will bring in, in words, for the confirm prompt. */
export function describeImport(s: AppState): string {
  const n = (count: number, one: string, many = `${one}s`) =>
    `${count} ${count === 1 ? one : many}`;
  const bill = s.bill.items.length
    ? `a bill with ${n(s.bill.items.length, 'item')} (${prettyDate(s.bill.date)})`
    : 'an empty bill';
  return `${n(s.people.length, 'friend')}, ${n(s.history.length, 'past meal')} and ${bill}`;
}

/** Check and migrate an exported file. Nothing is changed until the caller applies the result. */
export function parseImport(text: string, ctx?: Ctx): ImportResult {
  const d = decode(text, ctx);
  if (d.kind === 'corrupt') return { ok: false, error: `That file can’t be imported. ${d.reason}` };
  if (d.kind === 'future') {
    return {
      ok: false,
      error: `That file was made by a newer version of mealsplit (data version ${d.version}). Update the app and try again.`,
    };
  }
  return { ok: true, state: d.state, summary: describeImport(d.state) };
}
