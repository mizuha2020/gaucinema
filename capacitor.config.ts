import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qtbcinema.app',
  appName: 'Gấu Cinema HD',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
