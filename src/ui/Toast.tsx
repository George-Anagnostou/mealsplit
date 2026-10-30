import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

type ToastFn = (message: string) => void;
const ToastCtx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback<ToastFn>((m) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 1800);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
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
