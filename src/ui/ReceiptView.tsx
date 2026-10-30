import { useRef, useState } from 'react';
import { dollars, fmt, toCents } from '../core/money';
import { parseReceipt } from '../core/parser';
import { scanReceipt } from '../ocr/ocr';
import { uid } from '../state/ids';
import { grandTotalOf, subtotalOf, tipOf } from '../state/selectors';
import { useAppState, useDispatch } from '../state/store';
import type { Bill } from '../state/types';
import { DecimalInput } from './DecimalInput';
import { useToast } from './Toast';

const EXAMPLE = `Order from Chipotle
1x Burrito Bowl - Chicken   $11.95
2x Chips & Guacamole   $8.90
1x Kids Quesadilla   $5.45
1x Fountain Drink   $2.99
1x Tacos (3)   $10.50
Subtotal   $39.79
Delivery Fee   $1.99
Service Fee   $4.40
Estimated Tax   $3.62
Promo   -$5.00
Dasher Tip   $5.00
Total   $49.80`;

const moneyParse = (t: string) => Math.max(0, toCents(t));
const moneyFormat = (c: number) => (c ? dollars(c) : '');

function Totals({ bill }: { bill: Bill }) {
  const sub = subtotalOf(bill);
  const tip = tipOf(bill);
  const total = grandTotalOf(bill);
  const diff = bill.parsedTotalC == null ? 0 : total - bill.parsedTotalC;
  return (
    <div className="totals">
      <div>
        <span>Items subtotal</span>
        <span>{fmt(sub)}</span>
      </div>
      <div>
        <span>Tax</span>
        <span>{fmt(bill.taxC)}</span>
      </div>
      <div>
        <span>Tip{bill.tipMode === 'pct' ? ` (${bill.tipPct || 0}%)` : ''}</span>
        <span>{fmt(tip)}</span>
      </div>
      <div>
        <span>Fees</span>
        <span>{fmt(bill.feesC)}</span>
      </div>
      {bill.discountC ? (
        <div>
          <span>Discount</span>
          <span>-{fmt(bill.discountC)}</span>
        </div>
      ) : null}
      <div className="grand">
        <span>Total</span>
        <span>{fmt(total)}</span>
      </div>
      {bill.parsedTotalC != null &&
        (diff === 0 ? (
          <div className="ok">
            <span>Receipt total</span>
            <span>{fmt(bill.parsedTotalC)} ✓</span>
          </div>
        ) : (
          <div className="bad">
            <span>Receipt says {fmt(bill.parsedTotalC)}</span>
            <span>off by {fmt(diff)}</span>
          </div>
        ))}
    </div>
  );
}

interface Props {
  /** Called when the item list changes under the Assign selection. */
  onItemsReset: () => void;
}

