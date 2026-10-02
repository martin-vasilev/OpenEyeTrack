import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const kitDir = join(root, "release", `openeyetrack-portable-test-${pkg.version}`);
const htmlPath = join(kitDir, "index.html");
const html = await readFile(htmlPath, "utf8");

if (!html.includes('./openeyetrack/openeyetrack.es.js')) {
  throw new Error("Portable test does not import the packaged SDK entrypoint.");
}
if (/from\s+["'][^"']*src\//.test(html) || html.includes("../src/")) {
  throw new Error("Portable test contains a source-tree import.");
}

const required = [
  "openeyetrack/openeyetrack.es.js",
  "openeyetrack/openeyetrack.iife.js",
  "openeyetrack/sdk-manifest.json",
  "openeyetrack/workers/face-landmarker.worker.js",
  "openeyetrack/models/gazeml_elg_i60x36_n32.onnx",
  "openeyetrack/models/face_landmarker.task",
  "openeyetrack/mediapipe/wasm/vision_wasm_module_internal.wasm"
];

for (const relative of required) {
  const path = join(kitDir, relative);
  await access(path);
  const info = await stat(path);
  if (!info.isFile() || info.size < 32) throw new Error(`Portable test asset is invalid: ${relative}`);
}

const manifest = JSON.parse(await readFile(join(kitDir, "openeyetrack", "sdk-manifest.json"), "utf8"));
if (manifest.packageVersion !== pkg.version) {
  throw new Error(`Portable kit contains SDK ${manifest.packageVersion}, expected ${pkg.version}.`);
}

console.log(`Verified repository-independent OpenEyeTrack portable test kit ${pkg.version}.`);
