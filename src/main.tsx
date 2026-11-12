import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerServiceWorker } from './pwa/register';
import { StoreProvider } from './state/store';
import './styles.css';
import { App } from './ui/App';
import { ToastProvider } from './ui/Toast';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <StoreProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StoreProvider>
  </StrictMode>,
);

// Offline app shell (production builds only, so dev reloads aren't cached).
if (import.meta.env.PROD) registerServiceWorker(import.meta.env.BASE_URL);
