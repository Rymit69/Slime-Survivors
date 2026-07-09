import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.slimesurvivors.game',
  appName: 'Slime Survivors',
  webDir: 'dist/public',          // папка с собранным Vite
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0d1b3e',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0d1b3e',
      showSpinner: false,
    },
  },
};

export default config;
