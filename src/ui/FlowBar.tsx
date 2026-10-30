import type { Step } from '../state/flow';
import { nextStep, prevStep, STEPS, unassignedItems } from '../state/flow';
import { useAppState, useDispatch } from '../state/store';

const labelOf = (id: Step) => STEPS.find((s) => s.id === id)?.label ?? '';

interface Props {
  onSave: () => void;
}

/**
 * Back and Next along the bottom, in thumb reach. On Assign, Next turns into a plain
 * "Split anyway" while anything is unassigned, so it can't be tapped by accident. On Split,
 * the forward action is saving the bill.
 */
export function FlowBar({ onSave }: Props) {
  const state = useAppState();
  const dispatch = useDispatch();
  const { tab } = state;
  const prev = prevStep(tab);
  const next = nextStep(tab);
  const go = (t: Step) => dispatch({ type: 'setTab', tab: t });
  const open = tab === 'assign' && unassignedItems(state).length > 0;

  if (tab === 'history') return null;
  return (
    <nav className="flowbar" aria-label="Back and next">
      {prev && (
        <button type="button" className="back" onClick={() => go(prev)}>
          ‹ Back
          <span className="sr">: {labelOf(prev)}</span>
        </button>
      )}
      {next && (
        <button
          type="button"
          className={open ? 'fwd warnbtn' : 'fwd primary'}
          onClick={() => go(next)}
        >
          {open ? `${labelOf(next)} anyway ›` : `Next: ${labelOf(next)} ›`}
        </button>
      )}
      {tab === 'split' && (
        <button
          type="button"
          className="fwd primary"
          disabled={state.bill.items.length === 0}
          onClick={onSave}
        >
          Save to history
        </button>
      )}
    </nav>
  );
}
