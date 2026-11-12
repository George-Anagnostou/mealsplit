import {
  groupSummary,
  owesNothing,
  shareMessage,
  smsLink,
  venmoAppLink,
  venmoWebLink,
  zelleMessage,
} from '../core/links';
import { fmt } from '../core/money';
import type { PartyTotals } from '../core/split';
import { splitSummary } from '../state/selectors';
import { useAppState } from '../state/store';
import type { AppState, Friend } from '../state/types';
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
  if (owesNothing(totals.totalC)) {
    // No Venmo, Apple Cash or Zelle request for a $0 share (and none for yourself).
    actions = (
      <div className="owes0">{isMe ? 'You owe nothing.' : 'Owes nothing. No request needed.'}</div>
    );
  } else if (friend) {
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
      <h2>
        <Avatar name={name.replace(/ \(me\)$/, '')} />
        {name}
        <span className="big">{fmt(totals.totalC)}</span>
      </h2>
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

/** The per-person breakdown for a bill. Used for the live bill and, read-only, for past meals. */
export function SplitBody({ state, onFix }: { state: AppState; onFix?: () => void }) {
  const copy = useCopy();
  const { bill } = state;

  if (!bill.items.length) {
    return <div className="empty">Nothing to split yet. Start on the Receipt step.</div>;
  }

  const {
    result: r,
    note,
    meName,
    discountNotice: notice,
    recon,
    unassigned,
    friends,
    meTotals,
  } = splitSummary(state);

  const summary = () =>
    groupSummary({
      note,
      totalC: r.expectedTotalC,
      rows: friends.map(({ party, totals }) => ({ name: party.name, ...totals })),
      meRow: meTotals ? { name: meName, totalC: meTotals.totalC } : null,
    });

  return (
    <div>
      {notice && <div className="banner warn">{notice}</div>}
      {unassigned && (
        <div className="banner warn" role="alert">
          <span>
            <b>
              {unassigned.count} item{unassigned.count > 1 ? 's' : ''} ({fmt(unassigned.totalC)}{' '}
              with tax/tip) still unassigned.
            </b>{' '}
            Nobody is being asked to pay for {unassigned.count > 1 ? 'them' : 'it'}, so the shares
            below add up to less than the bill.
          </span>
          {onFix && (
            <button type="button" className="small" onClick={onFix}>
              Assign {unassigned.count > 1 ? 'them' : 'it'}
            </button>
          )}
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
      {recon.status === 'unknown' ? (
        <div className="recon">
          Shares add up to <b>{fmt(r.totalC)}</b> · no receipt total to check against
        </div>
      ) : (
        <div className={`recon ${recon.status === 'match' ? 'ok' : 'bad'}`}>
          Shares add up to <b>{fmt(r.totalC)}</b> · receipt total{' '}
          <b>{fmt(bill.parsedTotalC ?? 0)}</b>{' '}
          {recon.status === 'match' ? '✓' : `⚠ off by ${fmt(Math.abs(recon.diffC))}`}
        </div>
      )}
    </div>
  );
}

export function SplitView({ onFix }: { onFix: () => void }) {
  return <SplitBody state={useAppState()} onFix={onFix} />;
}
