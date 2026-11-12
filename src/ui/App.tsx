import { useEffect, useState } from 'react';
import { useAppState, useDispatch } from '../state/store';
import type { Tab } from '../state/types';
import { AssignView } from './AssignView';
import { PeopleView } from './PeopleView';
import { ReceiptView } from './ReceiptView';
import { SplitView } from './SplitView';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'receipt', icon: '🧾', label: 'Receipt' },
  { id: 'people', icon: '👥', label: 'People' },
  { id: 'assign', icon: '👆', label: 'Assign' },
  { id: 'split', icon: '💸', label: 'Split' },
];

export function App() {
  const { bill } = useAppState();
  const dispatch = useDispatch();
  const [tab, setTab] = useState<Tab>('receipt');
  const [sel, setSel] = useState<string | null>(null);
  // Bumped on "New bill" so the Receipt view drops its transient notices.
  const [epoch, setEpoch] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to top whenever the tab changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  const newBill = () => {
    if (bill.items.length && !confirm('Start a new bill? Your friends list is kept.')) return;
    dispatch({ type: 'newBill' });
    setSel(null);
    setEpoch((n) => n + 1);
    setTab('receipt');
  };

  return (
    <>
      <header className="top">
        <div className="brand">
          meal<b>split</b>
        </div>
        <button type="button" className="ghost small" onClick={newBill}>
          New bill
        </button>
      </header>

      <main id="main">
        <section className="tab" hidden={tab !== 'receipt'}>
          <ReceiptView key={epoch} onItemsReset={() => setSel(null)} />
        </section>
        {tab === 'people' && (
          <section className="tab">
            <PeopleView />
          </section>
        )}
        {tab === 'assign' && (
          <section className="tab">
            <AssignView sel={sel} onSelect={setSel} />
          </section>
        )}
        {tab === 'split' && (
          <section className="tab">
            <SplitView />
          </section>
        )}
      </main>

      <nav className="tabbar" aria-label="Steps">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={tab === t.id ? 'on' : ''}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <i aria-hidden="true">{t.icon}</i>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
