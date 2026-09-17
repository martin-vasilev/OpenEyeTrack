import "./style.css";
import { OpenEyeTrack } from "./core/OpenEyeTrack";
import { FaceFeatureTracker } from "./features/FaceFeatureTracker";
import { LandmarkOverlay } from "./features/LandmarkOverlay";
import { extractEyeHeadFeatures, type EyeHeadFeatures } from "./features/EyeHeadFeatures";
import type { EyeTrackingSample } from "./types/Sample";
import {
  CalibrationController,
  type CalibrationConfig,
  type CalibrationPointCount
} from "./calibration/CalibrationController";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<section class="shell">
  <header>
    <p class="eyebrow">v0.3 gaze prototype</p>
    <h1>OpenEyeTrack</h1>
    <p>Browser-native webcam eye tracking for behavioural research.</p>
  </header>

  <div class="viewer">
    <video id="webcam" autoplay muted playsinline></video>
    <canvas id="landmarks"></canvas>
    <div class="placeholder" id="placeholder">Camera preview</div>
  </div>

  <div class="controls">
    <button id="start">Start camera + landmarks</button>
    <button id="record" disabled>Start recording</button>
    <button id="stop" disabled>Stop camera</button>
    <button id="export" disabled>Export CSV</button>
    <button id="calibrate" disabled>Calibrate gaze</button>
    <button id="validate" disabled>Validate</button>
    <label class="toggle"><input id="show-values" type="checkbox" checked /> Show live values</label>
  </div>

  <pre id="status">Ready. Face landmark inference runs locally in the browser.</pre>
</section>

<div id="calibration-setup" class="calibration-screen" hidden>
  <div class="calibration-card">
    <p class="eyebrow">Gaze calibration</p>
    <h2>Calibration settings</h2>
    <p>The camera continues to run locally, but the preview will be hidden during calibration.</p>
    <div class="settings-grid">
      <label>Number of points
        <select id="cal-points">
          <option value="5">5 points</option>
          <option value="9" selected>9 points</option>
          <option value="13">13 points</option>
        </select>
      </label>
      <label>Settle time (ms)
        <input id="cal-settle" type="number" min="200" max="3000" step="100" value="700" />
      </label>
      <label>Sampling time (ms)
        <input id="cal-sample" type="number" min="300" max="5000" step="100" value="900" />
      </label>
      <label>Repetitions
        <input id="cal-repetitions" type="number" min="1" max="5" step="1" value="1" />
      </label>
    </div>
    <label class="toggle"><input id="cal-randomize" type="checkbox" /> Randomize target order</label>
    <p class="calibration-note">Keep your head in a comfortable position and look directly at the centre of each target until it moves.</p>
    <div class="calibration-actions">
      <button id="cancel-calibration">Cancel</button>
      <button id="start-calibration">Start calibration</button>
    </div>
  </div>
</div>

<div id="calibration-stage" class="calibration-stage" hidden>
  <div id="calibration-target" class="calibration-target" hidden><span></span></div>
