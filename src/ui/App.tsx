import { useEffect, useRef, useState } from 'react';
import { titleOf } from '../state/flow';
import { freshStamp } from '../state/ids';
import { useAppState, useDispatch } from '../state/store';
import type { Tab } from '../state/types';
import { AssignView } from './AssignView';
import { FlowBar } from './FlowBar';
import { HistoryView } from './HistoryView';
import { Notices } from './Notices';
import { PeopleView } from './PeopleView';
import { ReceiptView } from './ReceiptView';
import { SplitView } from './SplitView';
import { StepBar } from './StepBar';
import { useToast } from './Toast';

export function App() {
  const { bill, tab } = useAppState();
  const dispatch = useDispatch();
  const toast = useToast();
  const setTab = (t: Tab) => dispatch({ type: 'setTab', tab: t });
  // Bumped on "New bill" so the Receipt view drops its transient notices.
  const [epoch, setEpoch] = useState(0);
  // Where the History button's "back" goes.
  const lastStep = useRef<Tab>('receipt');
  if (tab !== 'history') lastStep.current = tab;
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // On a new tab: start at the top, and move focus to the heading so screen readers (and
  // keyboard users) land on the new step rather than on a button that has since gone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs whenever the tab changes
  useEffect(() => {
    window.scrollTo(0, 0);
    if (first.current) first.current = false;
    else heading.current?.focus({ preventScroll: true });
  }, [tab]);

  const newBill = () => {
    // Nothing is lost: the bill goes to History, and the same friends stay ticked.
    dispatch({ type: 'newBill', stamp: freshStamp() });
    setEpoch((n) => n + 1);
    setTab('receipt');
    if (bill.items.length) toast('Saved to history. New bill started');
  };

  const save = () => {
    dispatch({ type: 'finishBill', now: Date.now() });
    toast('Saved to history');
  };

  return (
    <>
      <header className="top">
        <div className="bar">
          <div className="brand">
            meal<b>split</b>
          </div>
          <div className="actions">
            <button
              type="button"
              className="ghost small"
              aria-current={tab === 'history' ? 'page' : undefined}
              onClick={() => setTab(tab === 'history' ? lastStep.current : 'history')}
            >
              {tab === 'history' ? '‹ Bill' : 'History'}
            </button>
            <button type="button" className="ghost small" onClick={newBill}>
              New bill
            </button>
          </div>
        </div>
        <StepBar />
      </header>

      <Notices />

      <main id="main" className={tab}>
        <h1 ref={heading} tabIndex={-1}>
          {titleOf(tab)}
        </h1>
        <section className="tab" hidden={tab !== 'receipt'}>
          <ReceiptView key={epoch} />
        </section>
        {tab === 'people' && (
          <section className="tab">
            <PeopleView />
          </section>
        )}
        {tab === 'assign' && (
          <section className="tab">
            <AssignView />
          </section>
        )}
        {tab === 'split' && (
          <section className="tab">
            <SplitView onFix={() => setTab('assign')} />
          </section>
        )}
        {tab === 'history' && (
          <section className="tab">
            <HistoryView />
          </section>
        )}
      </main>

      <FlowBar onSave={save} />
    </>
  );
}
