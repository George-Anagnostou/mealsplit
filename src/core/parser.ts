// Deliberately a text format, not a receipt-layout guesser:
//   [quantity] name signed-unit-price
// Every name is an ordinary item, including tax, tip, discount and total.
// Quantities stay grouped; assignment splits each line's amount evenly.

export interface ParsedItem {
  name: string;
  quantity: number;
  unitC: number;
  cents: number;
}

export interface ParseError {
  line: number;
  text: string;
  message: string;
}

export interface ParsedReceipt {
  source: string;
  items: ParsedItem[];
  errors: ParseError[];
  /** No complete draft subtotal while any line is invalid. */
  subtotalC: number | null;
}

// A price is the last token, with 0–2 decimal places and an optional dollar sign.
// Accept -3, -$3 and $-3; never strip arbitrary characters from a malformed price.
const LINE = /^(.*?)\s+(-?\$?\s*\d+(?:\.\d{1,2})?|\$-\d+(?:\.\d{1,2})?)$/;
// Recognize invalid numeric quantities too, so 0x/-2x/1.5x are errors, not names.
const QUANTITY = /^([+-]?\d+(?:\.\d+)?)(?:\s*[x×])?(?:\s+|$)/i;

export function parseReceipt(text: string | null | undefined): ParsedReceipt {
  const source = text ?? '';
  const items: ParsedItem[] = [];
  const errors: ParseError[] = [];
  let magnitudeC = 0;

  for (const [index, raw] of source.split(/\r\n?|\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const fail = (message: string) => errors.push({ line: index + 1, text: raw, message });
    const match = line.match(LINE);
    if (!match) {
      fail(
        'Use [quantity] name price, for example: 2x burger 10. Prices accept up to two decimals.',
      );
      continue;
    }

    let name = match[1].trim();
    const qty = name.match(QUANTITY);
    const quantity = qty ? Number(qty[1]) : 1;
    if (qty) name = name.slice(qty[0].length).trim();
    if (!name) {
      fail('Add an item name before the price.');
      continue;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      fail('Quantity must be a positive whole number.');
      continue;
    }

    const token = match[2].replace(/[$\s-]/g, '');
    const [whole, fraction = ''] = token.split('.');
    const magnitude = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    const unitC = magnitude === 0 ? 0 : magnitude * (match[2].includes('-') ? -1 : 1);
    const cents = quantity * unitC;
    // Bound the sum of magnitudes, not just the net: large credits must not hide overflow.
    if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(magnitudeC + Math.abs(cents))) {
      fail('This amount is too large to calculate exactly.');
      continue;
    }
    magnitudeC += Math.abs(cents);
    items.push({ name: name.replace(/\s+/g, ' '), quantity, unitC, cents });
  }

  if (!items.length && !errors.length) {
    errors.push({ line: 1, text: '', message: 'Enter at least one item, for example: burger 10.' });
  }
  return {
    source,
    items,
    errors,
    subtotalC: errors.length ? null : items.reduce((sum, item) => sum + item.cents, 0),
  };
}
