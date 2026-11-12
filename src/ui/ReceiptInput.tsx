import { useState } from 'react';
import { isLowConfidence, parseReceipt } from '../core/parser';
import { scanReceipt } from '../ocr/ocr';
import { uid } from '../state/ids';
import { keptEdits } from '../state/reducer';
import { describeFields } from '../state/selectors';
import { useAppState, useDispatch } from '../state/store';
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

interface Props {
  /** Ids of rows the parser was unsure about (cleared when the receipt is parsed again). */
  onUnsure: (ids: string[]) => void;
}

export function ReceiptInput({ onUnsure }: Props) {
  const { bill } = useAppState();
  const dispatch = useDispatch();
  const toast = useToast();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ocr, setOcr] = useState<{ message: string; progress?: number } | null>(null);

  const parse = (text: string) => {
    const parsed = parseReceipt(text);
    const ids = parsed.items.map(uid);
    // Anything typed into tax, tip, fees or discount stays; say so. Replacing existing items
    // is undoable, since that can throw away assignments.
    const kept = keptEdits(bill, parsed);
    const replaced = bill.items.length > 0;
    dispatch({ type: 'applyParsed', parsed, ids });
    onUnsure(ids.filter((_, i) => isLowConfidence(parsed.items[i])));
    setWarnings(parsed.warnings);
    const n = parsed.items.length;
    toast(
      `${n} item${n === 1 ? '' : 's'} found${kept.length ? `. Kept your ${describeFields(kept)}` : ''}`,
      replaced ? { label: 'Undo', onClick: () => dispatch({ type: 'undo' }) } : undefined,
    );
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

  return (
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
            className="sr"
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
      {warnings.length > 0 && <div className="warn">{warnings.join(' ')}</div>}
    </div>
  );
}
