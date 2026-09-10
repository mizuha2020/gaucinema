import { useEffect, useState } from 'react';
import { isTvDevice, applyTvClass } from '../utils/tvDetect';

export function useTvMode(): boolean {
  const [isTv, setIsTv] = useState<boolean>(() => {
    try { return isTvDevice(); } catch { return false; }
  });
  useEffect(() => {
    const sync = () => {
      try { setIsTv(applyTvClass()); } catch {}
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    // Khi đổi ?tv= / localStorage ở tab khác thì sync lại
    window.addEventListener('popstate', sync);
    let mql: MediaQueryList | null = null;
    let mql2: MediaQueryList | null = null;
    try {
      mql = window.matchMedia('(hover: hover)');
      mql2 = window.matchMedia('(pointer: coarse)');
      mql.addEventListener?.('change', sync);
      mql2.addEventListener?.('change', sync);
    } catch {}
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.removeEventListener('popstate', sync);
      try {
        mql?.removeEventListener?.('change', sync);
        mql2?.removeEventListener?.('change', sync);
      } catch {}
    };
  }, []);
  return isTv;
}
