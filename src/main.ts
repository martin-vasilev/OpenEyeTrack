import "./style.css";
import { OpenEyeTrack } from "./core/OpenEyeTrack";
import { FaceFeatureTracker } from "./features/FaceFeatureTracker";
import { LandmarkOverlay } from "./features/LandmarkOverlay";
import { extractEyeHeadFeatures, type EyeHeadFeatures } from "./features/EyeHeadFeatures";
import { AppearanceGazeTracker, type EyeFeatureModel, type AppearanceGazeFeatures } from "./features/AppearanceGazeTracker";
import { ElgEyeTracker, type ElgEyeFeatures } from "./features/ElgEyeTracker";
import type { EyeTrackingSample } from "./types/Sample";
import { CalibrationController, type SavedCalibration, type CalibrationConfig, type CalibrationPointCount, type TargetShape } from "./calibration/CalibrationController";
import type { GazeModelType } from "./calibration/GazeModels";
import { AdaptiveGazeFilter } from "./gaze/AdaptiveGazeFilter";
import { HeadMovementGuard, type HeadMovementGuardConfig } from "./qc/HeadMovementGuard";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<section class="shell">
  <nav class="steps" aria-label="Demo progress"><span class="step active" id="step-camera">1 Camera</span><span class="step" id="step-calibration">2 Calibration</span><span class="step" id="step-validation">3 Validation</span><span class="step" id="step-demo">4 Demo</span></nav>
  <header><p class="eyebrow">OpenEyeTrack browser demo · <strong>DEV v0.2.0</strong> · timing instrumentation</p><h1>Eye tracking from your webcam</h1><p>Set up your camera, calibrate your gaze, check data quality, then try the live tracker. Video stays on this device.</p></header>
  <section class="setup-card" id="camera-check"><div><h2>Camera check</h2><p>Centre your face, keep both eyes visible and use even lighting. Once tracking is stable, continue to calibration.</p></div><div class="check-list"><div><span id="check-face" class="check-dot"></span><b>Face detected</b></div><div><span id="check-eyes" class="check-dot"></span><b>Eye features available</b></div><div><span id="check-fps" class="check-dot"></span><b id="check-fps-label">Camera frame rate</b></div></div><button id="continue-calibration" class="primary" disabled>Continue to calibration</button></section>
  <div class="camera-start"><button id="start" class="primary">Start camera</button></div>
  <div class="viewer"><video id="webcam" autoplay muted playsinline></video><canvas id="landmarks"></canvas><div class="placeholder" id="placeholder">Camera preview</div></div>
  <div class="controls"><button id="calibrate" disabled>Calibrate gaze</button><button id="validate" disabled>Validate</button><button id="demo" disabled>Try live gaze demo</button><button id="record" disabled>Start recording</button><button id="export" disabled>Export CSV</button><button id="stop" disabled>Stop camera</button></div>
  <details class="research-settings"><summary>Advanced / research settings</summary><label class="toggle"><input id="show-values" type="checkbox" checked /> Show live landmark values</label><label class="toggle"><input id="show-gaze" type="checkbox" /> Show live gaze cursor (debug only)</label><h3>Recording QC</h3><div class="settings-grid"><label><span>Head movement guard</span><input id="head-guard" type="checkbox" checked /></label><label>Max position shift (% frame)<input id="head-xy" type="number" min="1" max="30" step="1" value="6" /></label><label>Max distance-proxy shift (% frame)<input id="head-z" type="number" min="1" max="30" step="1" value="12" /></label><label>Max head angle change (°)<input id="head-angle" type="number" min="2" max="45" step="1" value="12" /></label><label>Grace period (ms)<input id="head-grace" type="number" min="100" max="5000" step="100" value="700" /></label></div></details>
  <pre id="status">Ready. Face landmark inference runs locally in the browser.</pre>
</section>
<div id="head-position-screen" class="head-position-screen" hidden><div class="head-position-card"><p class="eyebrow">Before calibration</p><h2>Position your head</h2><p>Sit comfortably and align your face with the template. Keep the screen directly in front of you and use this position during calibration.</p><div class="head-position-view"><video id="head-position-video" autoplay muted playsinline></video><div id="head-position-guide" class="head-position-guide"><div class="head-position-oval"></div><div class="head-position-crosshair"></div></div></div><div id="head-position-message" class="head-position-message">Waiting for face detection…</div><div class="head-position-tips"><span>Face centred</span><span>Comfortable distance</span><span>Both eyes visible</span></div><div class="calibration-actions"><button id="head-position-back">Back</button><button id="head-position-continue" class="primary" disabled>Continue to calibration</button></div></div></div><div id="calibration-setup" class="calibration-screen" hidden><div class="calibration-card">
  <p class="eyebrow">Step 2 of 4</p><h2>Calibrate your gaze</h2>
  <p>For the best calibration, prepare your position before you start:</p>
  <ul class="calibration-instructions">
    <li>Sit comfortably with your head near the centre of the camera image.</li>
    <li>Keep your face clearly visible and both eyes open.</li>
    <li>If possible, remove glasses, especially if they create reflections or glare.</li>
    <li>Avoid sitting with a bright window, lamp or other strong light behind you.</li>
    <li>Use soft, even lighting on your face and avoid strong shadows.</li>
    <li>Keep your head as still as is comfortable during calibration.</li>
    <li>Look directly at each target with your eyes and keep looking at it until it moves.</li>