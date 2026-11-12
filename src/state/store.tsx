import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
} from 'react';
import { type Action, reducer } from './reducer';
import { loadState, saveState } from './storage';
import type { AppState } from './types';

const StateCtx = createContext<AppState | null>(null);
const DispatchCtx = createContext<Dispatch<Action> | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  useEffect(() => {
    saveState(state);
  }, [state]);
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
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
