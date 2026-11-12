import { fmt } from '../core/money';
import { nameOf, partiesOf, presentWho } from '../state/selectors';
import { useAppState, useDispatch } from '../state/store';
import { Avatar } from './Avatar';

interface Props {
  sel: string | null;
  onSelect: (id: string | null) => void;
}

export function AssignView({ sel, onSelect }: Props) {
  const state = useAppState();
  const dispatch = useDispatch();
  const { bill } = state;
  const parties = partiesOf(state);
  const unassigned = bill.items.filter((i) => presentWho(bill, i.who).length === 0).length;
  const selIndex = bill.items.findIndex((i) => i.id === sel);
  const selItem = selIndex >= 0 ? bill.items[selIndex] : undefined;

  let banner: { cls: string; text: string };
  if (!bill.items.length) banner = { cls: 'empty', text: 'Add items on the Receipt tab first.' };
  else if (parties.length < 2)
    banner = { cls: 'banner warn', text: 'Add friends on the People tab and tick who’s here.' };
  else if (unassigned)
    banner = {
      cls: 'banner warn',
      text: `${unassigned} item${unassigned > 1 ? 's' : ''} not assigned yet. Tap an item, then tap who had it.`,
    };
  else banner = { cls: 'banner', text: 'Everything is assigned ✓ Head to Split.' };

  const everyone = selItem ? parties.every((p) => selItem.who.includes(p.id)) : false;

  const next = () => {
    const nextItem = bill.items[selIndex + 1];
    onSelect(nextItem ? nextItem.id : null);
    if (nextItem) {
      requestAnimationFrame(() =>
        document
          .getElementById(`arow-${nextItem.id}`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      );
    }
  };

  return (
    <>
      <div>
        <div className={banner.cls}>{banner.text}</div>
      </div>
      <div>
        {bill.items.map((it) => {
          const who = presentWho(bill, it.who);
          return (
            <button
              type="button"
              id={`arow-${it.id}`}
              key={it.id}
              className={`arow${sel === it.id ? ' sel' : ''}${who.length ? '' : ' none'}`}
              aria-pressed={sel === it.id}
              onClick={() => onSelect(sel === it.id ? null : it.id)}
            >
              <span className="nm">{it.name || 'Item'}</span>
              <span className="who">
                {who.map((id) => (
                  <Avatar key={id} name={nameOf(state, id)} small />
                ))}
              </span>
              <span className="pr">{fmt(it.cents)}</span>
            </button>
          );
        })}
      </div>
      <div className="btns pad">
        <button
          type="button"
          className="ghost"
          onClick={() => dispatch({ type: 'assignAll', ids: parties.map((p) => p.id) })}
        >
          Everyone shares everything
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            dispatch({ type: 'clearAssign' });
            onSelect(null);
          }}
        >
          Clear all
        </button>
      </div>

      {selItem && (
        <div className="picker">
          <div className="ph">
            <b>
              {selItem.name || 'Item'} · {fmt(selItem.cents)}
            </b>
            <span>
              <button
                type="button"
                className="ghost small"
                onClick={() =>
                  dispatch({
                    type: 'setWho',
                    itemId: selItem.id,
                    who: everyone ? [] : parties.map((p) => p.id),
                  })
                }
              >
                {everyone ? 'None' : 'Everyone'}
              </button>{' '}
              <button type="button" className="primary small" onClick={next}>
                Next ›
              </button>
            </span>
          </div>
          <div className="chips">
            {parties.map((p) => (
              <button
                type="button"
                key={p.id}
                className={`chip${selItem.who.includes(p.id) ? ' on' : ''}`}
                aria-pressed={selItem.who.includes(p.id)}
                onClick={() => dispatch({ type: 'toggleWho', itemId: selItem.id, partyId: p.id })}
              >
                <Avatar name={p.name} />
                {p.name}
                {p.me ? ' (me)' : ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
