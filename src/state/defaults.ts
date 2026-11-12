import { freshStamp, type Stamp } from './ids';
import type { AppState, Bill } from './types';

export const newBill = (stamp: Pick<Stamp, 'id' | 'today'>, here: string[] = []): Bill => ({
  id: stamp.id,
  title: '',
  date: stamp.today,
  raw: '',
  items: [],
  taxC: 0,
  feesC: 0,
  discountC: 0,
  tipMode: 'pct',
  tipPct: 0,
  tipAmtC: 0,
  feesEven: false,
  here,
  parsedTotalC: null,
  edited: [],
});

export const defaultState = (stamp: Pick<Stamp, 'id' | 'today'> = freshStamp()): AppState => ({
  me: { name: 'George', venmo: '', contact: '' },
  people: [],
  bill: newBill(stamp),
  history: [],
  tab: 'receipt',
  undo: [],
});
