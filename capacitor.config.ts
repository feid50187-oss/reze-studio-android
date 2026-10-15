import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "studio.reze.android",
  appName: "Reze Studio",
  webDir: "reze-studio/out",
  android: {
    allowMixedContent: true,
    backgroundColor: "#09090b",
  },
}

export default config
