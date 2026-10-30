// Receipt text -> line items + subtotal/tax/tip/fees/discount/total.
// Tolerant of OCR noise and of "name on one line, price on the next" layouts.
import { toCents } from './split.js';

const PRICE = String.raw`[-(]?\s?[-(]?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)[.,]\d{2}\)?-?`;
const LINE_RE = new RegExp(String.raw`^(.*?)[\s.:_*]*(${PRICE})\s*(?:[A-Za-z]{1,2})?\s*$`);
const PRICE_ONLY_RE = new RegExp(String.raw`^\s*(${PRICE})\s*(?:[A-Za-z]{1,2})?\s*$`);

const RE = {
  skip: /^(visa|master\s*card|mastercard|amex|american express|discover|debit|credit card|card\b|cash\b|change\b|tendered|payment|paid\b|auth|approval|ref\b|order\s*(#|no|number)|table\b|server\b|guest|check\s*(#|no)|tel\b|phone|www\.|thank|balance\b(?!\s*due)|apple pay|google pay|total savings)/i,
  subtotal: /sub\s*-?\s*total|item\s*total|food\s*(&|and)?\s*bev|merchandise/i,
  preTip: /total.*\b(before|excl\w*|without|w\/o|pre)\b/i,
  tax: /\b(sales\s+)?tax(es)?\b|\bvat\b|\bgst\b|\bhst\b|\bpst\b/i,
  tip: /\b(tip|gratuity|dasher tip|driver tip|courier tip)\b/i,
  suggest: /suggest|recommend|\bif you tip\b|calculat/i,
  discount: /\b(discounts?|promo(tion)?|coupon|savings?|credit|offer|reward|deal|comp(ed)?|voucher|gift\s*card|member)\b/i,
  fee: /\b(fees?|surcharge|service\s+charge|svc|delivery|bag|packaging|commission|booking|small\s+order|regulatory|convenience|expedite)\b/i,
  total: /\b(grand\s+)?total\b|amount\s+due|balance\s+due|total\s+due|you\s+(owe|pay)/i,
};

const clean = (s) => s.replace(/[\s.]{3,}/g, ' ').replace(/^[\s*#\-–•]+|[\s*:#\-–•]+$/g, '').replace(/\s+/g, ' ').trim();

function parsePriceToken(tok) {
  const neg = /-|\(/.test(tok);
  const c = Math.abs(toCents(tok.replace(/[()\-\s$]/g, '')));
  return neg ? -c : c;
}

function normalizeName(name) {
  let n = clean(name);
  const at = n.match(/^(.*?)\s+(\d{1,2})\s*@\s*\$?\d+(?:[.,]\d{2})?$/);
  if (at) n = `${at[2]}x ${at[1]}`;
  n = n.replace(/^\((\d{1,2})\)\s*/, '$1 ');
  let m = n.match(/^(\d{1,2})\s*[x×]\s+(.*)$/i) || n.match(/^(\d{1,2})\s+([A-Za-z].*)$/);
  if (m) {
    const q = parseInt(m[1], 10);
    n = q > 1 ? `${q}× ${m[2]}` : m[2];
  }
  return n;
}

export function parseReceipt(text) {
  const out = {
    items: [], subtotalC: null, taxC: 0, tipC: 0, feesC: 0, discountC: 0, totalC: null,
    hasTax: false, hasTip: false, feeLines: [], warnings: [],
  };
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  let pending = null; // a label line that had no price yet
  let pendingQty = null;
  let sawTotal = false;

  const handle = (label, cents) => {
    const l = label.toLowerCase();
    if (!/[a-z]{2}/i.test(label)) return; // "18% = 9.00" style noise
    if (RE.suggest.test(l)) return;
    if (RE.skip.test(l)) return;
    if (RE.preTip.test(l)) return;
    if (RE.subtotal.test(l)) { if (out.subtotalC == null) out.subtotalC = Math.abs(cents); return; }
    if (RE.tax.test(l) && !RE.fee.test(l) && !sawTotal) { out.taxC += Math.abs(cents); out.hasTax = true; return; }
    if (RE.tip.test(l)) { out.tipC += Math.abs(cents); out.hasTip = true; return; }
    if (sawTotal) return; // everything else after the total is payment/footer noise
    if (RE.discount.test(l) && !/\b(sauce|cake|combo)\b/.test(l)) { out.discountC += Math.abs(cents); return; }
    if (RE.fee.test(l) || (RE.tax.test(l) && /fee/.test(l))) {
      if (cents !== 0) { out.feesC += Math.abs(cents); out.feeLines.push({ name: clean(label), cents: Math.abs(cents) }); }
      return;
    }
    if (RE.total.test(l)) { out.totalC = Math.abs(cents); sawTotal = true; return; }
    if (cents === 0) return;
    const name = normalizeName(label);
    if (name.length < 2) return;
    out.items.push({ name, cents });
  };

  for (const raw of lines) {
    const priceOnly = raw.match(PRICE_ONLY_RE);
    if (priceOnly) {
      if (pending) handle(pendingQty && pendingQty > 1 ? `${pendingQty}x ${pending}` : pending, parsePriceToken(priceOnly[1]));
      pending = null; pendingQty = null;
      continue;
    }
    const m = raw.match(LINE_RE);
    if (m && clean(m[1]).length > 0) {
      let label = m[1];
      if (pendingQty && !/^\d+\s*[x×]?\s/i.test(label) && pendingQty > 1) label = `${pendingQty}x ${label}`;
      handle(label, parsePriceToken(m[2]));
      pending = null; pendingQty = null;
      continue;
    }
    // no price on this line
    if (/^\d{1,2}\s*[x×]?$/i.test(raw)) { pendingQty = parseInt(raw, 10); continue; }
    if (/[A-Za-z]{2}/.test(raw) && raw.length < 60) pending = raw; else pending = null;
  }

  const sum = out.items.reduce((a, b) => a + b.cents, 0);
  if (out.subtotalC != null && Math.abs(sum - out.subtotalC) > 1) {
    out.warnings.push(`Items add up to $${(sum / 100).toFixed(2)} but the receipt subtotal is $${(out.subtotalC / 100).toFixed(2)}. Check for a missed or misread line.`);
  }
  if (out.items.length === 0) out.warnings.push('No items found. Check the text or add items by hand.');
  return out;
}
