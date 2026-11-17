import { fmt } from '../core/money';
import { billTotals, draftIsStale } from '../state/selectors';
import { useAppState } from '../state/store';

/** Old bills keep their original amounts; parsing text replaces them with ordinary rows. */
export function AmountsCard() {
  const { bill } = useAppState();
  if (!bill.items.length || draftIsStale(bill)) return null;
  const t = billTotals(bill);
  const legacy = [
    ['Tax', bill.taxC],
    ['Tip', t.tipC],
    ['Fees', bill.feesC],
    ['Discount', -t.discountC],
  ] as const;
  return (
    <div className="card">
      {legacy.some(([, value]) => value !== 0) && (
        <>
          <p className="hint">
            This older bill includes saved adjustments. To change it, put all charges and credits in
            the input text and parse again.
          </p>
          <div className="lines">
            {legacy
              .filter(([, value]) => value !== 0)
              .map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <span>{fmt(value)}</span>
                </div>
              ))}
          </div>
        </>
      )}
      <div className="totals">
        <div className="grand">
          <span>Draft subtotal</span>
          <span>{fmt(t.totalC)}</span>
        </div>
      </div>
      <p className="mini">Calculated from your entries. Compare with your receipt; not verified.</p>
    </div>
  );
}
