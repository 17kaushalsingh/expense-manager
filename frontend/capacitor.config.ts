import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "app.ledgersync.expenses",
  appName: "LedgerSync",
  webDir: ".next-native",
  server: {
    appStartPath: "/device",
    hostname: "localhost",
    androidScheme: "https",
  },
  ios: { contentInset: "automatic" },
  android: { allowMixedContent: false },
};
export default config;
