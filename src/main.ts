import "./style.css";
import { OpenEyeTrack } from "./core/OpenEyeTrack";
import type { EyeTrackingSample } from "./types/Sample";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<section class="shell">
  <header>
    <p class="eyebrow">v0.1 prototype</p>
    <h1>OpenEyeTrack</h1>
    <p>Browser-native webcam eye tracking for behavioural research.</p>
  </header>

  <div class="viewer">
    <video id="webcam" autoplay muted playsinline></video>
    <div class="placeholder" id="placeholder">Camera preview</div>
  </div>

  <div class="controls">
    <button id="start">Start camera</button>
    <button id="record" disabled>Start recording</button>
    <button id="stop" disabled>Stop camera</button>
    <button id="export" disabled>Export CSV</button>
  </div>

  <pre id="status">Ready. Webcam images are processed locally in this prototype.</pre>
</section>`;

const video = document.querySelector<HTMLVideoElement>("#webcam")!;
const status = document.querySelector<HTMLPreElement>("#status")!;
const startButton = document.querySelector<HTMLButtonElement>("#start")!;
const stopButton = document.querySelector<HTMLButtonElement>("#stop")!;
const recordButton = document.querySelector<HTMLButtonElement>("#record")!;
const exportButton = document.querySelector<HTMLButtonElement>("#export")!;
const placeholder = document.querySelector<HTMLDivElement>("#placeholder")!;

const tracker = new OpenEyeTrack(video);
let recording = false;
let lastRecording: EyeTrackingSample[] = [];
let statusTimer: number | null = null;

startButton.addEventListener("click", async () => {
  try {
    status.textContent = "Requesting camera permission…";
    const settings = await tracker.start();
    placeholder.hidden = true;
    startButton.disabled = true;
    stopButton.disabled = false;
    recordButton.disabled = false;
    updateStatus(settings);
    statusTimer = window.setInterval(() => updateStatus(settings), 500);
  } catch (error) {
    status.textContent = `Camera error: ${error instanceof Error ? error.message : String(error)}`;
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
  statusTimer = null;
  tracker.stop();
  placeholder.hidden = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  recordButton.disabled = true;
  recordButton.textContent = "Start recording";
  exportButton.disabled = lastRecording.length === 0;
  status.textContent = "Camera stopped.";
});

exportButton.addEventListener("click", () => downloadCsv(lastRecording));

function updateStatus(settings: MediaTrackSettings): void {
  const fps = tracker.getObservedFps();
  status.textContent =
    `Camera running\nResolution: ${settings.width ?? "?"} × ${settings.height ?? "?"}\nCamera FPS: ${settings.frameRate ?? "unknown"}\nObserved frame rate: ${fps?.toFixed(1) ?? "measuring…"} FPS\nSamples recorded: ${tracker.getSampleCount()}`;
}

function downloadCsv(samples: EyeTrackingSample[]): void {
  if (samples.length === 0) return;
  const columns = Object.keys(samples[0]) as (keyof EyeTrackingSample)[];
  const rows = samples.map((sample) => columns.map((column) => csvCell(sample[column])).join(","));
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
