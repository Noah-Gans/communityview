function isMapDebugEnabled() {
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    if (typeof window === 'undefined') return false;
    if (window.localStorage?.getItem('cv_debug_map') === '1') return true;
    if (window.sessionStorage?.getItem('cv_debug_map') === '1') return true;
    return /[?&#]debugMap\b/i.test(String(window.location?.href || ''));
  } catch (_) {
    return false;
  }
}

const mapDebugEnabled = isMapDebugEnabled();

export const mapDebug = {
  trace(...args) {
    if (!mapDebugEnabled) return;
    try {
      console.log('[Map]', ...args);
    } catch (_) {
      /* ignore */
    }
  },
};
