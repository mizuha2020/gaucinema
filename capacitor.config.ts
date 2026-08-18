import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.movieapp.vietnam',
  appName: 'MovieApp',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
