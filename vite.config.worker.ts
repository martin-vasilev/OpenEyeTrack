import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "dist-sdk/workers",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/features/FaceLandmarker.worker.ts"),
      formats: ["es"],
      fileName: () => "face-landmarker.worker.js"
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
