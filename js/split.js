// Split math. All money is integer cents. No DOM, no deps.

export const UNASSIGNED = '_unassigned';

/**
 * Split `total` cents across `weights` proportionally (largest-remainder
 * method) so the parts always sum to exactly `total`.
 * Ties are broken in index order, rotated by `tieOffset` so spare pennies
 * don't always land on the first person.
 * If every weight is <= 0 the amount is split evenly.
 */
export function allocate(total, weights, tieOffset = 0) {
  const n = weights.length;
  if (n === 0) return [];
  total = Math.round(total);
  const sign = total < 0 ? -1 : 1;
  const amt = Math.abs(total);
  let w = weights.map((x) => Math.max(0, Number(x) || 0));
  let W = w.reduce((a, b) => a + b, 0);
  if (W <= 0) {
    w = w.map(() => 1);
    W = n;
  }
  const base = new Array(n);
  const rem = new Array(n);
  let given = 0;
  for (let i = 0; i < n; i++) {
    const exact = amt * w[i];
    base[i] = Math.floor(exact / W);
    rem[i] = exact - base[i] * W; // integer remainder, exact comparison
    given += base[i];
  }
  let left = amt - given;
  const order = [...Array(n).keys()].sort((a, b) => {
    if (rem[b] !== rem[a]) return rem[b] - rem[a];
    const ra = (a - tieOffset + n * 4) % n;
    const rb = (b - tieOffset + n * 4) % n;
    return ra - rb;
  });
  for (let k = 0; left > 0; k++, left--) base[order[k % n]] += 1;
  return base.map((x) => x * sign);
}

/** Tip in cents from either a flat amount or a % of the item subtotal. */
export function computeTip(subtotalC, mode, pct, amtC) {
  if (mode === 'pct') return Math.round((subtotalC * (Number(pct) || 0)) / 100);
  return Math.round(amtC || 0);
}

/**
 * items: [{ cents, who: [partyId, ...] }]
 * opts:  { taxC, tipC, feesC, discountC, feesEven }
 * Returns { parties: { [id]: {...} }, subtotalC, totalC }.
 * Items with nobody assigned go to the UNASSIGNED pseudo-party so the
 * grand total still reconciles with the receipt.
 */
export function computeSplit(items, opts = {}) {
  const { taxC = 0, tipC = 0, feesC = 0, discountC = 0, feesEven = false } = opts;
  const parties = {};
  const get = (id) =>
    (parties[id] ||= { id, itemsC: 0, items: [], taxC: 0, tipC: 0, feesC: 0, discountC: 0, totalC: 0, count: 0 });

  let subtotalC = 0;
  items.forEach((it, idx) => {
    const cents = Math.round(it.cents || 0);
    subtotalC += cents;
    const who = [...new Set(it.who || [])];
    if (who.length === 0) {
      const p = get(UNASSIGNED);
      p.itemsC += cents;
      p.count++;
      p.items.push({ index: idx, shareC: cents, of: 1 });
      return;
    }
    const shares = allocate(cents, who.map(() => 1), idx);
    who.forEach((id, i) => {
      const p = get(id);
      p.itemsC += shares[i];
      p.count++;
      p.items.push({ index: idx, shareC: shares[i], of: who.length });
    });
  });

  const ids = Object.keys(parties);
  const real = ids.filter((id) => id !== UNASSIGNED);
  const propIds = ids.length ? ids : [];
  const spread = (amount, key, evenly) => {
    if (!amount || propIds.length === 0) return;
    let targets = propIds;
    let weights;
    if (evenly) {
      targets = real.length ? real : propIds;
      weights = targets.map(() => 1);
    } else {
      weights = targets.map((id) => parties[id].itemsC);
    }
    const parts = allocate(amount, weights, items.length);
    targets.forEach((id, i) => (parties[id][key] += parts[i]));
  };
  // Tax/tip/discount follow what each person ordered; unassigned items carry
  // their own share until they're assigned.
  spread(taxC, 'taxC', false);
  spread(tipC, 'tipC', false);
  spread(-Math.abs(discountC), 'discountC', false);
  spread(feesC, 'feesC', !!feesEven);

  let totalC = 0;
  for (const p of Object.values(parties)) {
    p.totalC = p.itemsC + p.taxC + p.tipC + p.feesC + p.discountC;
    totalC += p.totalC;
  }
  return { parties, subtotalC, totalC, expectedTotalC: subtotalC + taxC + tipC + feesC - Math.abs(discountC) };
}

// ---- money helpers ----
export function toCents(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  const s = String(v ?? '').replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
  if (!s || s === '-' || s === '.') return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export function fmt(cents) {
  const neg = cents < 0;
  const a = Math.abs(Math.round(cents));
  return `${neg ? '-' : ''}$${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
export function dollars(cents) {
  const neg = cents < 0;
  const a = Math.abs(Math.round(cents));
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
