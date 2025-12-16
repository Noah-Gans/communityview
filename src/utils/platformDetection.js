// Utility to detect if we're running in a Capacitor native app
export const isNativeApp = () => {
  return typeof window !== 'undefined' &&
    typeof window.Capacitor !== 'undefined' &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform();
};

