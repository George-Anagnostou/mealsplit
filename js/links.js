// Payment-request links and message text. No DOM.
import { fmt, dollars } from './split.js';

export function cleanVenmo(u) {
  return String(u || '').trim().replace(/^@+/, '').replace(/\s+/g, '');
}

export function billNote(title, dateStr) {
  const t = (title || 'Dinner').trim();
  let d = '';
  if (dateStr) {
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    d = m ? `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}` : String(dateStr);
  }
  return d ? `${t} ${d}` : t;
}

// Format taken from Venmo's historic payment-links docs:
//   https://venmo.com/?txn=charge&audience=private&recipients=USER&amount=12.34&note=...
export function venmoWebLink({ username, cents, note }) {
  const q = [
    'txn=charge',
    'audience=private',
    username ? `recipients=${encodeURIComponent(cleanVenmo(username))}` : '',
    `amount=${dollars(cents)}`,
    `note=${encodeURIComponent(note || '')}`,
  ].filter(Boolean);
  return `https://venmo.com/?${q.join('&')}`;
}

// Older app scheme; kept as a fallback.
export function venmoAppLink({ username, cents, note }) {
  const q = [
    'txn=charge',
    username ? `recipients=${encodeURIComponent(cleanVenmo(username))}` : '',
    `amount=${dollars(cents)}`,
    `note=${encodeURIComponent(note || '')}`,
  ].filter(Boolean);
  return `venmo://paycharge?${q.join('&')}`;
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

export function payInfoLine(me) {
  const bits = [];
  if (me?.venmo) bits.push(`Venmo @${cleanVenmo(me.venmo)}`);
  if (me?.contact) bits.push(`Zelle/Apple Cash ${me.contact.trim()}`);
  return bits.length ? ` You can pay me on ${bits.join(' or ')}.` : '';
}

export function shareMessage({ name, cents, note, me }) {
  return `Hey ${firstName(name)}, your share of ${note} is ${fmt(cents)}.${payInfoLine(me)}`;
}

// `sms:<to>?&body=` works on iOS (Messages / iMessage / Apple Cash) and Android.
export function smsLink({ to, body }) {
  return `sms:${(to || '').trim()}?&body=${encodeURIComponent(body)}`;
}

export function groupSummary({ note, totalC, rows, meRow }) {
  const lines = [`${note} — total ${fmt(totalC)}`];
  for (const r of rows) {
    const extras = [];
    if (r.taxC) extras.push(`tax ${fmt(r.taxC)}`);
    if (r.tipC) extras.push(`tip ${fmt(r.tipC)}`);
    if (r.feesC) extras.push(`fees ${fmt(r.feesC)}`);
    if (r.discountC) extras.push(`discount ${fmt(r.discountC)}`);
    lines.push(`${r.name}: ${fmt(r.totalC)}  (items ${fmt(r.itemsC)}${extras.length ? ' + ' + extras.join(', ') : ''})`);
  }
  if (meRow) lines.push(`${meRow.name}: ${fmt(meRow.totalC)} (not charged)`);
  return lines.join('\n');
}

export function zelleMessage({ name, cents, note, me }) {
  const dest = me?.contact ? ` Zelle it to ${me.contact.trim()}.` : ' Zelle it to me when you get a sec.';
  return `Hey ${firstName(name)}, your share of ${note} is ${fmt(cents)}.${dest}`;
}
