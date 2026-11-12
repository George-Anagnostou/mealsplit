import {
  billNote,
  groupSummary,
  shareMessage,
  smsLink,
  venmoAppLink,
  venmoWebLink,
  zelleMessage,
} from '../core/links';
import { fmt } from '../core/money';
import { type PartyTotals, UNASSIGNED } from '../core/split';
import { computeBill, partiesOf } from '../state/selectors';
import { useAppState } from '../state/store';
import { type AppState, type Friend, ME } from '../state/types';
import { Avatar } from './Avatar';
import { useCopy } from './Toast';

interface CardProps {
  name: string;
  totals: PartyTotals;
  friend?: Friend;
  note: string;
  state: AppState;
}

function PartyCard({ name, totals, friend, note, state }: CardProps) {
  const copy = useCopy();
  const isMe = !friend;
  const extras: [string, number][] = (
    [
      ['Tax', totals.taxC],
      ['Tip', totals.tipC],
      ['Fees', totals.feesC],
      ['Discount', totals.discountC],
    ] as [string, number][]
  ).filter(([, v]) => v);

  let actions = null;
  if (friend) {
    const { me } = state;
    const msg = shareMessage({ name: friend.name, cents: totals.totalC, note, me });
    const zelle = zelleMessage({ name: friend.name, cents: totals.totalC, note, me });
    const link = { username: friend.venmo, cents: totals.totalC, note };
    actions = (
      <>
        <div className="btns">
          <a className="btn venmo grow" href={venmoWebLink(link)} rel="noopener">
            Request on Venmo
          </a>
          <a className="btn grow" href={smsLink({ to: friend.contact, body: msg })}>
            Text · Apple Cash
          </a>
          <button type="button" className="grow" onClick={() => copy(zelle, 'Zelle text copied')}>
            Copy · Zelle
          </button>
          <button type="button" className="ghost grow" onClick={() => copy(msg, 'Message copied')}>
            Copy message
          </button>
        </div>
        <div className="mini">
          {friend.venmo ? '' : 'No Venmo username saved, so you’ll pick the person in Venmo. '}
          <a href={venmoAppLink(link)}>Venmo app link</a>
        </div>
      </>
    );
  }

  return (
    <div className={`card pcard${isMe ? ' me' : ''}`}>
      <h3>
        <Avatar name={name} />
        {name}
        <span className="big">{fmt(totals.totalC)}</span>
      </h3>
      <div className="lines">
        {totals.items.map((l) => (
          <div key={l.index}>
            <span>
              {state.bill.items[l.index]?.name || 'Item'}
              {l.of > 1 && <small> (1/{l.of})</small>}
            </span>
            <span>{fmt(l.shareC)}</span>
          </div>
        ))}
        {extras.map(([k, v], i) => (
          <div key={k} className={i === 0 ? 'sep' : undefined}>
            <span>{k}</span>
            <span>{fmt(v)}</span>
          </div>
        ))}
      </div>
      {actions}
    </div>
  );
}

export function SplitView() {
  const state = useAppState();
  const copy = useCopy();
  const { bill, me } = state;

  if (!bill.items.length) {
    return <div className="empty">Nothing to split yet. Start on the Receipt tab.</div>;
  }

  const r = computeBill(bill);
  const note = billNote(bill.title || 'Dinner', bill.date);
  const unassigned = r.parties[UNASSIGNED];
  const friends = partiesOf(state)
    .filter((p) => p.id !== ME && r.parties[p.id])
    .map((p) => ({
      party: p,
      totals: r.parties[p.id],
      friend: state.people.find((q) => q.id === p.id),
    }));
  const meTotals = r.parties[ME];
  const meName = me.name || 'Me';
  const reconOk = r.totalC === r.expectedTotalC;

  const summary = () =>
    groupSummary({
      note,
      totalC: r.expectedTotalC,
      rows: friends.map(({ party, totals }) => ({ name: party.name, ...totals })),
      meRow: meTotals ? { name: meName, totalC: meTotals.totalC } : null,
    });

  return (
    <div>
      {unassigned && (
        <div className="banner warn">
          {unassigned.count} item{unassigned.count > 1 ? 's' : ''} ({fmt(unassigned.totalC)} with
          tax/tip) still unassigned.
        </div>
      )}
      <div className="btns" style={{ marginTop: 4 }}>
        <button
          type="button"
          className="primary grow"
          style={{ flex: 1 }}
          onClick={() => copy(summary(), 'Summary copied')}
        >
          Copy summary for the group
        </button>
      </div>
      {friends.map(({ party, totals, friend }) => (
        <PartyCard
          key={party.id}
          name={party.name}
          totals={totals}
          friend={friend}
          note={note}
          state={state}
        />
      ))}
      {meTotals && (
        <PartyCard name={`${meName} (me)`} totals={meTotals} note={note} state={state} />
      )}
      <div className={`recon ${reconOk ? 'ok' : 'bad'}`}>
        Shares add up to <b>{fmt(r.totalC)}</b> · receipt total <b>{fmt(r.expectedTotalC)}</b>{' '}
        {reconOk ? '✓' : '⚠'}
      </div>
    </div>
  );
}
