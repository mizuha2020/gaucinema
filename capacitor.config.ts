import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qtbcinema.app',
  appName: 'Gấu Cinema HD',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['*']
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#0F0F0F',
      style: 'DARK',
    },
  },
};

export default config;
