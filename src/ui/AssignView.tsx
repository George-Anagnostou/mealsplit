import { useState } from 'react';
import { fmt } from '../core/money';
import { unassignedItems } from '../state/flow';
import { nameOf, partiesOf, presentWho } from '../state/selectors';
import { useAppState, useDispatch } from '../state/store';
import { Avatar } from './Avatar';
import { useToast } from './Toast';

const smooth = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/**
 * Tap an item, then tap who had it. Turn on "Select several" to tap more items first: the
 * people you tap then apply to all of them (a person is "mixed" when only some have it).
 * Everything here can be undone.
 */
export function AssignView() {
  const state = useAppState();
  const dispatch = useDispatch();
  const toast = useToast();
  const { bill } = state;
  const [picked, setPicked] = useState<string[]>([]);
  const [several, setSeveral] = useState(false);

  const parties = partiesOf(state);
  const everyone = parties.map((p) => p.id);
  const missing = unassignedItems(state);
  // Ids can go stale when items are removed on the Receipt step.
  const sel = bill.items.filter((it) => picked.includes(it.id));
  const selTotal = sel.reduce((n, it) => n + it.cents, 0);
  const canUndo = state.undo.length > 0;
  const undo = () => dispatch({ type: 'undo' });
  const undoable = (message: string) => toast(message, { label: 'Undo', onClick: undo });

  const pickItem = (id: string) => {
    if (several) setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
    else setPicked(picked.length === 1 && picked[0] === id ? [] : [id]);
  };

  const setMode = (on: boolean) => {
    setSeveral(on);
    if (!on) setPicked(picked.slice(0, 1));
  };

  const next = () => {
    const nextItem = bill.items[bill.items.findIndex((i) => i.id === sel[0]?.id) + 1];
    setPicked(nextItem ? [nextItem.id] : []);
    if (nextItem) {
      requestAnimationFrame(() =>
        document
          .getElementById(`arow-${nextItem.id}`)
          ?.scrollIntoView({ block: 'center', behavior: smooth() }),
      );
    }
  };

  const allHave = (id: string) => sel.length > 0 && sel.every((it) => it.who.includes(id));
  const someHave = (id: string) => sel.some((it) => it.who.includes(id));
  const everyoneOnSel = sel.length > 0 && everyone.every(allHave);

  let banner: { cls: string; text: string; fix?: boolean };
  if (!bill.items.length) banner = { cls: 'empty', text: 'Add items on the Receipt step first.' };
  else if (parties.length < 2)
    banner = { cls: 'banner warn', text: 'Add friends on the People step and tick who’s here.' };
  else if (missing.length)
    banner = {
      cls: 'banner warn',
      text: `${missing.length} item${missing.length > 1 ? 's' : ''} not assigned yet. Tap an item, then tap who had it.`,
      fix: true,
    };
  else banner = { cls: 'banner', text: 'Everything is assigned ✓ Head to Split.' };

  return (
    <>
      <div className={banner.cls} role={banner.cls === 'banner warn' ? 'status' : undefined}>
        <span>{banner.text}</span>
        {banner.fix && (
          <button
            type="button"
            className="small"
            onClick={() => {
              dispatch({ type: 'setWhoMany', itemIds: missing.map((i) => i.id), who: everyone });
              undoable('Split the rest among everyone');
            }}
          >
            Split the rest among everyone
          </button>
        )}
      </div>

      {bill.items.length > 0 && (
        <div className="toolbar">
          <button
            type="button"
            className="ghost small"
            aria-pressed={several}
            onClick={() => setMode(!several)}
          >
            Select several
          </button>
          {several && (
            <button
              type="button"
              className="ghost small"
              onClick={() => setPicked(missing.map((i) => i.id))}
              disabled={missing.length === 0}
            >
              Pick unassigned
            </button>
          )}
          <button type="button" className="ghost small push" disabled={!canUndo} onClick={undo}>
            ↶ Undo
          </button>
        </div>
      )}

      <div>
        {bill.items.map((it) => {
          const who = presentWho(bill, it.who);
          const on = picked.includes(it.id);
          const names = who.map((id) => nameOf(state, id));
          return (
            <fieldset key={it.id} className={`arow${on ? ' sel' : ''}${who.length ? '' : ' none'}`}>
              <legend className="sr">{`${it.name || 'Item'}, ${fmt(it.cents)}`}</legend>
              <button
                type="button"
                id={`arow-${it.id}`}
                className="pick"
                aria-pressed={on}
                onClick={() => pickItem(it.id)}
              >
                <span className="nm">{it.name || 'Item'}</span>
                <span className="who" aria-hidden="true">
                  {who.map((id) => (
                    <Avatar key={id} name={nameOf(state, id)} small />
                  ))}
                </span>
                <span className="pr">{fmt(it.cents)}</span>
                <span className="sr">
                  {names.length ? `. Shared by ${names.join(', ')}` : '. Not assigned'}
                </span>
              </button>
              {parties.length > 1 && (
                <button
                  type="button"
                  className="ghost small all"
                  aria-label={`Split ${it.name || 'item'} among everyone`}
                  onClick={() => dispatch({ type: 'setWho', itemId: it.id, who: everyone })}
                >
                  All
                </button>
              )}
            </fieldset>
          );
        })}
      </div>

      {bill.items.length > 0 && (
        <div className="btns pad">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              dispatch({ type: 'assignAll', ids: everyone });
              undoable('Everyone shares everything');
            }}
          >
            Everyone shares everything
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              dispatch({ type: 'clearAssign' });
              setPicked([]);
              undoable('Cleared all assignments');
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {sel.length > 0 && (
        <section className="picker" aria-label="Who had it?">
          <div className="ph">
            <b>
              {sel.length === 1
                ? `${sel[0].name || 'Item'} · ${fmt(sel[0].cents)}`
                : `${sel.length} items · ${fmt(selTotal)}`}
            </b>
            <span>
              <button
                type="button"
                className="ghost small"
                onClick={() =>
                  dispatch({
                    type: 'setWhoMany',
                    itemIds: sel.map((i) => i.id),
                    who: everyoneOnSel ? [] : everyone,
                  })
                }
              >
                {everyoneOnSel ? 'None' : 'Everyone'}
              </button>
              {sel.length === 1 ? (
                <button type="button" className="primary small" onClick={next}>
                  Next ›
                </button>
              ) : (
                <button type="button" className="primary small" onClick={() => setPicked([])}>
                  Done
                </button>
              )}
            </span>
          </div>
          <div className="chips">
            {parties.map((p) => {
              const all = allHave(p.id);
              const mixed = !all && someHave(p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  className={`chip${all ? ' on' : ''}${mixed ? ' mixed' : ''}`}
                  aria-pressed={all ? true : mixed ? 'mixed' : false}
                  onClick={() =>
                    dispatch({
                      type: 'toggleWhoMany',
                      itemIds: sel.map((i) => i.id),
                      partyId: p.id,
                    })
                  }
                >
                  <Avatar name={p.name} />
                  {p.name}
                  {p.me ? ' (me)' : ''}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
