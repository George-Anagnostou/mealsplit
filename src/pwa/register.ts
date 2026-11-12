import { useSyncExternalStore } from 'react';

// Registers the service worker and tells the UI when a newer build is waiting.
// A new worker never takes over by itself: the person decides when to reload.

let waiting: ServiceWorker | null = null;
let dismissed = false;
let reloading = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

function offer(worker: ServiceWorker) {
  waiting = worker;
  dismissed = false;
  emit();
}

/** Is a new version downloaded and ready? (false after "Later", until another arrives.) */
export function updateReady(): boolean {
  return waiting !== null && !dismissed;
}

/** Switch to the waiting version: it takes over, then the page reloads once. */
export function applyUpdate(): void {
  waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export function dismissUpdate(): void {
  dismissed = true;
  emit();
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    updateReady,
    () => false,
  );
}

export function registerServiceWorker(base: string): void {
  // Service workers need https (or localhost). Over plain LAN http there is simply no offline mode.
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  const sw = navigator.serviceWorker;

  // On a first visit the worker claims the page: that is not an update, so don't reload.
  // Any later takeover is the new version (after applyUpdate): reload once to run it.
  let hadController = sw.controller !== null;
  sw.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
    } else if (!reloading) {
      reloading = true;
      location.reload();
    }
  });

  sw.register(`${base}sw.js`)
    .then((reg) => {
      const watch = (worker: ServiceWorker | null) => {
        // Asked now, at updatefound: a first install claims the page moments after it installs,
        // and by the time "installed" is reported there is a controller, which would look
        // like an update to be offered.
        const replacing = sw.controller !== null;
        worker?.addEventListener('statechange', () => {
          // "installed" while an older worker is in charge means this one is waiting.
          if (worker.state === 'installed' && replacing) offer(worker);
        });
      };
      if (reg.waiting && sw.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // An installed app can stay open for days: look for a new build when it comes back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}
