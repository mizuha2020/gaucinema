import { useEffect } from 'react';
import { applyTvClass } from '../utils/tvDetect';
import { ensureTvFocus, handleTvKey, isTvModeActive } from '../utils/tvRemote';

/** Gắn điều hướng D-pad remote TV cho toàn app (chỉ kích hoạt ở tv-mode). */
export function useTvRemoteNav() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      try {
        if (handleTvKey(e)) e.preventDefault();
      } catch {}
    };
    // capture để chạy trước handler video (tránh seek khi đang đi menu)
    // nhưng GauPlayer tự guard theo focus nên không xung đột.
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any);
  }, []);

  // Khi bật tv-mode mà chưa có focus (mở app bằng remote) -> tự focus nút chính
  useEffect(() => {
    let t: number | null = null;
    const sync = () => {
      try {
        if (isTvModeActive()) {
          if (t) window.clearTimeout(t);
          t = window.setTimeout(() => ensureTvFocus(), 350);
        }
      } catch {}
    };
    sync();
    const onResize = () => applyTvClass();
    window.addEventListener('resize', onResize);
    // Đổi tab trong SPA -> focus lại nội dung mới
    const onNav = () => sync();
    window.addEventListener('popstate', onNav);
    window.addEventListener('gau_navigate_cinema_tab' as any, onNav as any);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('popstate', onNav);
      window.removeEventListener('gau_navigate_cinema_tab' as any, onNav as any);
      if (t) window.clearTimeout(t);
    };
  }, []);
}
