import { useStorageStatus } from '../state/store';

/** Small, non-blocking notices about saving and loading. Dismiss any of them. */
export function Notices() {
  const { loadIssue, saveFailure, dismissLoadIssue, dismissSaveFailure } = useStorageStatus();

  const loadText =
    loadIssue &&
    (loadIssue.kind === 'future'
      ? 'Your saved data was made by a newer version of mealsplit, so I left it alone and started fresh.'
      : 'Your saved data couldn’t be read, so I started fresh.') +
      (loadIssue.backedUp
        ? ' A copy is kept on this device (History → Your data).'
        : ' I couldn’t keep a copy.');

  const saveText =
    saveFailure === 'full'
      ? 'This device’s storage is full, so changes aren’t being saved. Export your data (History tab) to keep a copy.'
      : 'Your browser isn’t letting mealsplit save (private mode?). Changes will be lost when you close the app. Export your data (History tab) to keep a copy.';

  return (
    <>
      {loadText && (
        <div className="banner warn notice" role="status">
          <span>{loadText}</span>
          <button type="button" className="ghost small" onClick={dismissLoadIssue}>
            Dismiss
          </button>
        </div>
      )}
      {saveFailure && (
        <div className="banner warn notice" role="status">
          <span>{saveText}</span>
          <button type="button" className="ghost small" onClick={dismissSaveFailure}>
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
