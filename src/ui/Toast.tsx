import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}
/** Show a short message. With an action (like Undo) it stays a little longer. */
type ToastFn = (message: string, action?: ToastAction) => void;
const ToastCtx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<{ message: string; action?: ToastAction } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback<ToastFn>((message, action) => {
    setShown({ message, action });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), action ? 6000 : 2200);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toastwrap" role="status">
        {shown && (
          <div className="toast">
            <span>{shown.message}</span>
            {shown.action && (
              <button
                type="button"
                onClick={() => {
                  shown.action?.onClick();
                  setShown(null);
                }}
              >
                {shown.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = (): ToastFn => useContext(ToastCtx);

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older browsers / insecure contexts: fall back to a hidden textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {}
    ta.remove();
  }
}

/** Returns a function that copies text and shows a toast. */
export function useCopy(): (text: string, message?: string) => Promise<void> {
  const toast = useToast();
  return useCallback(
    async (text, message = 'Copied') => {
      await writeClipboard(text);
      toast(message);
    },
    [toast],
  );
}
