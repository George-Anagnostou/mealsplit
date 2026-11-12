import { useRef } from 'react';
import { toCents } from '../core/money';
import { uid } from '../state/ids';
import { useAppState, useDispatch } from '../state/store';
import { DecimalInput } from './DecimalInput';
import { moneyFormat } from './format';

interface Props {
  /** Rows the parser was unsure about; a row is cleared once you edit it. */
  unsure: ReadonlySet<string>;
  onSettle: (id: string) => void;
}

export function ItemsCard({ unsure, onSettle }: Props) {
  const { bill } = useAppState();
  const dispatch = useDispatch();
  const focusItem = useRef<string | null>(null);

  return (
    <div className="card">
      <h2>Items</h2>
      {bill.items.length ? (
        bill.items.map((it) => (
          <div
            className={unsure.has(it.id) ? 'itemrow lowconf' : 'itemrow'}
            key={it.id}
            title={
              unsure.has(it.id) ? 'Not sure I read this line right. Please check it.' : undefined
            }
          >
            <input
              className="nm"
              ref={(el) => {
                if (el && focusItem.current === it.id) {
                  focusItem.current = null;
                  el.focus();
                }
              }}
              value={it.name}
              placeholder="Item"
              aria-label="Item name"
              onChange={(e) => {
                onSettle(it.id);
                dispatch({ type: 'editItem', id: it.id, patch: { name: e.target.value } });
              }}
            />
            <DecimalInput
              className="price"
              placeholder="0.00"
              aria-label="Price"
              value={it.cents}
              parse={toCents}
              format={moneyFormat}
              onValue={(cents) => {
                onSettle(it.id);
                dispatch({ type: 'editItem', id: it.id, patch: { cents } });
              }}
            />
            <button
              type="button"
              className="x ghost"
              aria-label="Remove item"
              onClick={() => dispatch({ type: 'removeItem', id: it.id })}
            >
              ✕
            </button>
          </div>
        ))
      ) : (
        <p className="hint">No items yet. Paste or scan a receipt, or add items by hand.</p>
      )}
      <button
        type="button"
        className="ghost"
        onClick={() => {
          const id = uid();
          focusItem.current = id;
          dispatch({ type: 'addItem', id });
        }}
      >
        ＋ Add item
      </button>
    </div>
  );
}
