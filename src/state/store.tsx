import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import {
  storage as browserStorage,
  type LoadIssue,
  type SaveFailure,
  type Storage,
} from '../storage';
import { type Action, reducer } from './reducer';
import type { AppState } from './types';

/** What the user should hear about storage: unusable saved data, or a save that failed. */
export interface StorageStatus {
  storage: Storage;
  loadIssue: LoadIssue | null;
  saveFailure: SaveFailure | null;
  dismissLoadIssue: () => void;
  dismissSaveFailure: () => void;
}

const StateCtx = createContext<AppState | null>(null);
const DispatchCtx = createContext<Dispatch<Action> | null>(null);
const StatusCtx = createContext<StorageStatus | null>(null);

export function StoreProvider({
  children,
  storage = browserStorage,
}: {
  children: ReactNode;
  storage?: Storage;
}) {
  const [loaded] = useState(() => storage.load());
  const [state, dispatch] = useReducer(reducer, loaded.state);
  const [loadIssue, setLoadIssue] = useState(loaded.issue);
  const [saveFailure, setSaveFailure] = useState<SaveFailure | null>(null);
  const [saveDismissed, setSaveDismissed] = useState(false);

  useEffect(() => {
    const r = storage.save(state);
    setSaveFailure(r.ok ? null : r.reason);
    // Once saving works again, a later failure deserves a fresh notice.
    if (r.ok) setSaveDismissed(false);
  }, [state, storage]);

  const status = useMemo<StorageStatus>(
    () => ({
      storage,
      loadIssue,
      saveFailure: saveDismissed ? null : saveFailure,
      dismissLoadIssue: () => setLoadIssue(null),
      dismissSaveFailure: () => setSaveDismissed(true),
    }),
    [storage, loadIssue, saveFailure, saveDismissed],
  );

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>
        <StatusCtx.Provider value={status}>{children}</StatusCtx.Provider>
      </DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useAppState(): AppState {
  const v = useContext(StateCtx);
  if (!v) throw new Error('useAppState outside StoreProvider');
  return v;
}

export function useDispatch(): Dispatch<Action> {
  const v = useContext(DispatchCtx);
  if (!v) throw new Error('useDispatch outside StoreProvider');
  return v;
}

export function useStorageStatus(): StorageStatus {
  const v = useContext(StatusCtx);
  if (!v) throw new Error('useStorageStatus outside StoreProvider');
  return v;
}