</div>
<div id="gaze-dot" class="gaze-dot" hidden></div>`;

const video = document.querySelector<HTMLVideoElement>("#webcam")!;
const canvas = document.querySelector<HTMLCanvasElement>("#landmarks")!;
const status = document.querySelector<HTMLPreElement>("#status")!;
const startButton = document.querySelector<HTMLButtonElement>("#start")!;
const stopButton = document.querySelector<HTMLButtonElement>("#stop")!;
const recordButton = document.querySelector<HTMLButtonElement>("#record")!;
const exportButton = document.querySelector<HTMLButtonElement>("#export")!;
const placeholder = document.querySelector<HTMLDivElement>("#placeholder")!;
const showValues = document.querySelector<HTMLInputElement>("#show-values")!;
const calibrateButton = document.querySelector<HTMLButtonElement>("#calibrate")!;
const validateButton = document.querySelector<HTMLButtonElement>("#validate")!;
const calibrationSetup = document.querySelector<HTMLDivElement>("#calibration-setup")!;
const calibrationStage = document.querySelector<HTMLDivElement>("#calibration-stage")!;
const calibrationTarget = document.querySelector<HTMLDivElement>("#calibration-target")!;
const gazeDot = document.querySelector<HTMLDivElement>("#gaze-dot")!;
const startCalibrationButton = document.querySelector<HTMLButtonElement>("#start-calibration")!;
const cancelCalibrationButton = document.querySelector<HTMLButtonElement>("#cancel-calibration")!;
const pointsInput = document.querySelector<HTMLSelectElement>("#cal-points")!;
const settleInput = document.querySelector<HTMLInputElement>("#cal-settle")!;
const sampleInput = document.querySelector<HTMLInputElement>("#cal-sample")!;
const repetitionsInput = document.querySelector<HTMLInputElement>("#cal-repetitions")!;
const randomizeInput = document.querySelector<HTMLInputElement>("#cal-randomize")!;

const tracker = new OpenEyeTrack(video);
const faceTracker = new FaceFeatureTracker();
const overlay = new LandmarkOverlay(canvas);
const calibration = new CalibrationController(calibrationTarget, readCalibrationConfig());
let recording = false;
let lastRecording: EyeTrackingSample[] = [];
let statusTimer: number | null = null;
let detectionAnimation: number | null = null;
let detectedFaces = 0;
let latestFeatures: EyeHeadFeatures | null = null;
let calibrationActive = false;

startButton.addEventListener("click", async () => {
  try {
    status.textContent = "Loading face landmark model…";
    await faceTracker.initialize();
    status.textContent = "Requesting camera permission…";
    const settings = await tracker.start();
    placeholder.hidden = true;
    startButton.disabled = true;
    stopButton.disabled = false;
    recordButton.disabled = false;
    calibrateButton.disabled = false;
    runLandmarks();
    updateStatus(settings);
    statusTimer = window.setInterval(() => updateStatus(settings), 500);
  } catch (error) {
    status.textContent = `Startup error: ${error instanceof Error ? error.message : String(error)}`;
  }
});

recordButton.addEventListener("click", () => {
  if (!recording) {
    tracker.startRecording();
    tracker.setTrial("test");
    tracker.mark("recording_start");
    recording = true;
    recordButton.textContent = "Stop recording";
    exportButton.disabled = true;
  } else {
    tracker.mark("recording_stop");
    lastRecording = tracker.stopRecording();
    recording = false;
    recordButton.textContent = "Start recording";
    exportButton.disabled = lastRecording.length === 0;
  }
});

stopButton.addEventListener("click", () => {
  if (recording) {
    lastRecording = tracker.stopRecording();
    recording = false;
  }
  if (statusTimer !== null) window.clearInterval(statusTimer);
  if (detectionAnimation !== null) cancelAnimationFrame(detectionAnimation);
  statusTimer = null;
  detectionAnimation = null;
  faceTracker.close();
  overlay.clear();
  tracker.stop();
  placeholder.hidden = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  recordButton.disabled = true;
  calibrateButton.disabled = true;
  validateButton.disabled = true;
  gazeDot.hidden = true;
  recordButton.textContent = "Start recording";
  exportButton.disabled = lastRecording.length === 0;
  status.textContent = "Camera stopped.";
});

exportButton.addEventListener("click", () => downloadCsv(lastRecording));

calibrateButton.addEventListener("click", () => {
  calibrationSetup.hidden = false;
  gazeDot.hidden = true;
});

cancelCalibrationButton.addEventListener("click", () => {
  calibrationSetup.hidden = true;
});

startCalibrationButton.addEventListener("click", async () => {
  calibration.setConfig(readCalibrationConfig());
  calibrationSetup.hidden = true;
  calibrationStage.hidden = false;
  calibrationActive = true;
  setBusy(true);
  try {
    await calibration.calibrate(() => latestFeatures);
    validateButton.disabled = false;
    status.textContent = "Calibration complete. Live gaze prediction enabled.";
  } catch (error) {
    status.textContent = `Calibration error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    calibrationActive = false;
    calibrationStage.hidden = true;
    setBusy(false);
  }
});

