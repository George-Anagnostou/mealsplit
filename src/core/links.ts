// Payment-request links and message text. No DOM.
import { dollars, fmt } from './money';

/** The payment details the user shares in messages ("me"). */
export interface PayInfo {
  venmo?: string;
  contact?: string;
}

export interface LinkArgs {
  username?: string;
  cents: number;
  note?: string;
}

export interface GroupRow {
  name: string;
  totalC: number;
  itemsC: number;
  taxC: number;
  tipC: number;
  feesC: number;
  discountC: number;
}

// ---------------------------------------------------------------------------
// Small, defensive helpers shared by every link and message builder.
// ---------------------------------------------------------------------------

/** Replace lone surrogates, which make encodeURIComponent throw, with U+FFFD. */
function wellFormed(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i] + s[i + 1];
        i++;
      } else out += '\uFFFD';
    } else if (c >= 0xdc00 && c <= 0xdfff) out += '\uFFFD';
    else out += s[i];
  }
  return out;
}

/** Free text bound for a URL or message: no control characters, no runs of whitespace. */
export function tidyText(s: string | null | undefined): string {
  let out = '';
  for (const ch of wellFormed(String(s ?? ''))) {
    const c = ch.codePointAt(0) ?? 0;
    const control = c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029;
    out += control ? ' ' : ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Percent-encode for a query value. Unlike plain encodeURIComponent this never
 * throws (lone surrogates) and also encodes ! ' ( ) * so the result is safe to
 * paste anywhere. Emoji come out as proper UTF-8 sequences.
 */
export function encodeQuery(s: string | null | undefined): string {
  return encodeURIComponent(wellFormed(String(s ?? ''))).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** A request is only worth sending to someone who actually owes money. */
export const owesNothing = (cents: number): boolean =>
  !Number.isFinite(cents) || Math.round(cents) <= 0;

const amountParam = (cents: number): string =>
  dollars(Number.isFinite(cents) ? Math.max(0, cents) : 0);

/**
 * Venmo usernames are letters, digits, "-" and "_". Accepts what people really
 * paste: "@sam-b", " Sam B ", "venmo.com/u/sam-b", "https://venmo.com/sam-b?x=1".
 * Anything else (spaces, URL characters, emoji) is dropped. Empty if nothing is left.
 */
export function cleanVenmo(u: string | null | undefined): string {
  let s = String(u ?? '').trim();
  const fromUrl = s.match(/venmo\.com\/(?:u\/|code\?user_id=)?([^/?#\s]+)/i);
  if (fromUrl) s = fromUrl[1];
  return s.replace(/[^A-Za-z0-9_-]/g, '');
}

/**
 * A phone number reduced to what sms: wants: digits with an optional leading "+".
 * Extensions ("x123", "ext. 5") are dropped. Returns '' when it doesn't look like a
 * phone number (fewer than 7 digits), e.g. an email or a stray word.
 */
export function cleanPhone(p: string | null | undefined): string {
  const raw = String(p ?? '')
    .replace(/\s*(?:x|ext\.?|extension)\s*\d+\s*$/i, '')
    .trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return (raw.startsWith('+') ? '+' : '') + digits;
}

/** An email address for Apple Cash / Zelle, or '' if it doesn't look like one. */
export function cleanEmail(e: string | null | undefined): string {
  const s = String(e ?? '').trim();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s) ? s : '';
}

export function billNote(title?: string | null, dateStr?: string | null): string {
  const t = (title || 'Dinner').trim();
  let d = '';
  if (dateStr) {
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    d = m ? `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}` : String(dateStr);
  }
  return d ? `${t} ${d}` : t;
}

function venmoQuery({ username, cents, note }: LinkArgs, web: boolean): string {
  const user = cleanVenmo(username);
  const text = tidyText(note);
  return [
    'txn=charge',
    web ? 'audience=private' : '',
    user ? `recipients=${encodeQuery(user)}` : '',
    `amount=${amountParam(cents)}`,
    text ? `note=${encodeQuery(text)}` : '',
  ]
    .filter(Boolean)
    .join('&');
}

// Format taken from Venmo's historic payment-links docs:
//   https://venmo.com/?txn=charge&audience=private&recipients=USER&amount=12.34&note=...
// The username is cleaned, the note is optional and percent-encoded (emoji and
// special characters included), and the amount is never negative or NaN.
export function venmoWebLink(args: LinkArgs): string {
  return `https://venmo.com/?${venmoQuery(args, true)}`;
}

// Older app scheme; kept as a fallback.
export function venmoAppLink(args: LinkArgs): string {
  return `venmo://paycharge?${venmoQuery(args, false)}`;
}

export function firstName(name: string | null | undefined): string {
  return tidyText(name).split(' ')[0] || 'there';
}

/** "Venmo @geo or Zelle/Apple Cash g@x.com", skipping anything blank or unusable. */
export function payInfoLine(me?: PayInfo | null): string {
  const bits: string[] = [];
  const venmo = cleanVenmo(me?.venmo);
  const contact = tidyText(me?.contact);
  if (venmo) bits.push(`Venmo @${venmo}`);
  if (contact) bits.push(`Zelle/Apple Cash ${contact}`);
  return bits.length ? ` You can pay me on ${bits.join(' or ')}.` : '';
}

interface MessageArgs {
  name: string;
  cents: number;
  note: string;
  me?: PayInfo | null;
}

const shareOf = (note: string, cents: number) => {
  const n = tidyText(note);
  return `your share${n ? ` of ${n}` : ''} is ${fmt(cents)}.`;
};

export function shareMessage({ name, cents, note, me }: MessageArgs): string {
  return `Hey ${firstName(name)}, ${shareOf(note, cents)}${payInfoLine(me)}`;
}

/**
 * `sms:<to>?&body=` opens Messages (iMessage / Apple Cash) on iOS and the default
 * app on Android. The recipient is a cleaned phone number or an email; with neither,
 * the composer opens with just the body ("sms:?&body=...") and you pick the person.
 */
export function smsLink({ to, body }: { to?: string | null; body: string }): string {
  const dest = cleanPhone(to) || cleanEmail(to);
  return `sms:${dest ? encodeURI(dest) : ''}?&body=${encodeQuery(String(body ?? '').replace(/\r\n?/g, '\n'))}`;
}

export function groupSummary({
  note,
  totalC,
  rows,
  meRow,
}: {
  note: string;
  totalC: number;
  rows: GroupRow[];
  meRow?: { name: string; totalC: number } | null;
}): string {
  const lines = [`${note} — total ${fmt(totalC)}`];
  for (const r of rows) {
    const extras: string[] = [];
    if (r.taxC) extras.push(`tax ${fmt(r.taxC)}`);
    if (r.tipC) extras.push(`tip ${fmt(r.tipC)}`);
    if (r.feesC) extras.push(`fees ${fmt(r.feesC)}`);
    // Party discounts come out of computeSplit as negative numbers; show them as a deduction either way.
    if (r.discountC) extras.push(`discount -${fmt(Math.abs(r.discountC))}`);
    lines.push(
      `${r.name}: ${fmt(r.totalC)}  (items ${fmt(r.itemsC)}${extras.length ? ` + ${extras.join(', ')}` : ''})`,
    );
  }
  if (meRow) lines.push(`${meRow.name}: ${fmt(meRow.totalC)} (not charged)`);
  return lines.join('\n');
}

export function zelleMessage({ name, cents, note, me }: MessageArgs): string {
  const contact = tidyText(me?.contact);
  const dest = contact ? ` Zelle it to ${contact}.` : ' Zelle it to me when you get a sec.';
  return `Hey ${firstName(name)}, ${shareOf(note, cents)}${dest}`;
}
