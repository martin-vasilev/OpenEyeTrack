import { access, copyFile, cp, mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = join(root, "public");
const publicModels = join(publicDir, "models");
const publicOrt = join(publicDir, "ort");
const publicMediaPipe = join(publicDir, "mediapipe", "wasm");
const sdkModels = join(root, "dist-sdk", "models");

const models = [
  {
    file: "gazeml_elg_i60x36_n32.onnx",
    url: "https://storage.googleapis.com/ailia-models/gazeml/gazeml_elg_i60x36_n32.onnx"
  },
  {
    file: "mobileone_s0_gaze.onnx",
    url: "https://github.com/yakhyo/gaze-estimation/releases/download/weights/mobileone_s0_gaze.onnx"
  },
  {
    file: "resnet34_gaze.onnx",
    url: "https://github.com/yakhyo/gaze-estimation/releases/download/weights/resnet34_gaze.onnx"
  },
  {
    file: "face_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
  }
];

await Promise.all([
  mkdir(publicModels, { recursive: true }),
  mkdir(publicOrt, { recursive: true }),
  mkdir(publicMediaPipe, { recursive: true })
]);

async function validFile(path, minimum = 1024) {
  try {
    const info = await stat(path);
    return info.isFile() && info.size >= minimum;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1024) throw new Error(`Downloaded asset is unexpectedly small: ${url}`);
  await writeFile(destination, bytes);
  return bytes.byteLength;
}

for (const model of models) {
  const destination = join(publicModels, model.file);
  if (await validFile(destination)) continue;

  const packaged = join(sdkModels, model.file);
  if (await validFile(packaged)) {
    await copyFile(packaged, destination);
    console.log(`Reused packaged model: ${model.file}`);
    continue;
  }

  const bytes = await download(model.url, destination);
  console.log(`Downloaded ${model.file} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
}

await cp(
  join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm"),
  publicMediaPipe,
  { recursive: true, force: true }
);

const ortSource = join(root, "node_modules", "onnxruntime-web", "dist");
const { readdir } = await import("node:fs/promises");
const ortEntries = await readdir(ortSource, { withFileTypes: true });
const ortFiles = ortEntries
  .filter(entry => entry.isFile() && /^ort-wasm.*\.(?:wasm|mjs)$/.test(entry.name))
  .map(entry => entry.name);

if (!ortFiles.some(file => file.endsWith(".wasm")) || !ortFiles.some(file => file.endsWith(".mjs"))) {
  throw new Error("Could not find ONNX Runtime browser WASM/MJS assets.");
}

await Promise.all(
  ortFiles.map(file => copyFile(join(ortSource, file), join(publicOrt, file)))
);

await access(join(publicMediaPipe, "vision_wasm_module_internal.js"));
await access(join(publicMediaPipe, "vision_wasm_module_internal.wasm"));
await access(join(publicModels, "gazeml_elg_i60x36_n32.onnx"));
await access(join(publicModels, "face_landmarker.task"));

console.log("Local OpenEyeTrack browser assets are ready in public/.");
