import { applyUpdate, dismissUpdate, useUpdateReady } from '../pwa/register';
import { useStorageStatus } from '../state/store';

/** Small, non-blocking notices: a new version is ready, or saving/loading went wrong. */
export function Notices() {
  const updateReady = useUpdateReady();
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
      ? 'This device’s storage is full, so changes aren’t being saved. Export your data (History) to keep a copy.'
      : 'Your browser isn’t letting mealsplit save (private mode?). Changes will be lost when you close the app. Export your data (History) to keep a copy.';

  return (
    <>
      {updateReady && (
        <div className="banner notice" role="status">
          <span>Update available. Your bill is saved.</span>
          <div className="btns">
            <button type="button" className="small" onClick={applyUpdate}>
              Reload
            </button>
            <button type="button" className="ghost small" onClick={dismissUpdate}>
              Later
            </button>
          </div>
        </div>
      )}
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
