import { cp, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = join(root, "dist-sdk");
const modelDir = join(outDir, "models");
const ortDir = join(outDir, "ort");
const mediapipeDir = join(outDir, "mediapipe", "wasm");

const modelAssets = [
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
  mkdir(modelDir, { recursive: true }),
  mkdir(ortDir, { recursive: true }),
  mkdir(mediapipeDir, { recursive: true })
]);

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1024) throw new Error(`Downloaded asset is unexpectedly small: ${url}`);
  await writeFile(destination, bytes);
  return bytes.byteLength;
}

for (const asset of modelAssets) {
  const destination = join(modelDir, asset.file);
  const bytes = await download(asset.url, destination);
  console.log(`Downloaded ${asset.file} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
}

await rm(mediapipeDir, { recursive: true, force: true });
await cp(
  join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm"),
  mediapipeDir,
  { recursive: true }
);

await rm(ortDir, { recursive: true, force: true });
await mkdir(ortDir, { recursive: true });
const ortSource = join(root, "node_modules", "onnxruntime-web", "dist");
const ortEntries = await readdir(ortSource, { withFileTypes: true });
const ortFiles = ortEntries
  .filter(entry => entry.isFile() && /^ort-wasm.*\.(?:wasm|mjs)$/.test(entry.name))
  .map(entry => entry.name);

if (!ortFiles.some(file => file.endsWith(".wasm")) || !ortFiles.some(file => file.endsWith(".mjs"))) {
  throw new Error("Could not find the ONNX Runtime browser WASM/MJS assets.");
}
await Promise.all(ortFiles.map(file => copyFile(join(ortSource, file), join(ortDir, file))));

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const publicApiSource = await readFile(join(root, "src", "core", "PublicAPI.ts"), "utf8");
const apiMatch = publicApiSource.match(/OPEN_EYE_TRACK_API_VERSION\s*=\s*"([^"]+)"/);
if (!apiMatch) throw new Error("Could not determine the experiment API version.");

const manifest = {
  name: pkg.name,
  packageVersion: pkg.version,
  experimentApiVersion: apiMatch[1],
  entrypoints: {
    esm: "openeyetrack.es.js",
    iife: "openeyetrack.iife.js",
    types: "types/sdk/index.d.ts"
  },
  assetBaseLayout: {
    models: "models/",
    onnxRuntime: "ort/",
    mediapipeWasm: "mediapipe/wasm/"
  },
  models: Object.fromEntries(modelAssets.map(asset => [asset.file, asset.url])),
  runtimeDependencies: {
    "@mediapipe/tasks-vision": pkg.dependencies["@mediapipe/tasks-vision"],
    "onnxruntime-web": pkg.dependencies["onnxruntime-web"]
  }
};

await writeFile(
  join(outDir, "sdk-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

const readme = `# OpenEyeTrack SDK ${pkg.version}

Experiment API: v${apiMatch[1]}

This directory is a self-contained browser SDK distribution. Copy the directory intact to your experiment host and point \`assetBaseUrl\` at the copied directory.

## ESM

\`\`\`js
import { OpenEyeTrackRuntime } from "./openeyetrack.es.js";

const tracker = new OpenEyeTrackRuntime({
  video: document.querySelector("video"),
  assetBaseUrl: new URL("./", import.meta.url).href
});
\`\`\`

## Browser script / IIFE

\`\`\`html
<script src="./openeyetrack.iife.js"></script>
<script>
  const tracker = new OpenEyeTrackSDK.OpenEyeTrackRuntime({
    video: document.querySelector("video"),
    assetBaseUrl: new URL("./", document.currentScript?.src || document.baseURI).href
  });
</script>
\`\`\`

The directory includes the gaze models, MediaPipe face-landmarker model, MediaPipe WASM files and ONNX Runtime WASM files used by the SDK. See \`sdk-manifest.json\` for the exact package/API versions and upstream model sources.
`;

await writeFile(join(outDir, "README.md"), readme, "utf8");

for (const file of ["openeyetrack.es.js", "openeyetrack.iife.js", "types/sdk/index.d.ts"]) {
  const info = await stat(join(outDir, file));
  if (!info.isFile() || info.size === 0) throw new Error(`Missing SDK build output: ${file}`);
}

console.log(`OpenEyeTrack SDK ${pkg.version} distributable assembled in dist-sdk/.`);
