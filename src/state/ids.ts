export const uid = (): string => Math.random().toString(36).slice(2, 9);

/** Everything impure a reducer action may need, made once by the caller so reducers stay pure. */
export interface Stamp {
  id: string;
  /** Local date as yyyy-mm-dd. */
  today: string;
  /** Epoch ms. */
  now: number;
}

export const todayISO = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const freshStamp = (): Stamp => ({ id: uid(), today: todayISO(), now: Date.now() });