export function ReceiptView({ onItemsReset }: Props) {
  const { bill } = useAppState();
  const dispatch = useDispatch();
  const toast = useToast();
  const [warnings, setWarnings] = useState<string[]>([]);
  const focusItem = useRef<string | null>(null);
  const [ocr, setOcr] = useState<{ message: string; progress?: number } | null>(null);

  const parse = (text: string) => {
    const parsed = parseReceipt(text);
    dispatch({ type: 'applyParsed', parsed, ids: parsed.items.map(uid) });
    setWarnings(parsed.warnings);
    onItemsReset();
    const n = parsed.items.length;
    toast(`${n} item${n === 1 ? '' : 's'} found`);
  };

  const onExample = () => {
    dispatch({ type: 'meta', field: 'raw', value: EXAMPLE });
    if (!bill.title) dispatch({ type: 'meta', field: 'title', value: 'Burritos' });
    parse(EXAMPLE);
  };

  const onPhoto = async (file: File) => {
    try {
      const text = await scanReceipt(file, (message, progress) => setOcr({ message, progress }));
      dispatch({ type: 'meta', field: 'raw', value: text });
      parse(text);
      setOcr({ message: 'Done. OCR can misread digits, so check each item and the totals below.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setOcr({ message: `Scan failed: ${msg}. You can still paste the text.` });
    }
  };

  const onTipValue = (v: number) =>
    dispatch(bill.tipMode === 'pct' ? { type: 'tipPct', pct: v } : { type: 'tipAmt', cents: v });

  return (
    <>
      <div className="card">
        <div className="row two">
          <label>
            What was it?
            <input
              value={bill.title}
              placeholder="Tacos"
              autoComplete="off"
              onChange={(e) => dispatch({ type: 'meta', field: 'title', value: e.target.value })}
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={bill.date}
              onChange={(e) => dispatch({ type: 'meta', field: 'date', value: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Receipt</h2>
        <textarea
          rows={5}
          placeholder="Paste receipt text here…"
          aria-label="Receipt text"
          value={bill.raw}
          onChange={(e) => dispatch({ type: 'meta', field: 'raw', value: e.target.value })}
        />
        <div className="btns">
          <button type="button" className="primary" onClick={() => parse(bill.raw)}>
            Parse text
          </button>
          <label className="btn">
            📷 Scan photo
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void onPhoto(f);
              }}
            />
          </label>
          <button type="button" className="ghost" onClick={onExample}>
            Example
          </button>
        </div>
        {ocr && (
          <div className="status">
            {ocr.message}
            {ocr.progress != null && (
              <div className="progress">
                <i style={{ width: `${Math.round(ocr.progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}
        {warnings.length > 0 && <div className="warn">{warnings.join(' ')}</div>}
      </div>

      <div className="card">
        <h2>Items</h2>
        {bill.items.length ? (
          bill.items.map((it) => (
            <div className="itemrow" key={it.id}>
              <input
                className="nm"
                ref={(el) => {
                  if (el && focusItem.current === it.id) {
                    focusItem.current = null;
                    el.focus();
                  }
                }}
                value={it.name}
                placeholder="Item"
                aria-label="Item name"
                onChange={(e) =>
                  dispatch({ type: 'editItem', id: it.id, patch: { name: e.target.value } })
                }
              />
              <DecimalInput
                className="price"
                placeholder="0.00"
                aria-label="Price"
                value={it.cents}
                parse={toCents}
                format={moneyFormat}
                onValue={(cents) => dispatch({ type: 'editItem', id: it.id, patch: { cents } })}
              />
              <button
                type="button"
                className="x ghost"
                aria-label="Remove item"
                onClick={() => {
                  dispatch({ type: 'removeItem', id: it.id });
                  onItemsReset();
                }}
              >
                ✕
              </button>
            </div>
          ))
        ) : (
          <p className="hint">No items yet. Paste or scan a receipt, or add items by hand.</p>
        )}
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const id = uid();
            focusItem.current = id;
            dispatch({ type: 'addItem', id });
          }}
        >
          ＋ Add item
        </button>
      </div>

      <div className="card">
        <h2>Tax, tip &amp; fees</h2>
        <div className="grid">
          {(
            [
              ['Tax', 'taxC'],
              ['Fees', 'feesC'],
              ['Discount', 'discountC'],
            ] as const
          ).map(([label, field]) => (
            <label key={field}>
              {label}
              <DecimalInput
                placeholder="0.00"
                value={bill[field]}
                parse={moneyParse}
                format={moneyFormat}
                onValue={(cents) => dispatch({ type: 'money', field, cents })}
              />
            </label>
          ))}
          <label>
            Tip
            <span className="tipbox">
              <DecimalInput
                key={bill.tipMode}
                placeholder={bill.tipMode === 'pct' ? '20' : '0.00'}
                value={bill.tipMode === 'pct' ? bill.tipPct : bill.tipAmtC}
                parse={bill.tipMode === 'pct' ? (t) => parseFloat(t) || 0 : moneyParse}
                format={bill.tipMode === 'pct' ? (v) => (v ? String(v) : '') : moneyFormat}
                onValue={onTipValue}
              />
              <span className="seg">
                {(
                  [
                    ['amt', '$'],
                    ['pct', '%'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    type="button"
                    key={mode}
                    className={bill.tipMode === mode ? 'on' : ''}
                    aria-pressed={bill.tipMode === mode}
                    aria-label={mode === 'pct' ? 'Tip as percent' : 'Tip as dollars'}
                    onClick={() => dispatch({ type: 'tipMode', mode })}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </span>
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={bill.feesEven}
            onChange={(e) => dispatch({ type: 'feesEven', value: e.target.checked })}
          />
          Split fees evenly (instead of by what each person ordered)
        </label>
        <Totals bill={bill} />
      </div>
    </>
  );
}
