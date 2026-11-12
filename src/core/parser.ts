// Receipt text -> line items + subtotal/tax/tip/fees/discount/total.
// Tolerant of OCR noise and of "name on one line, price on the next" layouts.
import { toCents } from './money';

const PRICE = String.raw`[-(]?\s?[-(]?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)[.,]\d{2}\)?-?`;
const LINE_RE = new RegExp(String.raw`^(.*?)[\s.:_*]*(${PRICE})\s*(?:[A-Za-z]{1,2})?\s*$`);
const PRICE_ONLY_RE = new RegExp(String.raw`^\s*(${PRICE})\s*(?:[A-Za-z]{1,2})?\s*$`);

/** Why a parsed line is less than fully trusted. Each reason carries a fixed penalty. */
export type ConfidenceReason =
  | 'label-on-previous-line' // name and price were on separate lines
  | 'bare-quantity' // "2 Tacos 8.00": leading number read as a quantity
  | 'leading-number-kept' // "7 Up 2.50": leading number looked like part of the name, so it stayed
  | 'keyword-in-name' // name contains a fee/discount/tax/tip word but was kept as an item
  | 'short-name' // 3 characters or fewer
  | 'odd-characters' // mostly symbols/digits, typical of OCR noise
  | 'negative-price' // an item with a negative price (probably an adjustment)
  | 'high-price' // $250 or more
  | 'exceeds-subtotal'; // costs more than the whole receipt subtotal

export interface ParsedLine {
  name: string;
  cents: number;
}

export interface ParsedItem extends ParsedLine {
  /** 0 to 1. 1 means no doubts; see {@link LOW_CONFIDENCE}. */
  confidence: number;
  reasons: ConfidenceReason[];
}

/** How much each reason takes off the 1.0 starting score. */
const PENALTY: Record<ConfidenceReason, number> = {
  'label-on-previous-line': 0.05,
  'bare-quantity': 0.05,
  'leading-number-kept': 0.3,
  'keyword-in-name': 0.15,
  'short-name': 0.2,
  'odd-characters': 0.3,
  'negative-price': 0.4,
  'high-price': 0.2,
  'exceeds-subtotal': 0.5,
};

/** Items scoring below this are worth a second look in the UI. */
export const LOW_CONFIDENCE = 0.75;

export const isLowConfidence = (i: Pick<ParsedItem, 'confidence'>): boolean =>
  i.confidence < LOW_CONFIDENCE;

const scoreOf = (reasons: ConfidenceReason[]): number =>
  Math.max(0, Math.round((1 - reasons.reduce((a, r) => a + PENALTY[r], 0)) * 100) / 100);

export interface ParsedReceipt {
  items: ParsedItem[];
  subtotalC: number | null;
  taxC: number;
  tipC: number;
  feesC: number;
  discountC: number;
  totalC: number | null;
  hasTax: boolean;
  hasTip: boolean;
  feeLines: ParsedLine[];
  warnings: string[];
}

