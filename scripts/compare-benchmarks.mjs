import { readFile } from "node:fs/promises";

const files = process.argv.slice(2);
if (files.length !== 2) {
  console.error('Usage: npm run compare:benchmark -- "<benchmark-a.json>" "<benchmark-b.json>"');
  process.exit(1);
}

const loaded = await Promise.all(files.map(async path => ({
  path,
  data: JSON.parse(await readFile(path, "utf8"))
})));

function surface(entry) {
  return entry.data.surface ?? entry.data.benchmarkProtocol?.surface ?? "unknown";
}

const main = loaded.find(entry => surface(entry) === "main-app");
const portable = loaded.find(entry => surface(entry) === "portable-sdk");
if (!main || !portable) {
  console.error("Expected one main-app benchmark and one portable-sdk benchmark.");
  console.error("Found:", loaded.map(entry => surface(entry)).join(", "));
  process.exit(1);
}

function calibration(data) {
  return data.calibration ?? data.setupResult?.calibration ?? null;
}
function value(data, path) {
  let current = data;
  for (const key of path) {
    if (current === null || current === undefined) return null;
    current = current[key];
  }
  return typeof current === "number" && Number.isFinite(current) ? current : null;
}
function fmt(v, digits = 2) {
  return v === null ? "—" : v.toFixed(digits);
}
function pct(v) {
  return v === null ? "—" : v.toFixed(1) + "%";
}
function delta(portableValue, mainValue, digits = 2) {
  if (portableValue === null || mainValue === null) return "—";
  const d = portableValue - mainValue;
  return (d >= 0 ? "+" : "") + d.toFixed(digits);
}

const mainLoss = value(main.data, ["validationMetrics", "dataLoss"]);
const portableLoss = value(portable.data, ["validationMetrics", "dataLoss"]);
const rows = [
  ["Validation mean error (px)", value(main.data, ["validationMetrics", "meanPx"]), value(portable.data, ["validationMetrics", "meanPx"])],
  ["Validation median error (px)", value(main.data, ["validationMetrics", "medianPx"]), value(portable.data, ["validationMetrics", "medianPx"])],
  ["Validation RMSE (px)", value(main.data, ["validationMetrics", "rmsePx"]), value(portable.data, ["validationMetrics", "rmsePx"])],
  ["Precision RMS-S2S (px)", value(main.data, ["validationMetrics", "precisionRmsS2SPx"]), value(portable.data, ["validationMetrics", "precisionRmsS2SPx"])],
  ["Validation data loss (%)", mainLoss === null ? null : mainLoss * 100, portableLoss === null ? null : portableLoss * 100],
  ["Callback FPS", value(main.data, ["frameDiagnostics", "callbackFps"]), value(portable.data, ["frameDiagnostics", "callbackFps"])],
  ["Presented FPS", value(main.data, ["frameDiagnostics", "presentedFps"]), value(portable.data, ["frameDiagnostics", "presentedFps"])],
  ["Media FPS", value(main.data, ["frameDiagnostics", "mediaFps"]), value(portable.data, ["frameDiagnostics", "mediaFps"])],
  ["Missed presented frames", value(main.data, ["frameDiagnostics", "missedFrames"]), value(portable.data, ["frameDiagnostics", "missedFrames"])],
  ["Recorded samples", value(main.data, ["recordingBenchmark", "samples"]), value(portable.data, ["recordingBenchmark", "samples"])],
  ["Effective sample Hz", value(main.data, ["recordingBenchmark", "effectiveHz"]), value(portable.data, ["recordingBenchmark", "effectiveHz"])],
  ["Median sample interval (ms)", value(main.data, ["recordingBenchmark", "medianIntervalMs"]), value(portable.data, ["recordingBenchmark", "medianIntervalMs"])],
  ["P95 sample interval (ms)", value(main.data, ["recordingBenchmark", "p95IntervalMs"]), value(portable.data, ["recordingBenchmark", "p95IntervalMs"])],
  ["Valid gaze samples (%)", value(main.data, ["recordingBenchmark", "validGazePercent"]), value(portable.data, ["recordingBenchmark", "validGazePercent"])]
];

const mainCal = calibration(main.data);
const portableCal = calibration(portable.data);
console.log("\nOpenEyeTrack main app vs portable SDK benchmark\n");
console.log(
  "Main calibration:",
  mainCal?.config
    ? mainCal.config.featureModel + " · " + mainCal.config.points + " points × " + mainCal.config.repetitions + " runs · " + mainCal.config.model?.type
    : "unknown"
);
console.log(
  "Portable calibration:",
  portableCal?.config
    ? portableCal.config.featureModel + " · " + portableCal.config.points + " points × " + portableCal.config.repetitions + " runs · " + portableCal.config.model?.type
    : "unknown"
);
console.log("");
console.log("Metric".padEnd(32) + "Main".padStart(12) + "Portable".padStart(12) + "Δ portable-main".padStart(18));
console.log("-".repeat(74));
for (const row of rows) {
  const label = row[0];
  const m = row[1];
  const p = row[2];
  const percent = String(label).includes("(%)");
  const mf = percent ? pct(m) : fmt(m);
  const pf = percent ? pct(p) : fmt(p);
  console.log(String(label).padEnd(32) + mf.padStart(12) + pf.padStart(12) + delta(p, m).padStart(18));
}

console.log("\nPositive Δ means the portable SDK value is numerically higher. Error, data-loss and missed-frame metrics are better when lower; rate and valid-sample metrics are better when higher.");
