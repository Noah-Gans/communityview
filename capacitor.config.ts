import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tetoncounty.gis',
  appName: 'Teton County GIS',
  webDir: 'build',
  // Development server config - COMMENTED OUT FOR PRODUCTION
  // WARNING: Keep this commented out for App Store builds!
  // Uncomment below only for development/streaming mode:
  // For iOS Simulator, use localhost. For physical devices, use your local IP (e.g., 192.168.1.76)
  // server: {
  //   url: 'http://localhost:3000',
  //   cleartext: true
  // }
};

export default config;
