// Split math. All money is integer cents. No DOM, no deps.

export const UNASSIGNED = '_unassigned';

/**
 * Split `total` cents across `weights` proportionally (largest-remainder
 * method) so the parts always sum to exactly `total`.
 * Ties are broken in index order, rotated by `tieOffset` so spare pennies
 * don't always land on the first person.
 * If every weight is <= 0 the amount is split evenly.
 */
export function allocate(total: number, weights: number[], tieOffset = 0): number[] {
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
  const base: number[] = new Array(n);
  const rem: number[] = new Array(n);
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

/**
 * A discount can never take more than the items cost, so totals can't go negative.
 * Returns the discount to apply, as a positive number of cents.
 */
export function clampDiscount(discountC: number, subtotalC: number): number {
  const d = Math.abs(Math.round(Number(discountC) || 0));
  return Math.min(d, Math.max(0, Math.round(Number(subtotalC) || 0)));
}

/** A user-facing warning when the discount had to be capped, otherwise null. */
export function discountNotice(discountC: number, subtotalC: number): string | null {
  const d = Math.abs(Math.round(Number(discountC) || 0));
  const applied = clampDiscount(d, subtotalC);
  if (d <= applied) return null;
  return `Discount ${money(d)} is more than the items (${money(applied)}), so only ${money(applied)} is applied.`;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export type TipMode = 'pct' | 'amt';

/** Tip in cents from either a flat amount or a % of the item subtotal. */
export function computeTip(
  subtotalC: number,
  mode: TipMode,
  pct: number | string,
  amtC: number | undefined,
): number {
  if (mode === 'pct') return Math.round((subtotalC * (Number(pct) || 0)) / 100);
  return Math.round(amtC || 0);
}

export interface SplitItem {
  cents: number;
  who?: string[];
}

export interface SplitOptions {
  taxC?: number;
  tipC?: number;
  feesC?: number;
  discountC?: number;
  feesEven?: boolean;
}

export interface PartyItemShare {
  index: number;
  shareC: number;
  of: number;
}

export interface PartyTotals {
  id: string;
  itemsC: number;
  items: PartyItemShare[];
  taxC: number;
  tipC: number;
  feesC: number;
  discountC: number;
  totalC: number;
  count: number;
}

export interface SplitResult {
  parties: Record<string, PartyTotals>;
  subtotalC: number;
  /** Sum of every share. Always equals expectedTotalC (the split never loses a cent). */
  totalC: number;
  /** subtotal + tax + tip + fees - the discount that was actually applied. */
  expectedTotalC: number;
  /** The discount that was applied, as a positive number (never more than the subtotal). */
  discountAppliedC: number;
  /** True when the entered discount was larger than the subtotal and got capped. */
  discountClamped: boolean;
}

type SpreadKey = 'taxC' | 'tipC' | 'feesC' | 'discountC';

/**
 * items: [{ cents, who: [partyId, ...] }]
 * opts:  { taxC, tipC, feesC, discountC, feesEven }
 * Returns { parties: { [id]: {...} }, subtotalC, totalC }.
 * Items with nobody assigned go to the UNASSIGNED pseudo-party so the
 * grand total still reconciles with the receipt.
 */
export function computeSplit(items: SplitItem[], opts: SplitOptions = {}): SplitResult {
  const { taxC = 0, tipC = 0, feesC = 0, discountC = 0, feesEven = false } = opts;
  const parties: Record<string, PartyTotals> = {};
  const get = (id: string): PartyTotals =>
    (parties[id] ||= {
      id,
      itemsC: 0,
      items: [],
      taxC: 0,
      tipC: 0,
      feesC: 0,
      discountC: 0,
      totalC: 0,
      count: 0,
    });

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
    const shares = allocate(
      cents,
      who.map(() => 1),
      idx,
    );
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
  const spread = (amount: number, key: SpreadKey, evenly: boolean) => {
    if (!amount || propIds.length === 0) return;
    let targets = propIds;
    let weights: number[];
    if (evenly) {
      targets = real.length ? real : propIds;
      weights = targets.map(() => 1);
    } else {
      weights = targets.map((id) => parties[id].itemsC);
    }
    const parts = allocate(amount, weights, items.length);
    targets.forEach((id, i) => {
      parties[id][key] += parts[i];
    });
  };
  // Tax/tip/discount follow what each person ordered; unassigned items carry
  // their own share until they're assigned.
  spread(taxC, 'taxC', false);
  spread(tipC, 'tipC', false);
  const discountAppliedC = clampDiscount(discountC, subtotalC);
  spread(-discountAppliedC, 'discountC', false);
  spread(feesC, 'feesC', !!feesEven);

  let totalC = 0;
  for (const p of Object.values(parties)) {
    p.totalC = p.itemsC + p.taxC + p.tipC + p.feesC + p.discountC;
    totalC += p.totalC;
  }
  return {
    parties,
    subtotalC,
    totalC,
    expectedTotalC: subtotalC + taxC + tipC + feesC - discountAppliedC,
    discountAppliedC,
    discountClamped: Math.abs(Math.round(Number(discountC) || 0)) > discountAppliedC,
  };
}

export type Reconciliation =
  | { status: 'match'; diffC: 0 }
  | { status: 'mismatch'; diffC: number }
  /** The receipt had no usable total, so there is nothing to compare against. */
  | { status: 'unknown'; diffC: 0 };

/**
 * Compare what the split adds up to with the total printed on the receipt.
 * `diffC` is computed minus receipt (positive: we charge more than the receipt says).
 * Comparing the split with its own expected total proves nothing, so without a
 * receipt total the answer is 'unknown'.
 */
export function reconcile(
  computedTotalC: number,
  receiptTotalC: number | null | undefined,
): Reconciliation {
  if (receiptTotalC == null || !Number.isFinite(receiptTotalC) || receiptTotalC <= 0) {
    return { status: 'unknown', diffC: 0 };
  }
  const diffC = Math.round(computedTotalC) - Math.round(receiptTotalC);
  return diffC === 0 ? { status: 'match', diffC: 0 } : { status: 'mismatch', diffC };
}
