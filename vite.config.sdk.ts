import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "dist-sdk",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/sdk/index.ts"),
      name: "OpenEyeTrackSDK",
      formats: ["es", "iife"],
      fileName: format => format === "es" ? "openeyetrack.es.js" : "openeyetrack.iife.js"
    }
  }
});
