import { useAppState, useDispatch } from '../state/store';
import { AmountsCard } from './AmountsCard';
import { ItemsCard } from './ItemsCard';
import { ReceiptInput } from './ReceiptInput';

export function ReceiptView() {
  const { bill } = useAppState();
  const dispatch = useDispatch();

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
      <ReceiptInput />
      <ItemsCard />
      <AmountsCard />
    </>
  );
}
