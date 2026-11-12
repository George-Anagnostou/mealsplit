import { useState } from 'react';
import { defaultState } from '../state/defaults';
import { freshStamp } from '../state/ids';
import { useAppState, useDispatch, useStorageStatus } from '../state/store';
import { buildExport, parseImport } from '../storage';
import { downloadText } from './download';
import { useToast } from './Toast';

/** Export, import and clear: everything you can do with your saved data. */
export function DataCard() {
  const state = useAppState();
  const dispatch = useDispatch();
  const toast = useToast();
  const { storage } = useStorageStatus();
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState(() => storage.readBackup());

  const onExport = () => {
    const f = buildExport(state);
    downloadText(f.filename, f.text, f.mimeType);
    toast('Exported');
  };

  const onImport = async (file: File) => {
    setError(null);
    const result = parseImport(await file.text());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const ok = confirm(
      `Replace everything on this device with this file?\n\nIt has ${result.summary}.\nYour current friends, bill and history will be gone. Export first if you want a copy.`,
    );
    if (!ok) return;
    dispatch({ type: 'importState', state: result.state });
    toast('Imported');
  };

  const onClear = () => {
    if (
      !confirm(
        'Delete all mealsplit data on this device?\n\nThis removes your details, friends, current bill and history. It can’t be undone. Export first if you want a copy.',
      )
    )
      return;
    storage.clear();
    setBackup(null);
    setError(null);
    dispatch({ type: 'resetAll', state: defaultState(freshStamp()) });
    toast('All data cleared');
  };

  return (
    <div className="card">
      <h2>Your data</h2>
      <p className="hint">
        Everything stays on this device. Export a copy to back it up or move it to another device.
      </p>
      <div className="btns">
        <button type="button" onClick={onExport}>
          Export
        </button>
        <label className="btn">
          Import…
          <input
            type="file"
            accept="application/json,.json"
            className="sr"
            aria-label="Import file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onImport(f);
            }}
          />
        </label>
        <button type="button" className="ghost danger" onClick={onClear}>
          Clear all data
        </button>
      </div>
      {error && (
        <div className="banner warn" role="alert">
          {error}
        </div>
      )}
      {backup && (
        <p className="hint" style={{ marginTop: 10 }}>
          A copy of data that couldn’t be used ({backup.reason}) is kept.{' '}
          <button
            type="button"
            className="linklike"
            onClick={() => downloadText('mealsplit-recovery.json', backup.raw, 'text/plain')}
          >
            Download it
          </button>
        </p>
      )}
    </div>
  );
}
