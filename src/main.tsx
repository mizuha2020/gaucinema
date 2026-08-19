import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safe guard for MediaKeySession.prototype.close in browsers/webviews to prevent unhandled 'The session is not callable' error
if (typeof window !== 'undefined') {
  if (typeof (window as any).MediaKeySession !== 'undefined' && (window as any).MediaKeySession.prototype) {
    const origClose = (window as any).MediaKeySession.prototype.close;
    if (typeof origClose === 'function') {
      (window as any).MediaKeySession.prototype.close = function (...args: any[]) {
        try {
          const promise = origClose.apply(this, args);
          if (promise && typeof promise.catch === 'function') {
            return promise.catch(() => {
              return Promise.resolve();
            });
          }
          return promise;
        } catch (e) {
          return Promise.resolve();
        }
      };
    }
  }

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = typeof reason === 'string' ? reason : reason?.message || '';
    if (msg.includes('MediaKeySession') || msg.includes('The session is not callable')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
