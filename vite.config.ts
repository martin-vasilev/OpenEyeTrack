import { defineConfig } from "vite";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

export default defineConfig(({ command }) => {
  const diagnostics = resolve(__dirname, "diagnostics.html");
  const sdkTest = resolve(__dirname, "sdk-test.html");
  const input: Record<string, string> = {
    main: resolve(__dirname, "index.html")
  };

  if (existsSync(diagnostics)) input.diagnostics = diagnostics;
  if (existsSync(sdkTest)) input.sdkTest = sdkTest;

  return {
    // Local Vite development is served from localhost root. Production builds
    // retain the GitHub Pages project path unless an explicit --base override
    // is supplied (for example the /OpenEyeTrack/dev/ preview).
    base: command === "serve" ? "/" : "/OpenEyeTrack/",
    build: {
      rollupOptions: { input }
    }
  };
});
