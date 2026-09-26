import { defineConfig } from "vite";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

export default defineConfig(() => {
  const diagnostics = resolve(__dirname, "diagnostics.html");
  const input: Record<string, string> = {
    main: resolve(__dirname, "index.html")
  };

  // Dev builds include the optional diagnostics page. Keeping this conditional
  // means the same config remains safe on stable/main until diagnostics is
  // deliberately promoted there.
  if (existsSync(diagnostics)) input.diagnostics = diagnostics;

  return {
    base: "/OpenEyeTrack/",
    build: {
      rollupOptions: { input }
    }
  };
});
