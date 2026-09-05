import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AppRouter } from './appRouter.tsx';

// Safe global unhandled rejection handler for benign browser/media warnings
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    try {
      const reason = event.reason;
      const msg = typeof reason === 'string' ? reason : reason?.message || '';
      if (
        msg.includes('MediaKeySession') ||
        msg.includes('The session is not callable') ||
        msg.includes('AbortError')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    } catch {
      // ignore
    }
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <AppRouter>
            <App />
          </AppRouter>
        </ErrorBoundary>
      </StrictMode>
    );
  } catch (e: any) {
    void 0;
    const safeMsg = (e?.message || 'Lỗi khởi tạo hệ thống')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    rootElement.innerHTML = `
      <div style="padding: 24px; color: white; background: #070b16; min-height: 100vh; font-family: sans-serif; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 8px;">Không thể tải ứng dụng</h2>
        <p style="color: #94a3b8; font-size: 14px; margin-bottom: 16px;">${safeMsg}</p>
        <button onclick="localStorage.clear(); window.location.reload();" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">Xóa bộ nhớ đệm & Tải lại</button>
      </div>
    `;
  }
}
