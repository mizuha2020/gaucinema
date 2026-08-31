/**
 * Utility for smooth, high-frame-rate animated scrolling across all browsers.
 * Replaces instant / abrupt native scrollBy with a cinematic easeOutCubic curve.
 */

export function smoothScrollHorizontal(
  el: HTMLElement | null,
  delta: number,
  duration = 450,
  onProgress?: () => void
): () => void {
  if (!el) return () => {};

  const start = el.scrollLeft;
  const maxScroll = el.scrollWidth - el.clientWidth;
  const target = Math.max(0, Math.min(maxScroll, start + delta));
  const distance = target - start;

  if (Math.abs(distance) < 1) return () => {};

  const startTime = performance.now();
  // Cinematic easeOutCubic curve
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
  let animationFrameId: number | null = null;

  const step = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = easeOutCubic(progress);

    el.scrollLeft = start + distance * easeProgress;
    onProgress?.();

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      animationFrameId = null;
      onProgress?.();
    }
  };

  animationFrameId = requestAnimationFrame(step);

  return () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
  };
}
