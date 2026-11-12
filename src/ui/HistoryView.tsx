import { useState } from 'react';
import { fmt } from '../core/money';
import { freshStamp } from '../state/ids';
import { mealState, mealSummary, prettyDate } from '../state/selectors';
import { useAppState, useDispatch } from '../state/store';
import { DataCard } from './DataCard';
import { SplitBody } from './SplitView';
import { useToast } from './Toast';

function PastMeal({ id, onBack }: { id: string; onBack: () => void }) {
  const state = useAppState();
  const dispatch = useDispatch();
  const toast = useToast();
  const meal = state.history.find((m) => m.bill.id === id);
  if (!meal) {
    return (
      <div className="card">
        <p className="hint">That meal isn’t in your history any more.</p>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </div>
    );
  }
  const sum = mealSummary(meal, state.me.name);
  return (
    <>
      <div className="card">
        <div className="btns" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="ghost small" onClick={onBack}>
            ‹ History
          </button>
          <button
            type="button"
            className="primary small"
            onClick={() => {
              dispatch({ type: 'duplicateMeal', billId: id, stamp: freshStamp() });
              toast('Copied into a new bill');
            }}
          >
            Duplicate into new bill
          </button>
        </div>
        <h2 className="mealtitle">{sum.label}</h2>
        <p className="hint">
          {prettyDate(sum.date)} · {sum.people.join(', ')} · read-only
        </p>
      </div>
      <SplitBody state={mealState(state, meal)} />
    </>
  );
}

export function HistoryView() {
  const state = useAppState();
  const [open, setOpen] = useState<string | null>(null);

  if (open) return <PastMeal id={open} onBack={() => setOpen(null)} />;

  return (
    <>
      <div className="card">
        <h2>Past meals</h2>
        {state.history.length ? (
          <ul className="meals">
            {state.history.map((m) => {
              const s = mealSummary(m, state.me.name);
              return (
                <li key={s.id}>
                  <button type="button" className="meal" onClick={() => setOpen(s.id)}>
                    <span className="mt">
                      <b>{s.label}</b>
                      <small>
                        {prettyDate(s.date)} · {s.people.join(', ')}
                      </small>
                    </span>
                    <span className="mp">{fmt(s.totalC)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="hint">
            Nothing yet. A bill is saved here when you tap “Save to history” on the Split step or
            start a new bill. The last 20 are kept.
          </p>
        )}
      </div>
      <DataCard />
    </>
  );
}
