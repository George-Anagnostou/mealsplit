import { useRef, useState } from 'react';
import { cleanVenmo } from '../core/links';
import { uid } from '../state/ids';
import { friendFromInput } from '../state/selectors';
import { useAppState, useDispatch } from '../state/store';
import type { Friend } from '../state/types';
import { Avatar } from './Avatar';

type FriendField = 'name' | 'venmo' | 'contact';

function FriendRow({ friend, here }: { friend: Friend; here: boolean }) {
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(false);
  const edit = (field: FriendField) => (e: { target: { value: string } }) =>
    dispatch({ type: 'editFriend', id: friend.id, field, value: e.target.value });

  if (editing) {
    return (
      <div className="editbox">
        <div className="grid">
          <label>
            Name
            <input value={friend.name} onChange={edit('name')} />
          </label>
          <label>
            Venmo
            <input value={friend.venmo} onChange={edit('venmo')} autoCapitalize="none" />
          </label>
          <label className="span">
            Phone or email
            <input value={friend.contact} onChange={edit('contact')} />
          </label>
        </div>
        <div className="btns">
          <button type="button" className="primary small" onClick={() => setEditing(false)}>
            Done
          </button>
          <button
            type="button"
            className="ghost small"
            onClick={() => {
              if (confirm('Delete this friend?')) dispatch({ type: 'deleteFriend', id: friend.id });
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  const sub =
    [friend.venmo && `@${cleanVenmo(friend.venmo)}`, friend.contact].filter(Boolean).join(' · ') ||
    'no payment details';
  return (
    <div className="friend">
      <input
        type="checkbox"
        checked={here}
        aria-label={`${friend.name} is at this meal`}
        onChange={() => dispatch({ type: 'toggleHere', id: friend.id })}
      />
      <Avatar name={friend.name} />
      <div className="info">
        <div className="nm">{friend.name}</div>
        <div className="sub">{sub}</div>
      </div>
      <button type="button" className="ghost small" onClick={() => setEditing(true)}>
        Edit
      </button>
    </div>
  );
}

export function PeopleView() {
  const { me, people, bill } = useAppState();
  const dispatch = useDispatch();
  const [name, setName] = useState('');
  const [venmo, setVenmo] = useState('');
  const [contact, setContact] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const setMe = (field: FriendField) => (e: { target: { value: string } }) =>
    dispatch({ type: 'setMe', field, value: e.target.value });

  return (
    <>
      <div className="card">
        <h2>Me</h2>
        <p className="hint">
          You aren’t charged. These details go in the messages you send so friends know where to pay
          you.
        </p>
        <div className="grid">
          <label>
            Name
            <input value={me.name} placeholder="George" onChange={setMe('name')} />
          </label>
          <label>
            My Venmo
            <input
              value={me.venmo}
              placeholder="@username"
              autoCapitalize="none"
              onChange={setMe('venmo')}
            />
          </label>
          <label className="span">
            My Zelle / Apple Cash (phone or email)
            <input value={me.contact} placeholder="optional" onChange={setMe('contact')} />
          </label>
        </div>
      </div>
      <div className="card">
        <h2>Friends</h2>
        <p className="hint">
          Saved on this device. Tick who’s at this meal. A new bill starts with the same people
          ticked, so you only change what’s different.
        </p>
        <div>
          {people.length ? (
            people.map((p) => <FriendRow key={p.id} friend={p} here={bill.here.includes(p.id)} />)
          ) : (
            <p className="hint">No friends yet. Add some below.</p>
          )}
        </div>
        <form
          className="addfriend"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            const friend = friendFromInput(uid(), { name, venmo, contact });
            if (!friend) return;
            dispatch({ type: 'addFriend', friend });
            setName('');
            setVenmo('');
            setContact('');
            nameRef.current?.focus();
          }}
        >
          <div className="grid">
            <label>
              Name
              <input
                ref={nameRef}
                value={name}
                placeholder="Sam"
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Venmo
              <input
                value={venmo}
                placeholder="@sam"
                autoCapitalize="none"
                onChange={(e) => setVenmo(e.target.value)}
              />
            </label>
            <label className="span">
              Phone or email (Zelle / Apple Cash)
              <input
                value={contact}
                placeholder="optional"
                onChange={(e) => setContact(e.target.value)}
              />
            </label>
          </div>
          <button className="primary" type="submit">
            Add friend
          </button>
        </form>
      </div>
    </>
  );
}