validateButton.addEventListener("click", async () => {
  calibration.setConfig(readCalibrationConfig());
  calibrationStage.hidden = false;
  calibrationActive = true;
  gazeDot.hidden = true;
  setBusy(true);
  try {
    const result = await calibration.validate(() => latestFeatures);
    status.textContent = `Validation complete: mean ${result.meanPx.toFixed(0)} px | median ${result.medianPx.toFixed(0)} px | RMSE ${result.rmsePx.toFixed(0)} px | ${result.points}/${calibration.pointCount} points`;
  } catch (error) {
    status.textContent = `Validation error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    calibrationActive = false;
    calibrationStage.hidden = true;
    setBusy(false);
  }
});

function runLandmarks(): void {
  overlay.resizeTo(video);
  const result = faceTracker.detect(video, performance.now());
  if (result) {
    detectedFaces = result.faceLandmarks.length;
    const face = result.faceLandmarks[0];
    if (face) {
      const matrix = result.facialTransformationMatrixes?.[0]?.data;
      latestFeatures = extractEyeHeadFeatures(face, matrix ? Array.from(matrix) : undefined);
      tracker.setFeatures(latestFeatures);
      const gaze = latestFeatures ? calibration.model.predict(latestFeatures) : null;
      tracker.setGaze(gaze);
      if (gaze && !calibrationActive && calibrationSetup.hidden) {
        gazeDot.hidden = false;
        gazeDot.style.left = `${Math.max(0, Math.min(innerWidth, gaze.x))}px`;
        gazeDot.style.top = `${Math.max(0, Math.min(innerHeight, gaze.y))}px`;
      } else {
        gazeDot.hidden = true;
      }
      overlay.draw(face, latestFeatures, showValues.checked);
    } else {
      latestFeatures = null;
      tracker.setFeatures(null);
      tracker.setGaze(null);
      gazeDot.hidden = true;
      overlay.clear();
    }
  }
  detectionAnimation = requestAnimationFrame(runLandmarks);
}

function updateStatus(settings: MediaTrackSettings): void {
  if (calibrationActive || !calibrationSetup.hidden) return;
  const fps = tracker.getObservedFps();
  status.textContent = [
    "Camera running",
    `Resolution: ${settings.width ?? "?"} × ${settings.height ?? "?"}`,
    `Camera FPS: ${settings.frameRate ?? "unknown"}`,
    `Observed frame rate: ${fps?.toFixed(1) ?? "measuring…"} FPS`,
    `Faces detected: ${detectedFaces}`,
    `Samples recorded: ${tracker.getSampleCount()}`
  ].join("\n");
}

function readCalibrationConfig(): CalibrationConfig {
  return {
    points: Number(pointsInput.value) as CalibrationPointCount,
    settleMs: Number(settleInput.value),
    sampleMs: Number(sampleInput.value),
    repetitions: Number(repetitionsInput.value),
    randomize: randomizeInput.checked
  };
}

function downloadCsv(samples: EyeTrackingSample[]): void {
  if (samples.length === 0) return;
  const columns = Object.keys(samples[0]) as (keyof EyeTrackingSample)[];
  const rows = samples.map((sample) =>
    columns.map((column) => csvCell(sample[column])).join(",")
  );
  const csv = [columns.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `openeyetrack-${new Date().toISOString().replaceAll(":", "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[,"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function setBusy(busy: boolean): void {
  calibrateButton.disabled = busy;
  validateButton.disabled = busy || !calibration.model.calibrated;
  recordButton.disabled = busy;
}
