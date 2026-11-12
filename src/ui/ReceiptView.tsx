import { useState } from 'react';
import { useAppState, useDispatch } from '../state/store';
import { AmountsCard } from './AmountsCard';
import { ItemsCard } from './ItemsCard';
import { ReceiptInput } from './ReceiptInput';

export function ReceiptView() {
  const { bill } = useAppState();
  const dispatch = useDispatch();
  // Rows the parser was unsure about. Transient on purpose (not saved); a row is cleared once edited.
  const [unsure, setUnsure] = useState<ReadonlySet<string>>(new Set());
  const settle = (id: string) =>
    setUnsure((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  return (
    <>
      <div className="card">
        <div className="row two">
          <label>
            What was it?
            <input
              value={bill.title}
              placeholder="Tacos"
              autoComplete="off"
              onChange={(e) => dispatch({ type: 'meta', field: 'title', value: e.target.value })}
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={bill.date}
              onChange={(e) => dispatch({ type: 'meta', field: 'date', value: e.target.value })}
            />
          </label>
        </div>
      </div>
      <ReceiptInput onUnsure={(ids) => setUnsure(new Set(ids))} />
      <ItemsCard unsure={unsure} onSettle={settle} />
      <AmountsCard />
    </>
  );
}
