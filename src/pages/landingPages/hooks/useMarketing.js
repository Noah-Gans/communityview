import { useEffect, useRef, useState } from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);

  return isMobile;
}

export function getMarketingScrollRoot(fromEl) {
  if (typeof document === 'undefined') return null;
  if (fromEl) {
    const closest = fromEl.closest('.marketing-page, .intro:not(.intro-native)');
    if (closest) return closest;
  }
  return document.querySelector('.marketing-page, .intro:not(.intro-native)');
}

export function scrollToElementId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const scrollRoot = getMarketingScrollRoot(el);
  if (!scrollRoot) return;

  const rootRect = scrollRoot.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const targetTop = scrollRoot.scrollTop + (elRect.top - rootRect.top);
  scrollRoot.scrollTo({ top: targetTop, behavior: 'smooth' });
}

export function computeScrubProgress(track, scrollRoot) {
  const viewportH = scrollRoot.clientHeight;
  const scrollable = track.offsetHeight - viewportH;
  if (scrollable <= 0) return 0;

  const trackRect = track.getBoundingClientRect();
  const rootRect = scrollRoot.getBoundingClientRect();
  const scrolled = Math.min(Math.max(rootRect.top - trackRect.top, 0), scrollable);
  return scrolled / scrollable;
}

/**
 * Scroll progress 0–1. Calls onProgress every animation frame while scrolling
 * so canvas/video can update without waiting on React renders.
 */
export function useScrollScrubProgress(trackRef, enabled = true, onProgress) {
  const [progress, setProgress] = useState(0);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    if (!enabled) return undefined;

    const track = trackRef.current;
    if (!track) return undefined;

    const scrollRoot = getMarketingScrollRoot(track);
    if (!scrollRoot) return undefined;

    let raf = 0;
    let lastCaptionProgress = -1;

    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = computeScrubProgress(track, scrollRoot);
        onProgressRef.current?.(next);

        // Batch React updates — only when progress moves enough for UI chrome
        if (Math.abs(next - lastCaptionProgress) > 0.004 || next === 0 || next === 1) {
          lastCaptionProgress = next;
          setProgress(next);
        }
      });
    };

    scrollRoot.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();

    return () => {
      cancelAnimationFrame(raf);
      scrollRoot.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled, trackRef]);

  return progress;
}
