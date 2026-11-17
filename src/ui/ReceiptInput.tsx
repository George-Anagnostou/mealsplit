import { useRef, useState } from 'react';
import { type ParseError, parseReceipt } from '../core/parser';
import { ScanCancelled, scanReceipt } from '../ocr/ocr';
import { uid } from '../state/ids';
import { useAppState, useDispatch } from '../state/store';
import { useToast } from './Toast';

const EXAMPLE = `3x burger $10.00
1 fries 3
tip $3.22
discount -$2`;

export function ReceiptInput() {
  const { bill } = useAppState();
  const dispatch = useDispatch();
  const toast = useToast();
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [ocr, setOcr] = useState<{ message: string; progress?: number; busy?: boolean } | null>(
    null,
  );
  const scan = useRef<AbortController | null>(null);

  const parse = (text: string) => {
    const parsed = parseReceipt(text);
    setErrors(parsed.errors);
    if (parsed.errors.length) return;
    const ids = parsed.items.map(uid);
    const replaced = bill.items.length > 0;
    dispatch({ type: 'applyParsed', parsed, ids });
    const n = parsed.items.length;
    toast(
      `${n} draft item${n === 1 ? '' : 's'}${replaced ? '. Assign these rows again' : ''}`,
      replaced ? { label: 'Undo', onClick: () => dispatch({ type: 'undo' }) } : undefined,
    );
  };

  const onExample = () => {
    dispatch({ type: 'meta', field: 'raw', value: EXAMPLE });
    if (!bill.title) dispatch({ type: 'meta', field: 'title', value: 'Burgers' });
    parse(EXAMPLE);
  };

  const onPhoto = async (file: File) => {
    scan.current?.abort();
    const ctl = new AbortController();
    scan.current = ctl;
    try {
      const text = await scanReceipt(
        file,
        (p) => {
          if (!ctl.signal.aborted) setOcr({ ...p, busy: true });
        },
        ctl.signal,
      );
      dispatch({ type: 'meta', field: 'raw', value: text });
      setErrors([]);
      setOcr({ message: 'Text extracted. Check and format each line, then choose Parse text.' });
    } catch (err) {
      if (err instanceof ScanCancelled) {
        setOcr({ message: 'Scan cancelled. You can still paste the text.' });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setOcr({ message: `Scan failed. ${msg} You can still paste the text.` });
      }
    } finally {
      if (scan.current === ctl) scan.current = null;
    }
  };

  const scanning = ocr?.busy === true;

  return (
    <div className="card">
      <h2>Receipt</h2>
      <p className="hint" id="receipt-format">
        One row: <code>[quantity] name unit-price</code>. For example, <code>2x burger 10</code>.
        Use negative prices for credits: <code>discount -2</code>. Every row is assigned the same
        way, including tax and tip. Remove printed subtotal and total lines to avoid counting twice.
      </p>
      <textarea
        rows={6}
        placeholder={'2x burger $10.00\n1 fries 3\ntip $3.22'}
        aria-label="Receipt text"
        aria-describedby="receipt-format"
        aria-invalid={errors.length > 0}
        disabled={scanning}
        value={bill.raw}
        onChange={(e) => {
          setErrors([]);
          dispatch({ type: 'meta', field: 'raw', value: e.target.value });
        }}
      />
      <div className="btns">
        <button
          type="button"
          className="primary"
          disabled={scanning}
          onClick={() => parse(bill.raw)}
        >
          Parse text
        </button>
        <label className="btn" aria-disabled={scanning}>
          📷 Scan photo
          <input
            type="file"
            accept="image/*"
            className="sr"
            disabled={scanning}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onPhoto(f);
            }}
          />
        </label>
        <button type="button" className="ghost" disabled={scanning} onClick={onExample}>
          Example
        </button>
      </div>
      {ocr && (
        <div className="status" role="status" aria-live="polite">
          <div className="statusrow">
            <span>{ocr.message}</span>
            {scanning && (
              <button type="button" className="ghost" onClick={() => scan.current?.abort()}>
                Cancel
              </button>
            )}
          </div>
          {ocr.progress != null && (
            <div
              className="progress"
              role="progressbar"
              aria-label="Scanning"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ocr.progress * 100)}
            >
              <i style={{ width: `${Math.round(ocr.progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      {errors.length > 0 && (
        <div className="warn" role="alert">
          <b>Fix these lines, then parse again. The draft has not been replaced.</b>
          <ul className="parse-errors">
            {errors.map((error) => (
              <li key={error.line}>
                <b>Line {error.line}:</b> {error.message}
                {error.text && <code>{error.text}</code>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
