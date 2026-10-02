import { access, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = join(root, "dist-sdk");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(outDir, "sdk-manifest.json"), "utf8"));
const publicApiSource = await readFile(join(root, "src", "core", "PublicAPI.ts"), "utf8");
const apiMatch = publicApiSource.match(/OPEN_EYE_TRACK_API_VERSION\s*=\s*"([^"]+)"/);
if (!apiMatch) throw new Error("Could not determine the source API version.");

if (manifest.packageVersion !== pkg.version) {
  throw new Error(`SDK manifest version ${manifest.packageVersion} does not match package.json ${pkg.version}.`);
}
if (manifest.experimentApiVersion !== apiMatch[1]) {
  throw new Error(`SDK manifest API v${manifest.experimentApiVersion} does not match source API v${apiMatch[1]}.`);
}

const requiredFiles = [
  "openeyetrack.es.js",
  "openeyetrack.iife.js",
  "types/sdk/index.d.ts",
  "README.md",
  "sdk-manifest.json",
  "workers/face-landmarker.worker.js",
  "models/gazeml_elg_i60x36_n32.onnx",
  "models/mobileone_s0_gaze.onnx",
  "models/resnet34_gaze.onnx",
  "models/face_landmarker.task",
  "mediapipe/wasm/vision_wasm_module_internal.js",
  "mediapipe/wasm/vision_wasm_module_internal.wasm"
];

for (const relative of requiredFiles) {
  const path = join(outDir, relative);
  await access(path);
  const info = await stat(path);
  if (!info.isFile() || info.size < 32) throw new Error(`Invalid SDK file: ${relative}`);
}

for (const relative of [
  "models/gazeml_elg_i60x36_n32.onnx",
  "models/mobileone_s0_gaze.onnx",
  "models/resnet34_gaze.onnx",
  "models/face_landmarker.task"
]) {
  const info = await stat(join(outDir, relative));
  if (info.size < 1024) throw new Error(`Model file is unexpectedly small: ${relative}`);
}

const ortFiles = await readdir(join(outDir, "ort"));
if (!ortFiles.some(file => /^ort-wasm.*\.wasm$/.test(file))) throw new Error("No ONNX Runtime WASM file was packaged.");
if (!ortFiles.some(file => /^ort-wasm.*\.mjs$/.test(file))) throw new Error("No ONNX Runtime MJS loader was packaged.");

console.log(`Verified OpenEyeTrack SDK ${pkg.version} / Experiment API v${manifest.experimentApiVersion} distributable.`);
