/**
 * Netflix-like smooth horizontal scroll — mimic https://www.netflix.com/browse
 * Long glide, easeOutQuart, rAF without React thrash.
 */

export function smoothScrollHorizontal(
  el: HTMLElement | null,
  delta: number,
  duration = 850,
  onProgress?: () => void
): () => void {
  if (!el) return () => {};

  const start = el.scrollLeft;
  const maxScroll = el.scrollWidth - el.clientWidth;
  const target = Math.max(0, Math.min(maxScroll, start + delta));
  const distance = target - start;

  if (Math.abs(distance) < 1) return () => {};

  const startTime = performance.now();
  // Netflix uses a long ease-out — fast start then very gentle tail (easeOutQuart)
  const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
  let animationFrameId: number | null = null;

  // Hardware-acceleration hints — Netflix does this via transform compositing
  const prevWillChange = el.style.willChange;
  const prevScrollBehavior = (el.style as any).scrollBehavior;
  el.style.willChange = 'scroll-position';
  (el.style as any).scrollBehavior = 'auto';

  const step = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = easeOutQuart(progress);

    el.scrollLeft = start + distance * easeProgress;

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      animationFrameId = null;
      el.style.willChange = prevWillChange;
      (el.style as any).scrollBehavior = prevScrollBehavior;
      // Only call once at the end — onScroll already updates arrows via native scroll events
      // This avoids React setState thrash every frame which was the "khựng" cause
      onProgress?.();
    }
  };

  animationFrameId = requestAnimationFrame(step);

  return () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      el.style.willChange = prevWillChange;
      (el.style as any).scrollBehavior = prevScrollBehavior;
    }
  };
}