const RE = {
  skip: /^(visa|master\s*card|mastercard|amex|american express|discover|debit|credit card|card\b|cash\b|change\b|tendered|payment|paid\b|auth|approval|ref\b|order\s*(#|no|number)|table\b|server\b|guest|check\s*(#|no)|tel\b|phone|www\.|thank|balance\b(?!\s*due)|apple pay|google pay|total savings)/i,
  subtotal: /sub\s*-?\s*total|item\s*total|food\s*(&|and)?\s*bev|merchandise/i,
  preTip: /total.*\b(before|excl\w*|without|w\/o|pre)\b/i,
  tax: /\b(sales\s+)?tax(es)?\b|\bvat\b|\bgst\b|\bhst\b|\bpst\b/i,
  tip: /\b(tip|gratuity|dasher tip|driver tip|courier tip)\b/i,
  suggest: /suggest|recommend|\bif you tip\b|calculat/i,
  total: /\b(grand\s+)?total\b|amount\s+due|balance\s+due|total\s+due|you\s+(owe|pay)/i,
};

// ---------------------------------------------------------------------------
// Fee and discount lines
//
// A keyword only classifies a line when the line *looks like a charge or
// adjustment line*, not when the word is just part of a dish name.
//
// Fees. Words come in two strengths:
//   - strong ("fee", "surcharge", "service charge", "commission") are charge nouns
//     and classify a line wherever they appear: "Bag fee", "Taxes & Fees".
//   - weak ("delivery", "bag", "packaging", "booking", "small order", ...) also name
//     things you can eat or carry, so they classify only when nothing else is in the
//     label except filler like "charge" or "cost": "Delivery 2.99" and "Bag 0.10"
//     are fees, "Delivery Pizza" and "Bag of Chips" are items.
//
// Discounts. The price's sign is the best signal, because real adjustments are
// printed negative: "(5.00)", "-$5.00", "5.00-".
//   - A negative price plus any discount word is a discount ("Credit -3.00",
//     "Member discount -2.00", "Promo -5.00").
//   - A positive price (the minus got lost to OCR, or it is a dish) needs a strong
//     word ("discount", "promo", "coupon", "savings", "voucher") and nothing but
//     other charge/discount words, filler or code-like tokens around it
//     ("Member Discount", "Promo: DASH20"). So "Credit Brulee 7.00",
//     "Gift Card Salad 11.00" and "Member Special Burger 14.00" stay items.
//
// Known limit: a label like "Uber One Savings 3.50" with a *positive* price stays an
// item (flagged low confidence via "keyword-in-name").
// ---------------------------------------------------------------------------
const PHRASES: [RegExp, string][] = [
  [/service\s+charges?/g, 'servicecharge'],
  [/small\s+order/g, 'smallorder'],
  [/gift\s*cards?/g, 'giftcard'],
];
const STRONG_FEE = new Set(['fee', 'fees', 'surcharge', 'servicecharge', 'commission']);
const WEAK_FEE = new Set([
  'delivery',
  'bag',
  'bags',
  'packaging',
  'booking',
  'smallorder',
  'regulatory',
  'convenience',
  'expedite',
  'svc',
]);
const STRONG_DISCOUNT = new Set([
  'discount',
  'discounts',
  'promo',
  'promotion',
  'coupon',
  'saving',
  'savings',
  'voucher',
]);
const WEAK_DISCOUNT = new Set([
  'credit',
  'offer',
  'reward',
  'rewards',
  'deal',
  'comp',
  'comped',
  'giftcard',
  'member',
]);
const FILLER = new Set([
  'charge',
  'charges',
  'chg',
  'cost',
  'amount',
  'the',
  'a',
  'an',
  'and',
  'applied',
]);

const tokensOf = (label: string): string[] => {
  let l = label.toLowerCase();
  for (const [re, to] of PHRASES) l = l.replace(re, to);
  return l.match(/[a-z0-9]+/g) ?? [];
};
const hasDigit = (t: string) => /\d/.test(t);

/** "Delivery Fee", "Bag fee", "Delivery", "Delivery Charge"; not "Delivery Pizza". */
function isFeeLabel(tokens: string[]): boolean {
  if (tokens.some((t) => STRONG_FEE.has(t))) return true;
  return (
    tokens.some((t) => WEAK_FEE.has(t)) &&
    tokens.every((t) => WEAK_FEE.has(t) || FILLER.has(t) || hasDigit(t))
  );
}

/** See the rules above; `negative` is the sign of the printed price. */
function isDiscountLabel(tokens: string[], negative: boolean): boolean {
  const known = (t: string) =>
    STRONG_DISCOUNT.has(t) || WEAK_DISCOUNT.has(t) || WEAK_FEE.has(t) || STRONG_FEE.has(t);
  if (!tokens.some((t) => STRONG_DISCOUNT.has(t) || WEAK_DISCOUNT.has(t))) return false;
  if (negative) return true;
  return (
    tokens.some((t) => STRONG_DISCOUNT.has(t)) &&
    tokens.every((t) => known(t) || FILLER.has(t) || hasDigit(t))
  );
}

const anyKeyword = (tokens: string[]): boolean =>
  tokens.some(
    (t) =>
      STRONG_FEE.has(t) ||
      WEAK_FEE.has(t) ||
      STRONG_DISCOUNT.has(t) ||
      WEAK_DISCOUNT.has(t) ||
      /^(tax|taxes|tip|gratuity)$/.test(t),
  );

const clean = (s: string) =>
  s
    .replace(/[\s.]{3,}/g, ' ')
    .replace(/^[\s*#\-–•]+|[\s*:#\-–•]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function parsePriceToken(tok: string): number {
  const neg = /-|\(/.test(tok);
  const c = Math.abs(toCents(tok.replace(/[()\-\s$]/g, '')));
  return neg ? -c : c;
}

// Units that follow a size, not a quantity: "12 oz Ribeye", "6 pc Nuggets".
const UNIT =
  /^(oz|ounces?|fl|lbs?|pounds?|g|kg|ml|cl|l|pcs?|pieces?|pk|packs?|ct|count|in|inch|inches|cm)\b/i;
// Menu names that really do start with a number. Extend as they turn up.
const NUMERIC_NAMES = /^(7\s*-?\s*up|3\s+musketeers|5\s+guys|8\s+ball)\b/i;
// A bare leading number is only a quantity if each one would cost at least this much.
const MIN_UNIT_CENTS = 50;

/**
 * Pulls a quantity off the front of a label and returns the display name.
 * Explicit markers ("2x", "(2)", "2 @ 4.00") are always quantities. A bare leading
 * number ("2 Tacos") is one too, unless it is followed by a unit ("12 oz Ribeye"), is a
 * known numeric name ("7 Up"), or would make each unit cost under $0.50.
 */
function normalizeName(name: string, cents: number, reasons: ConfidenceReason[]): string {
  let n = clean(name);
  const at = n.match(/^(.*?)\s+(\d{1,2})\s*@\s*\$?\d+(?:[.,]\d{2})?$/);
  if (at) n = `${at[2]}x ${at[1]}`;
  n = n.replace(/^\((\d{1,2})\)\s*/, '$1 ');
  const explicit = n.match(/^(\d{1,2})\s*[x×]\s+(.*)$/i);
  if (explicit) {
    const q = parseInt(explicit[1], 10);
    return q > 1 ? `${q}× ${explicit[2]}` : explicit[2];
  }
  const bare = n.match(/^(\d{1,2})\s+([A-Za-z0-9].*)$/);
  if (!bare) return n;
  const q = parseInt(bare[1], 10);
  const rest = bare[2];
  if (UNIT.test(rest) || NUMERIC_NAMES.test(n)) return n; // clearly part of the name
  if (q === 0 || (q > 1 && Math.abs(cents) / q < MIN_UNIT_CENTS)) {
    reasons.push('leading-number-kept'); // ambiguous: keep the number, flag the line
    return n;
  }
  if (q > 1) {
    reasons.push('bare-quantity');
    return `${q}× ${rest}`;
  }
  return rest;
}

const ODD = /[^A-Za-z0-9 &'.,\-+/()×%#!:@"]/;
function nameReasons(name: string, cents: number, reasons: ConfidenceReason[]): void {
  const letters = (name.match(/[A-Za-z]/g) ?? []).length;
  const visible = name.replace(/\s/g, '').length;
  if (ODD.test(name) || letters / Math.max(visible, 1) < 0.6) reasons.push('odd-characters');
  if (name.replace(/^\d+×\s*/, '').length <= 3) reasons.push('short-name');
  if (anyKeyword(tokensOf(name))) reasons.push('keyword-in-name');
  if (cents < 0) reasons.push('negative-price');
  if (cents >= 25000) reasons.push('high-price');
}

export function parseReceipt(text: string | null | undefined): ParsedReceipt {
  const out: ParsedReceipt = {
    items: [],
    subtotalC: null,
    taxC: 0,
    tipC: 0,
    feesC: 0,
    discountC: 0,
    totalC: null,
    hasTax: false,
    hasTip: false,
    feeLines: [],
    warnings: [],
  };
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let pending: string | null = null; // a label line that had no price yet
  let pendingQty: number | null = null;
  let sawTotal = false;

  const handle = (label: string, cents: number, split = false) => {
    const l = label.toLowerCase();
    if (!/[a-z]{2}/i.test(label)) return; // "18% = 9.00" style noise
    if (RE.suggest.test(l)) return;
    if (RE.skip.test(l)) return;
    if (RE.preTip.test(l)) return;
    if (RE.subtotal.test(l)) {
      if (out.subtotalC == null) out.subtotalC = Math.abs(cents);
      return;
    }
    const tokens = tokensOf(label);
    if (RE.tax.test(l) && !isFeeLabel(tokens) && !sawTotal) {
      out.taxC += Math.abs(cents);
      out.hasTax = true;
      return;
    }
    if (RE.tip.test(l)) {
      out.tipC += Math.abs(cents);
      out.hasTip = true;
      return;
    }
    if (sawTotal) return; // everything else after the total is payment/footer noise
    if (isDiscountLabel(tokens, cents < 0)) {
      out.discountC += Math.abs(cents);
      return;
    }
    if (isFeeLabel(tokens)) {
      if (cents !== 0) {
        out.feesC += Math.abs(cents);
        out.feeLines.push({ name: clean(label), cents: Math.abs(cents) });
      }
      return;
    }
    if (RE.total.test(l)) {
      out.totalC = Math.abs(cents);
      sawTotal = true;
      return;
    }
    if (cents === 0) return;
    const reasons: ConfidenceReason[] = [];
    if (split) reasons.push('label-on-previous-line');
    const name = normalizeName(label, cents, reasons);
    if (name.length < 2) return;
    nameReasons(name, cents, reasons);
    out.items.push({ name, cents, confidence: scoreOf(reasons), reasons });
  };

  for (const raw of lines) {
    const priceOnly = raw.match(PRICE_ONLY_RE);
    if (priceOnly) {
      if (pending)
        handle(
          pendingQty && pendingQty > 1 ? `${pendingQty}x ${pending}` : pending,
          parsePriceToken(priceOnly[1]),
          true,
        );
      pending = null;
      pendingQty = null;
      continue;
    }
    const m = raw.match(LINE_RE);
    if (m && clean(m[1]).length > 0) {
      let label = m[1];
      if (pendingQty && !/^\d+\s*[x×]?\s/i.test(label) && pendingQty > 1)
        label = `${pendingQty}x ${label}`;
      handle(label, parsePriceToken(m[2]));
      pending = null;
      pendingQty = null;
      continue;
    }
    // no price on this line
    if (/^\d{1,2}\s*[x×]?$/i.test(raw)) {
      pendingQty = parseInt(raw, 10);
      continue;
    }
    if (/[A-Za-z]{2}/.test(raw) && raw.length < 60) pending = raw;
    else pending = null;
  }

  const sub = out.subtotalC;
  if (sub != null && sub > 0) {
    out.items = out.items.map((i) => {
      if (i.cents <= sub || i.reasons.includes('exceeds-subtotal')) return i;
      const reasons: ConfidenceReason[] = [...i.reasons, 'exceeds-subtotal'];
      return { ...i, reasons, confidence: scoreOf(reasons) };
    });
  }
  const sum = out.items.reduce((a, b) => a + b.cents, 0);
  if (out.subtotalC != null && Math.abs(sum - out.subtotalC) > 1) {
    out.warnings.push(
      `Items add up to $${(sum / 100).toFixed(2)} but the receipt subtotal is $${(out.subtotalC / 100).toFixed(2)}. Check for a missed or misread line.`,
    );
  }
  if (out.items.length === 0)
    out.warnings.push('No items found. Check the text or add items by hand.');
  return out;
}
