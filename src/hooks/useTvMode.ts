import { useEffect, useState } from 'react';
import { isTvDevice, applyTvClass } from '../utils/tvDetect';

export function useTvMode(): boolean {
  const [isTv, setIsTv] = useState<boolean>(() => {
    try { return isTvDevice(); } catch { return false; }
  });
  useEffect(() => {
    const onResize = () => {
      setIsTv(isTvDevice());
      applyTvClass();
    };
    applyTvClass();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isTv;
}
