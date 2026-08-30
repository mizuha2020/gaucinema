export function isTvDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const tvUA = /smarttv|smart-tv|googletv|appletv|hbbtv|pov_tv|netcast|web0s|tizen| Roku|tv.+chrome/i.test(navigator.userAgent);
  const isLargeScreen = window.innerWidth >= 1280 && window.innerHeight >= 720;
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const isTvUA = tvUA || ua.includes('tv') && ua.includes('android');
  // Consider TV if large + (coarse or tv UA) or width >= 1920 (10-foot)
  if (window.innerWidth >= 1920) return true;
  if (isLargeScreen && (tvUA || hasCoarsePointer && window.innerWidth >= 1280)) {
    // Avoid false positive for desktop large monitor with mouse: check hover capability
    const canHover = window.matchMedia('(hover: hover)').matches;
    if (!canHover) return true;
    // For testing: allow force via ?tv=1
    if (new URLSearchParams(window.location.search).get('tv') === '1') return true;
    return isTvUA;
  }
  if (new URLSearchParams(window.location.search).get('tv') === '1') return true;
  return isTvUA;
}

export function applyTvClass() {
  if (typeof document === 'undefined') return;
  const isTv = isTvDevice();
  if (isTv) document.documentElement.classList.add('tv-mode');
  else document.documentElement.classList.remove('tv-mode');
  return isTv;
}
