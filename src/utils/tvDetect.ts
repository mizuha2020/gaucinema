export function isTvDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Explicit override via query parameter (?tv=1 to test, ?tv=0 to disable)
  try {
    const tvParam = new URLSearchParams(window.location.search).get('tv');
    if (tvParam === '1') return true;
    if (tvParam === '0') return false;
  } catch {}

  const ua = (navigator.userAgent || '').toLowerCase();

  // 2. Specific TV platform signatures
  const tvUA = /smarttv|smart-tv|googletv|appletv|hbbtv|pov_tv|netcast|web0s|tizen|roku|bravia|viera|aft[a-z0-9]|mibox/i.test(ua)
    || (ua.includes('android') && (ua.includes('tv') || ua.includes('crkey') || ua.includes('box')));

  if (tvUA) return true;

  // 3. Tablets and smartphones have direct touchscreen interaction - they are NEVER 10-foot TV interfaces
  const hasTouch = (typeof window !== 'undefined' && 'ontouchstart' in window)
    || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  if (hasTouch) {
    return false;
  }

  // 4. Default: Desktop browsers and regular displays are not 10-foot TV mode
  return false;
}

export function applyTvClass() {
  if (typeof document === 'undefined') return;
  const isTv = isTvDevice();
  if (isTv) document.documentElement.classList.add('tv-mode');
  else document.documentElement.classList.remove('tv-mode');
  return isTv;
}
