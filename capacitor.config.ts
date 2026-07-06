import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuration Capacitor : empaquette le build web (dist/) dans une
 * application native Android/iOS. Le jeu étant 100 % client-side,
 * aucun plugin natif n'est nécessaire pour cette version.
 */
const config: CapacitorConfig = {
  appId: 'com.kevininter.fruitninjareunion',
  appName: 'Fruit Ninja Réunion',
  webDir: 'dist',
  android: {
    // Fond assorti au jeu pendant le chargement de la WebView
    backgroundColor: '#0b2a3a',
  },
};

export default config;
