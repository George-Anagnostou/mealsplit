import { STEPS, stepsDone } from '../state/flow';
import { useAppState, useDispatch } from '../state/store';

/**
 * Receipt → People → Assign → Split. Every step is a button, so you can jump back to fix
 * something; the current one carries aria-current="step". Steps that look finished get a check.
 */
export function StepBar() {
  const state = useAppState();
  const dispatch = useDispatch();
  const done = stepsDone(state);
  return (
    <nav className="steps" aria-label="Steps">
      <ol>
        {STEPS.map((s, i) => {
          const current = state.tab === s.id;
          const ok = done[s.id] && !current;
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`step${current ? ' on' : ''}${ok ? ' done' : ''}`}
                aria-current={current ? 'step' : undefined}
                onClick={() => dispatch({ type: 'setTab', tab: s.id })}
              >
                <span className="dot" aria-hidden="true">
                  {ok ? '✓' : i + 1}
                </span>
                <span className="lbl">{s.label}</span>
                {ok && <span className="sr"> (done)</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
