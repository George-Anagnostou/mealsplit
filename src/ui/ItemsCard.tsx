import { fmt } from '../core/money';
import { draftIsStale, itemLabel } from '../state/selectors';
import { useAppState } from '../state/store';

export function ItemsCard() {
  const { bill } = useAppState();
  return (
    <div className="card">
      <h2>Draft items</h2>
      {draftIsStale(bill) ? (
        <p className="hint" role="status">
          Input changed. Parse text to update the draft before assigning or splitting.
        </p>
      ) : bill.items.length ? (
        <>
          <p className="hint">To correct a row, edit the receipt text and parse again.</p>
          <ul className="draft-items" aria-label="Draft items">
            {bill.items.map((it) => (
              <li className="itemrow" key={it.id}>
                <span className="nm">
                  {itemLabel(it)}
                  {it.unitC !== undefined && <small>{fmt(it.unitC)} each</small>}
                </span>
                <span className="price">{fmt(it.cents)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="hint">Enter one item per line, then choose Parse text.</p>
      )}
    </div>
  );
}
