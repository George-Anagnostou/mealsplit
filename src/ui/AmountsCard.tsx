import { fmt } from '../core/money';
import { billTotals, describeFields } from '../state/selectors';
import { useAppState, useDispatch } from '../state/store';
import type { Bill, EditableField } from '../state/types';
import { DecimalInput } from './DecimalInput';
import { moneyFormat, moneyParse } from './format';

const TIP_PRESETS = [15, 18, 20, 25];

function Totals({ bill }: { bill: Bill }) {
  const t = billTotals(bill);
  return (
    <div className="totals">
      <div>
        <span>Items subtotal</span>
        <span>{fmt(t.subtotalC)}</span>
      </div>
      <div>
        <span>Tax</span>
        <span>{fmt(bill.taxC)}</span>
      </div>
      <div>
        <span>Tip{bill.tipMode === 'pct' ? ` (${bill.tipPct || 0}%)` : ''}</span>
        <span>{fmt(t.tipC)}</span>
      </div>
      <div>
        <span>Fees</span>
        <span>{fmt(bill.feesC)}</span>
      </div>
      {bill.discountC ? (
        <div>
          <span>Discount</span>
          <span>-{fmt(t.discountC)}</span>
        </div>
      ) : null}
      {t.discountNotice && <div className="bad warn-note">{t.discountNotice}</div>}
      <div className="grand">
        <span>Total</span>
        <span>{fmt(t.totalC)}</span>
      </div>
      {bill.parsedTotalC != null &&
        t.receiptDiffC != null &&
        (t.receiptDiffC === 0 ? (
          <div className="ok">
            <span>Receipt total</span>
            <span>{fmt(bill.parsedTotalC)} ✓</span>
          </div>
        ) : (
          <div className="bad">
            <span>Receipt says {fmt(bill.parsedTotalC)}</span>
            <span>off by {fmt(t.receiptDiffC)}</span>
          </div>
        ))}
    </div>
  );
}

/** Tax, tip, fees and discount: every one is a plain field you can change. */
export function AmountsCard() {
  const { bill } = useAppState();
  const dispatch = useDispatch();
  const pct = bill.tipMode === 'pct';
  const edited = (f: EditableField) => bill.edited.includes(f);
  const tag = (f: EditableField) =>
    edited(f) && (
      <span className="tag" title="You changed this, so parsing again keeps it">
        edited
      </span>
    );

  return (
    <div className="card">
      <h2>Tax, tip &amp; fees</h2>
      <p className="hint">
        Fill these in or change them any time. Anything you change is kept if you parse the receipt
        again.
      </p>
      <div className="grid">
        {(
          [
            ['Tax', 'taxC'],
            ['Fees', 'feesC'],
            ['Discount', 'discountC'],
          ] as const
        ).map(([label, field]) => (
          <div className="field" key={field}>
            <label>
              {label}
              <DecimalInput
                placeholder="0.00"
                value={bill[field]}
                parse={moneyParse}
                format={moneyFormat}
                onValue={(cents) => dispatch({ type: 'money', field, cents })}
              />
            </label>
            {tag(field)}
          </div>
        ))}
        <div className="field span">
          <label htmlFor="tip-value">Tip</label>
          <span className="tipbox">
            <DecimalInput
              id="tip-value"
              key={bill.tipMode}
              placeholder={pct ? '20' : '0.00'}
              value={pct ? bill.tipPct : bill.tipAmtC}
              parse={pct ? (t) => parseFloat(t) || 0 : moneyParse}
              format={pct ? (v) => (v ? String(v) : '') : moneyFormat}
              onValue={(v) =>
                dispatch(pct ? { type: 'tipPct', pct: v } : { type: 'tipAmt', cents: v })
              }
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
          {tag('tip')}
        </div>
      </div>
      <fieldset className="chips presets">
        <legend className="sr">Tip presets</legend>
        {TIP_PRESETS.map((p) => (
          <button
            type="button"
            key={p}
            className={`chip${pct && bill.tipPct === p ? ' on' : ''}`}
            aria-pressed={pct && bill.tipPct === p}
            aria-label={`Tip ${p} percent`}
            onClick={() => {
              if (!pct) dispatch({ type: 'tipMode', mode: 'pct' });
              dispatch({ type: 'tipPct', pct: p });
            }}
          >
            {p}%
          </button>
        ))}
      </fieldset>
      {bill.edited.length > 0 && (
        <p className="hint kept">
          You changed the {describeFields(bill.edited)}, so parsing again keeps{' '}
          {bill.edited.length > 1 ? 'them' : 'it'}.{' '}
          <button
            type="button"
            className="linklike"
            onClick={() => dispatch({ type: 'forgetEdits' })}
          >
            Let parsing replace {bill.edited.length > 1 ? 'them' : 'it'}
          </button>
        </p>
      )}
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
  );
}
