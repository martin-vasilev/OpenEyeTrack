import "./style.css";
import { OpenEyeTrack } from "./core/OpenEyeTrack";
import { FaceFeatureTracker } from "./features/FaceFeatureTracker";
import { LandmarkOverlay } from "./features/LandmarkOverlay";
import { extractEyeHeadFeatures, type EyeHeadFeatures } from "./features/EyeHeadFeatures";
import { AppearanceGazeTracker, type EyeFeatureModel, type AppearanceGazeFeatures } from "./features/AppearanceGazeTracker";
import { ElgEyeTracker, type ElgEyeFeatures } from "./features/ElgEyeTracker";
import type { EyeTrackingSample } from "./types/Sample";
import { CalibrationController, type SavedCalibration, type CalibrationConfig, type CalibrationPointCount, type CalibrationHeadPose, type CalibrationHeadPoseCount, type TargetShape } from "./calibration/CalibrationController";
import { DEFAULT_SMOOTH_PURSUIT_CONFIG } from "./calibration/SmoothPursuitCalibration";
import type { GazeModelType, HeadPoseMode } from "./calibration/GazeModels";
import { AdaptiveGazeFilter } from "./gaze/AdaptiveGazeFilter";
import { HeadMovementGuard, type HeadMovementGuardConfig } from "./qc/HeadMovementGuard";
import { SessionDataManager } from "./data/SessionDataManager";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<section class="shell">
  <nav class="steps" aria-label="Demo progress"><span class="step active" id="step-camera">1 Camera</span><span class="step" id="step-calibration">2 Calibration</span><span class="step" id="step-validation">3 Validation</span><span class="step" id="step-demo">4 Demo</span></nav>
  <header class="landing-hero"><p class="eyebrow">OpenEyeTrack browser demo</p><h1>See where you look.</h1><p>Set up your camera, calibrate your gaze, check data quality, then explore interactive eye-tracking demos. Video stays on this device.</p></header>
  <section class="camera-workbench">
    <div class="camera-preview-card">
      <div class="card-heading"><div><span class="card-kicker">Live preview</span><strong>Your camera</strong></div><span class="privacy-pill">Local processing</span></div>
      <div class="viewer viewer-compact"><video id="webcam" autoplay muted playsinline></video><canvas id="landmarks"></canvas><div class="placeholder" id="placeholder">Camera preview</div></div>
      <div class="camera-start"><button id="start" class="primary">Start camera</button></div>
    </div>
    <section class="setup-card camera-check-card" id="camera-check">
      <div><span class="card-kicker">Camera check</span><h2>Ready to calibrate?</h2><p>Centre your face, keep both eyes visible and use soft, even lighting.</p></div>
      <div class="check-list"><div><span id="check-face" class="check-dot"></span><b>Face detected</b></div><div><span id="check-eyes" class="check-dot"></span><b>Eye features available</b></div><div><span id="check-fps" class="check-dot"></span><b id="check-fps-label">Camera frame rate</b></div></div>
      <button id="continue-calibration" class="primary" disabled>Continue to calibration</button>
    </section>
  </section>
  <div class="controls main-controls"><button id="calibrate" disabled>Calibrate gaze</button><button id="validate" disabled>Validate</button><button id="demo" disabled>Try live gaze demo</button><button id="record" disabled>Start recording</button><button id="export" disabled>Export CSV</button><button id="stop" disabled>Stop camera</button></div>
  <details class="research-settings"><summary>Advanced / research settings</summary><label class="toggle"><input id="show-values" type="checkbox" checked /> Show live landmark values</label><label class="toggle"><input id="show-gaze" type="checkbox" checked /> Show live gaze cursor</label><h3>Recording QC</h3><div class="settings-grid"><label><span>Head movement guard</span><input id="head-guard" type="checkbox" checked /></label><label>Max position shift (% frame)<input id="head-xy" type="number" min="1" max="30" step="1" value="6" /></label><label>Max distance-proxy shift (% frame)<input id="head-z" type="number" min="1" max="30" step="1" value="12" /></label><label>Max head angle change (°)<input id="head-angle" type="number" min="2" max="45" step="1" value="12" /></label><label>Grace period (ms)<input id="head-grace" type="number" min="100" max="5000" step="100" value="700" /></label></div><h3>Session data</h3><div class="calibration-actions"><button id="download-calibration-data" disabled>Download calibration.csv</button><button id="download-validation-data" disabled>Download validation.csv</button><button id="download-session-metadata">Download session_metadata.json</button></div></details>
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
  </ul>
  <p class="calibration-note"><strong>During calibration:</strong> follow only the target. The calibration screen will hide all other controls.</p>
  <details class="calibration-advanced"><summary>Advanced calibration settings</summary><div class="settings-grid">
    <label>Eye feature model<select id="eye-feature-model"><option value="mediapipe">MediaPipe iris landmarks (baseline)</option><option value="elg" selected>ELG eye landmarks</option><option value="mobileone_s0">MobileGaze MobileOne S0 (full-face)</option><option value="resnet34">MobileGaze ResNet-34 (higher accuracy, slower)</option></select></label><label>Gaze algorithm<select id="gaze-model"><option value="linear">Linear ridge</option><option value="polynomial" selected>Robust polynomial ridge (recommended)</option><option value="rbf">RBF kernel regression (experimental)</option><option value="knn">k-nearest neighbours</option></select></label>
    <label>Number of points<select id="cal-points"><option value="5">5 points</option><option value="9">9 points</option><option value="13" selected>13 points</option><option value="15">15 points · symmetric 5×3</option><option value="25">25 points · symmetric 5×5</option></select></label>
    <label>Target distribution<select id="cal-target-distribution"><option value="repeated" selected>Stable / repeated grid</option><option value="coverage">Distributed screen coverage across runs (experimental)</option></select></label>
    <label>Calibration runs<input id="cal-repetitions" type="number" min="1" max="5" value="5" /></label>
    <label>Head poses<select id="cal-head-pose-count"><option value="1" selected>1 · centre only</option><option value="3">3 · centre + left/right</option><option value="5">5 · centre + left/right/up/down</option></select></label>
    <label>Settle time (ms)<input id="cal-settle" type="number" min="200" max="3000" step="100" value="700" /></label>
    <label>Sampling time (ms)<input id="cal-sample" type="number" min="300" max="5000" step="100" value="900" /></label>
    <label>Smooth-pursuit speed (px/s)<input id="cal-pursuit-speed" type="number" min="50" max="250" step="10" value="100" /></label>
    <label>Target size (px)<input id="target-size" type="number" min="8" max="100" step="2" value="34" /></label>
    <label>Target figure<select id="target-shape"><option value="bullseye" selected>Bullseye</option><option value="circle">Circle</option><option value="dot">Dot</option><option value="cross">Cross</option></select></label>
    <label>Target colour<input id="target-color" type="color" value="#172033" /></label>
    <label>Ridge / regularisation<input id="model-ridge" type="number" min="0.000001" max="10" step="0.001" value="0.05" /></label>
    <label>RBF gamma<input id="model-gamma" type="number" min="0.001" max="10" step="0.05" value="0.15" /></label>
    <label>k for kNN<input id="model-k" type="number" min="1" max="15" value="3" /></label>
    <label>Head pose in gaze model<select id="model-head-pose-mode"><option value="off" selected>Off</option><option value="position">Position only (X/Y/distance)</option><option value="position_orientation">Position + orientation</option></select></label>
  </div>
  <p class="calibration-note">Head features enter as linear correction terms only; eye×head interaction terms are not used. Position + orientation adds yaw, pitch and roll to X/Y/distance.</p>
  <label class="toggle"><input id="cal-randomize" type="checkbox" checked /> Randomize target order</label>
  <label class="toggle"><input id="cal-jitter-targets" type="checkbox" checked /> Slightly vary target locations between repetitions</label>
  <p class="calibration-note">In distributed coverage mode, calibration runs use deterministic complementary target locations across the screen; random target jitter is ignored. For a clean layout comparison with no instructed head movement, use 5 runs and 1 head pose.</p>
  <label class="toggle"><input id="cal-smooth-pursuit" type="checkbox" /> Add slow smooth-pursuit calibration after static targets</label>
  <p class="calibration-note">The add-on uses two slow horizontal sweeps (about 25–30 s at 100 px/s). Raw pursuit samples are logged, while only temporally spaced observations away from turns are added to the gaze-model fit.</p>
  <label class="toggle"><input id="cal-adaptive" type="checkbox" /> Offer targeted resampling of inaccurate validation locations</label>
  <p class="calibration-note">Off by default. When enabled, validation can offer to repeat inaccurate locations and refit the model. Leave off for the current safe calibration workflow.</p>
  </details><div class="calibration-actions"><button id="cancel-calibration">Back to main page</button><button id="start-calibration" class="primary">Start calibration</button></div>
</div></div>
<div id="pose-position-screen" class="head-position-screen" hidden><div class="head-position-card"><p class="eyebrow">Head-position calibration</p><h2 id="pose-position-title">Move your head</h2><p id="pose-position-instruction">Align your live face mesh with the reference mesh.</p><div id="pose-motion-illustration" class="pose-motion-illustration" aria-hidden="true"></div><div class="pose-mesh-key"><span><i class="mesh-dot mesh-reference"></i>Target position</span><span><i class="mesh-dot mesh-live"></i>Your live face</span></div><div class="head-position-view"><video id="pose-position-video" autoplay muted playsinline></video><canvas id="pose-position-canvas"></canvas></div><div id="pose-position-message" class="head-position-message">Move into position…</div><p class="calibration-note">Move your head while keeping the screen in the same place. When the meshes align, hold briefly and the next calibration round will start automatically.</p></div></div><div id="calibration-stage" class="calibration-stage" hidden><div id="calibration-target" class="calibration-target" hidden><span></span></div></div>
<div id="post-calibration" class="modal-screen" hidden><div class="results-card"><p class="eyebrow">Calibration complete</p><h2>Ready to validate</h2><p>Your gaze model has been calibrated. Validation checks how accurately and consistently it follows known points on the screen.</p><div class="calibration-actions"><button id="calibration-home">Back to main page</button><button id="calibration-validate" class="primary">Continue to validation</button></div></div></div>
<div id="gaze-dot" class="gaze-dot" hidden></div>
<div id="validation-results" class="modal-screen" hidden><div class="results-card"><p class="eyebrow">Step 3 of 4</p><h2>Validation complete</h2><div class="metric-grid"><div><span>Mean error</span><strong id="metric-mean">—</strong></div><div><span>Median error</span><strong id="metric-median">—</strong></div><div><span>RMS-S2S</span><strong id="metric-precision">—</strong></div><div><span>Valid samples</span><strong id="metric-valid">—</strong></div></div><p class="muted">Validation measures the current model without refitting it.</p><div class="validation-map-wrap"><div class="validation-map-heading"><div><h3>Spatial error map</h3><p>Each circle is a validation target. Larger circles indicate greater gaze error; the line shows the direction of the error.</p></div><div id="validation-map-legend">—</div></div><canvas id="validation-map" aria-label="Validation spatial error map"></canvas><p id="validation-map-summary" class="validation-map-summary"></p></div><div id="target-repeat-prompt" class="calibration-note" hidden><strong id="target-repeat-message">Some targets had relatively high error.</strong><div class="calibration-actions"><button id="repeat-bad-targets" class="primary">Repeat inaccurate targets</button><button id="skip-repeat-targets">Keep current calibration</button></div></div><div class="calibration-actions"><button id="results-recalibrate">Recalibrate all</button><button id="results-demo" class="primary">Continue to demo</button></div></div></div>
<div id="saved-calibration-banner" class="saved-calibration-banner"><div><strong id="saved-calibration-title">Browser calibration</strong><span id="saved-calibration-detail">No saved calibration yet. Complete calibration and validation to save it automatically on this browser.</span></div><div><button id="use-saved-calibration" disabled>Use saved calibration</button><button id="forget-saved-calibration" disabled>Forget</button></div></div>
<div id="demo-screen" class="demo-screen" hidden>
  <section id="demo-home" class="demo-home">
    <div class="demo-gallery-head"><div><p class="eyebrow">Step 4 of 4</p><h2>Try eye tracking for yourself</h2><p>Pick an activity. Your gaze cursor stays visible so you can see the tracker respond in real time.</p></div><button id="exit-demo" class="quiet-button">Exit demo</button></div>
    <div class="demo-task-grid">
      <button class="demo-task-card" data-demo-task="images"><span class="task-icon task-icon-image">IMG</span><strong>Explore pictures</strong><span>Look around photographs, art and scenes with lots of visual detail.</span><em>6 images</em></button>
      <button class="demo-task-card" data-demo-task="video"><span class="task-icon task-icon-video">▶</span><strong>Watch videos</strong><span>Try short dynamic real-world and space clips while your gaze is recorded.</span><em>5 clips · max 90 s each</em></button>
      <button class="demo-task-card" data-demo-task="text"><span class="task-icon task-icon-text">Aa</span><strong>Read a few pages</strong><span>See how your eyes move across longer, comfortably spaced passages.</span><em>4 pages</em></button>
      <button class="demo-task-card" data-demo-task="proanti"><span class="task-icon task-icon-saccade">↔</span><strong>Pro / anti-saccade</strong><span>Test rapid eye movements toward — or away from — sudden peripheral targets.</span><em>Interactive</em></button>
      <button class="demo-task-card" data-demo-task="stroop"><span class="task-icon task-icon-stroop">RED</span><strong>Stroop task</strong><span>Name the ink colour while ignoring the word and watch where your eyes go.</span><em>12 trials</em></button>
    </div>
    <p class="demo-gallery-note"><span></span> Gaze recording begins when you open a task. You can switch tasks without losing the session.</p>
  </section>
  <section id="demo-runner" class="demo-runner" hidden>
    <header class="demo-runner-bar"><button id="demo-task-back" class="quiet-button">← All demos</button><div><span id="demo-task-kicker">Live gaze demo</span><strong id="demo-task-title">Pictures</strong></div><button id="finish-demo">Finish & view heatmap</button></header>
    <main id="stimulus-area" class="stimulus-area demo-stage">
      <section class="stimulus-panel stimulus-carousel" data-panel="images">
        <button class="stimulus-prev" aria-label="Previous image">‹</button><figure><img id="demo-image" class="demo-real-image" alt=""><figcaption id="demo-image-caption"></figcaption></figure><button class="stimulus-next" aria-label="Next image">›</button>
      </section>
      <section class="stimulus-panel reading-stimulus stimulus-carousel" data-panel="text">
        <button class="stimulus-prev" aria-label="Previous reading page">‹</button><article id="demo-reading"></article><button class="stimulus-next" aria-label="Next reading page">›</button>
      </section>
      <section class="stimulus-panel video-stimulus stimulus-carousel" data-panel="video">
        <button class="stimulus-prev" aria-label="Previous video">‹</button><figure><video id="demo-video" controls muted playsinline preload="metadata"></video><figcaption id="demo-video-caption"></figcaption></figure><button class="stimulus-next" aria-label="Next video">›</button>
      </section>
      <section class="stimulus-panel cognitive-stimulus" data-panel="proanti">
        <div id="proanti-intro" class="task-intro-card"><span class="task-badge">Eye movement task</span><h3>Pro / anti-saccade</h3><p>Choose a mode, then complete 10 short trials. In <strong>prosaccade</strong> trials, look at the dot. In <strong>antisaccade</strong> trials, look to the mirror-opposite location.</p><div class="task-mode-buttons"><button data-saccade-mode="pro" class="active">Prosaccade</button><button data-saccade-mode="anti">Antisaccade</button></div><button id="start-saccade-task" class="primary">Start 10 trials</button></div>
        <div id="saccade-stage" class="saccade-stage" hidden><div id="saccade-progress" class="task-progress"></div><div id="saccade-fixation" class="saccade-fixation">+</div><div id="saccade-target" class="saccade-target" hidden></div></div>
      </section>
      <section class="stimulus-panel cognitive-stimulus" data-panel="stroop">
        <div id="stroop-intro" class="task-intro-card"><span class="task-badge">Attention task</span><h3>Stroop colour challenge</h3><p>Respond to the <strong>ink colour</strong>, not the word. Click the matching colour button as quickly as you comfortably can.</p><button id="start-stroop-task" class="primary">Start 12 trials</button></div>
        <div id="stroop-stage" class="stroop-stage" hidden><div id="stroop-progress" class="task-progress"></div><div id="stroop-word" class="stroop-word">BLUE</div><p>What colour is the ink?</p><div id="stroop-choices" class="stroop-choices"><button data-stroop-color="red">Red</button><button data-stroop-color="blue">Blue</button><button data-stroop-color="green">Green</button><button data-stroop-color="orange">Orange</button></div><div id="stroop-feedback" class="stroop-feedback"></div></div>
      </section>
    </main>
    <p class="recording-indicator"><span></span> Recording gaze · move naturally and keep your head in a comfortable position.</p>
  </section>
</div>
<div id="demo-results" class="demo-results" hidden><div class="results-wide">
  <div class="results-hero"><div><p class="eyebrow">Demo complete</p><h2>Explore and download your eye-tracking data</h2><p>Your session is still on this device. View the gaze heatmap, then download the raw gaze and calibration files for inspection.</p></div><span id="demo-sample-count" class="sample-pill"></span></div>
  <section class="results-section heatmap-section"><div class="results-section-heading"><div><span class="card-kicker">Gaze heatmap</span><h3>Where did you look?</h3></div></div>
    <select id="heatmap-filter" hidden><option value="all">All demo activities</option><option value="images">Pictures</option><option value="video">Videos</option><option value="text">Reading</option><option value="proanti">Pro / anti-saccade</option><option value="stroop">Stroop</option></select>
    <div class="heatmap-filter-buttons" role="group" aria-label="Choose heatmap activity"><button data-heatmap-filter="all" class="active">All</button><button data-heatmap-filter="images">Pictures</button><button data-heatmap-filter="video">Videos</button><button data-heatmap-filter="text">Reading</button><button data-heatmap-filter="proanti">Pro / anti-saccade</button><button data-heatmap-filter="stroop">Stroop</button></div>
    <canvas id="heatmap"></canvas>
  </section>
  <section class="results-section data-export-section"><div class="results-section-heading"><div><span class="card-kicker">Data exports</span><h3>Download the session</h3><p>Gaze data contain the demo recording. Calibration and validation files contain the measurements used to assess the tracker.</p></div></div>
    <div class="result-download-grid">
      <button id="demo-download" class="download-card primary-download"><span class="download-icon">↓</span><span><strong>Gaze data</strong><small>Demo gaze samples · CSV</small></span></button>
      <button id="demo-download-calibration" class="download-card"><span class="download-icon">↓</span><span><strong>Calibration data</strong><small>Raw + fitted calibration samples · CSV</small></span></button>
      <button id="demo-download-validation" class="download-card"><span class="download-icon">↓</span><span><strong>Validation data</strong><small>Accuracy and precision samples · CSV</small></span></button>
      <button id="demo-download-session" class="download-card"><span class="download-icon">↓</span><span><strong>Session metadata</strong><small>Browser, screen and run information · JSON</small></span></button>
    </div>
  </section>
  <div class="results-footer-actions"><button id="demo-back">Back to main page</button><button id="demo-again" class="primary">Try another demo</button></div>
</div></div>
<div id="head-warning" class="warning-screen" hidden><div class="warning-card"><h2>Recording paused</h2><p id="head-warning-text"></p><p>Return to your original comfortable head position, then start the recording again.</p><button id="dismiss-head-warning">Continue</button></div></div>`;

const q=<T extends Element>(s:string)=>document.querySelector<T>(s)!;
const video=q<HTMLVideoElement>("#webcam"),canvas=q<HTMLCanvasElement>("#landmarks"),status=q<HTMLPreElement>("#status"),startButton=q<HTMLButtonElement>("#start"),stopButton=q<HTMLButtonElement>("#stop"),recordButton=q<HTMLButtonElement>("#record"),exportButton=q<HTMLButtonElement>("#export"),placeholder=q<HTMLDivElement>("#placeholder"),showValues=q<HTMLInputElement>("#show-values"),showGaze=q<HTMLInputElement>("#show-gaze"),calibrateButton=q<HTMLButtonElement>("#calibrate"),validateButton=q<HTMLButtonElement>("#validate"),calibrationSetup=q<HTMLDivElement>("#calibration-setup"),calibrationStage=q<HTMLDivElement>("#calibration-stage"),posePositionScreen=q<HTMLDivElement>("#pose-position-screen"),posePositionTitle=q<HTMLElement>("#pose-position-title"),posePositionInstruction=q<HTMLElement>("#pose-position-instruction"),posePositionVideo=q<HTMLVideoElement>("#pose-position-video"),posePositionCanvas=q<HTMLCanvasElement>("#pose-position-canvas"),posePositionMessage=q<HTMLElement>("#pose-position-message"),calibrationTarget=q<HTMLDivElement>("#calibration-target"),gazeDot=q<HTMLDivElement>("#gaze-dot"),startCalibrationButton=q<HTMLButtonElement>("#start-calibration"),cancelCalibrationButton=q<HTMLButtonElement>("#cancel-calibration"),pointsInput=q<HTMLSelectElement>("#cal-points"),targetDistributionInput=q<HTMLSelectElement>("#cal-target-distribution"),settleInput=q<HTMLInputElement>("#cal-settle"),sampleInput=q<HTMLInputElement>("#cal-sample"),pursuitSpeedInput=q<HTMLInputElement>("#cal-pursuit-speed"),repetitionsInput=q<HTMLInputElement>("#cal-repetitions"),headPoseCountInput=q<HTMLSelectElement>("#cal-head-pose-count"),randomizeInput=q<HTMLInputElement>("#cal-randomize"),jitterTargetsInput=q<HTMLInputElement>("#cal-jitter-targets"),smoothPursuitInput=q<HTMLInputElement>("#cal-smooth-pursuit"),adaptiveInput=q<HTMLInputElement>("#cal-adaptive"),modelInput=q<HTMLSelectElement>("#gaze-model"),featureModelInput=q<HTMLSelectElement>("#eye-feature-model"),ridgeInput=q<HTMLInputElement>("#model-ridge"),gammaInput=q<HTMLInputElement>("#model-gamma"),kInput=q<HTMLInputElement>("#model-k"),headPoseModelInput=q<HTMLSelectElement>("#model-head-pose-mode"),targetSizeInput=q<HTMLInputElement>("#target-size"),targetShapeInput=q<HTMLSelectElement>("#target-shape"),targetColorInput=q<HTMLInputElement>("#target-color"),headGuardInput=q<HTMLInputElement>("#head-guard"),headXYInput=q<HTMLInputElement>("#head-xy"),headZInput=q<HTMLInputElement>("#head-z"),headAngleInput=q<HTMLInputElement>("#head-angle"),headGraceInput=q<HTMLInputElement>("#head-grace"),headWarning=q<HTMLDivElement>("#head-warning"),headWarningText=q<HTMLParagraphElement>("#head-warning-text"),dismissHeadWarning=q<HTMLButtonElement>("#dismiss-head-warning"),continueCalibration=q<HTMLButtonElement>("#continue-calibration"),demoButton=q<HTMLButtonElement>("#demo"),validationResults=q<HTMLDivElement>("#validation-results"),resultsRecalibrate=q<HTMLButtonElement>("#results-recalibrate"),resultsDemo=q<HTMLButtonElement>("#results-demo"),demoScreen=q<HTMLDivElement>("#demo-screen"),demoHome=q<HTMLElement>("#demo-home"),demoRunner=q<HTMLElement>("#demo-runner"),exitDemo=q<HTMLButtonElement>("#exit-demo"),finishDemoButton=q<HTMLButtonElement>("#finish-demo"),demoTaskBack=q<HTMLButtonElement>("#demo-task-back"),demoTaskTitle=q<HTMLElement>("#demo-task-title"),demoTaskKicker=q<HTMLElement>("#demo-task-kicker"),checkFace=q<HTMLSpanElement>("#check-face"),checkEyes=q<HTMLSpanElement>("#check-eyes"),checkFps=q<HTMLSpanElement>("#check-fps"),checkFpsLabel=q<HTMLElement>("#check-fps-label"),headPositionScreen=q<HTMLDivElement>("#head-position-screen"),headPositionVideo=q<HTMLVideoElement>("#head-position-video"),headPositionGuide=q<HTMLDivElement>("#head-position-guide"),headPositionMessage=q<HTMLElement>("#head-position-message"),headPositionBack=q<HTMLButtonElement>("#head-position-back"),headPositionContinue=q<HTMLButtonElement>("#head-position-continue"),validationMap=q<HTMLCanvasElement>("#validation-map"),validationMapLegend=q<HTMLElement>("#validation-map-legend"),validationMapSummary=q<HTMLElement>("#validation-map-summary"),targetRepeatPrompt=q<HTMLDivElement>("#target-repeat-prompt"),targetRepeatMessage=q<HTMLElement>("#target-repeat-message"),repeatBadTargets=q<HTMLButtonElement>("#repeat-bad-targets"),skipRepeatTargets=q<HTMLButtonElement>("#skip-repeat-targets"),metricMean=q<HTMLElement>("#metric-mean"),metricMedian=q<HTMLElement>("#metric-median"),metricPrecision=q<HTMLElement>("#metric-precision"),metricValid=q<HTMLElement>("#metric-valid"),postCalibration=q<HTMLDivElement>("#post-calibration"),calibrationHome=q<HTMLButtonElement>("#calibration-home"),calibrationValidate=q<HTMLButtonElement>("#calibration-validate"),demoResults=q<HTMLDivElement>("#demo-results"),heatmap=q<HTMLCanvasElement>("#heatmap"),heatmapFilter=q<HTMLSelectElement>("#heatmap-filter"),demoSampleCount=q<HTMLElement>("#demo-sample-count"),demoDownload=q<HTMLButtonElement>("#demo-download"),demoDownloadCalibration=q<HTMLButtonElement>("#demo-download-calibration"),demoDownloadValidation=q<HTMLButtonElement>("#demo-download-validation"),demoDownloadSession=q<HTMLButtonElement>("#demo-download-session"),demoBack=q<HTMLButtonElement>("#demo-back"),demoAgain=q<HTMLButtonElement>("#demo-again"),savedCalibrationBanner=q<HTMLDivElement>("#saved-calibration-banner"),savedCalibrationTitle=q<HTMLElement>("#saved-calibration-title"),savedCalibrationDetail=q<HTMLElement>("#saved-calibration-detail"),useSavedCalibration=q<HTMLButtonElement>("#use-saved-calibration"),forgetSavedCalibration=q<HTMLButtonElement>("#forget-saved-calibration");

const downloadCalibrationData=q<HTMLButtonElement>("#download-calibration-data"),downloadValidationData=q<HTMLButtonElement>("#download-validation-data"),downloadSessionMetadata=q<HTMLButtonElement>("#download-session-metadata");

const DEMO_IMAGES=[
{src:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Mountain%20lake.jpg",caption:"Mountain lake · U.S. Fish & Wildlife Service"},
{src:"https://commons.wikimedia.org/wiki/Special:Redirect/file/City%20street.jpg",caption:"City street · National Cancer Institute"},
{src:"https://commons.wikimedia.org/wiki/Special:Redirect/file/New%20York%20City%20street.JPG",caption:"Manhattan street scene"},
{src:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Vincent%20van%20Gogh%20Starry%20Night.jpg",caption:"The Starry Night · Vincent van Gogh"},
{src:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Earth%20apollo17.jpg",caption:"Earth from Apollo 17 · NASA"},
{src:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Cat%20domestic.jpg",caption:"Domestic cat"}
];
const DEMO_TEXTS=[
{title:"The last train home",source:"OpenEyeTrack reading demo · page 1 of 4",body:["By the time Mara reached the platform, the rain had softened from a downpour to a fine silver mist. The station roof amplified every drop, turning the quiet evening into a low, continuous hiss. Across the tracks, the windows of the closed café reflected the yellow lamps and the occasional movement of someone hurrying toward the exit.","She had expected the last train to be crowded, but only a handful of people waited. A man in a navy coat read the same page of a newspaper without turning it. Two students shared a pair of headphones and laughed at something on a phone. Farther down the platform, a woman stood beside a bright red suitcase, watching the electronic sign count down from six minutes.","Mara found a dry bench and opened the small notebook she carried everywhere. She had spent the afternoon walking through unfamiliar streets, writing down details that seemed unimportant at the time: a bicycle chained to a blue railing, the smell of bread from an underground bakery, a dog asleep under a florist's table. Reading the list now made the day feel longer and more complete.","When the train finally appeared around the bend, its headlights spread across the wet rails. Everyone stood almost at once. Mara closed the notebook, slipped it into her bag, and watched the carriages slow beside the platform. For a moment, before the doors opened, the whole station seemed perfectly still."]},
{title:"Why maps change how we notice a city",source:"OpenEyeTrack reading demo · page 2 of 4",body:["A map looks like a simple tool for getting from one place to another, but it also changes what we notice. When we follow a route on a screen, our attention is pulled toward junctions, street names and distances. We may pass a park, a small shop or an unusual building without really seeing it because those details are not needed for the immediate task.","Walking without a route creates a different visual problem. Instead of checking whether the next turn is correct, we can compare shop fronts, scan the far side of the street, or notice how one neighbourhood changes into another. The same physical environment can therefore produce very different patterns of attention depending on what we are trying to accomplish.","This difference matters for eye tracking because looking is not simply a response to whatever is most visually striking. Goals shape the sequence of fixations. A colourful sign may attract attention during an open-ended walk but be ignored when someone is searching urgently for a station entrance. The eyes reveal a continuous negotiation between what is visible and what is useful.","Digital maps can even create habits that persist after the phone is put away. People often remember landmarks close to decision points more accurately than equally noticeable landmarks elsewhere. In that sense, navigation does more than guide movement through a city: it quietly reorganises the visual information that becomes memorable."]},
{title:"A room full of small decisions",source:"OpenEyeTrack reading demo · page 3 of 4",body:["At first glance, choosing a seat in a library seems trivial. Yet the decision can involve a rapid survey of light, noise, distance, privacy and the behaviour of other people. Someone may reject a desk because it is too close to a doorway, prefer another because it faces a window, and then change their mind after noticing a flickering lamp.","Most of these judgments happen quickly. The eyes move ahead of deliberate thought, gathering evidence from different parts of the room. A glance toward an empty chair may be followed by a check of the nearest power socket, then a look at the person sitting opposite. Each fixation answers a small question, even when the observer could not easily describe the sequence afterwards.","This is one reason visual behaviour is useful to study. Two people can make the same final choice while arriving there through very different paths. One may inspect many alternatives before deciding; another may focus immediately on a single region. Measuring only the final response hides those differences, whereas eye movements preserve part of the process.","The same principle applies far beyond libraries. Shopping, reading, driving, searching a webpage and interpreting a graph all require the visual system to decide what deserves attention next. The final action is often just the last step in a much richer sequence of selections."]},
{title:"Watching the weather arrive",source:"OpenEyeTrack reading demo · page 4 of 4",body:["From the hill above the town, the change in weather was easy to see. The western horizon had turned almost purple, while the fields below were still lit by late-afternoon sun. A narrow band of rain hung beneath the clouds and moved slowly toward the river, hiding one group of houses and then another.","People on the path responded before the rain reached them. Some stopped to look at the sky. Others pulled jackets from bags or began walking more quickly toward the car park. A cyclist paused beside the gate, checked a weather app, and then turned around in the direction he had come.","The scene offered several competing places to look: the dark cloud front, the bright fields, the moving cyclist, the rooftops disappearing behind rain. Attention shifted as the relationships between those elements changed. What had been an ordinary landscape a few minutes earlier became a prediction problem: where was the rain going, and when would it arrive?","Then the wind changed. Leaves lifted from the path and the temperature dropped noticeably. The first large drops landed far apart on the dry ground. Everyone still outside seemed to reach the same conclusion at roughly the same time, and the quiet path suddenly filled with hurried movement."]}
];
const DEMO_VIDEOS=[
{src:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Street%20in%20Mumbai%20%28video%29%2001.webm",caption:"A street in Mumbai"},
{src:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Manchester%20Street%20Scene%20%281901%29.webm",caption:"Manchester Street Scene (1901)"},
{src:"https://commons.wikimedia.org/wiki/Special:Redirect/file/City%20street%20time%20lapse.webm",caption:"San Francisco street time-lapse"},
{src:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Observing%20Earth%20from%20Space.webm",caption:"Observing Earth from space · NASA"},
{src:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Apollo%2017%20EVA%20NASA.webm",caption:"Apollo 17 lunar EVA · NASA"}
];
const DEMO_VIDEO_MAX_SECONDS=90;
const STROOP_TRIALS=[
{word:"RED",color:"red",condition:"congruent"},{word:"BLUE",color:"red",condition:"incongruent"},
{word:"BLUE",color:"blue",condition:"congruent"},{word:"GREEN",color:"blue",condition:"incongruent"},
{word:"ORANGE",color:"blue",condition:"incongruent"},{word:"GREEN",color:"green",condition:"congruent"},
{word:"RED",color:"green",condition:"incongruent"},{word:"GREEN",color:"green",condition:"congruent"},
{word:"ORANGE",color:"orange",condition:"congruent"},{word:"BLUE",color:"orange",condition:"incongruent"},
{word:"RED",color:"orange",condition:"incongruent"},{word:"RED",color:"red",condition:"congruent"}
] as const;

function updateCalibrationFactorUi(){
  const coverage=targetDistributionInput.value==="coverage",runs=Math.max(1,Math.min(5,Number(repetitionsInput.value)||1));
  jitterTargetsInput.disabled=coverage;jitterTargetsInput.parentElement?.classList.toggle("disabled",coverage);
  pursuitSpeedInput.disabled=!smoothPursuitInput.checked;
  for(const option of Array.from(headPoseCountInput.options))option.disabled=Number(option.value)>runs;
  if(Number(headPoseCountInput.value)>runs)headPoseCountInput.value=runs>=3?"3":"1";
}
targetDistributionInput.onchange=updateCalibrationFactorUi;
repetitionsInput.oninput=updateCalibrationFactorUi;
smoothPursuitInput.onchange=updateCalibrationFactorUi;
updateCalibrationFactorUi();

const CALIBRATION_STORAGE_KEY="openeyetrack.calibration.v1";
const sessionData=new SessionDataManager();
const tracker=new OpenEyeTrack(video),faceTracker=new FaceFeatureTracker(),appearanceTracker=new AppearanceGazeTracker(),elgTracker=new ElgEyeTracker(),overlay=new LandmarkOverlay(canvas),calibration=new CalibrationController(calibrationTarget,readCalibrationConfig(),sessionData),gazeFilter=new AdaptiveGazeFilter(),headGuard=new HeadMovementGuard(readHeadGuardConfig());
let baselineFace:import("@mediapipe/tasks-vision").NormalizedLandmark[]|null=null,poseReadySince:number|null=null;
let poorValidationTargets:import("./calibration/CalibrationController").ValidationPointResult[]=[],recording=false,lastRecording:EyeTrackingSample[]=[],statusTimer:number|null=null,detectionAnimation:number|null=null,lastProcessedVideoTime=-1,detectedFaces=0,latestFeatures:EyeHeadFeatures|null=null,latestFace:import("@mediapipe/tasks-vision").NormalizedLandmark[]|null=null,latestAppearance:AppearanceGazeFeatures|null=null,latestElg:ElgEyeFeatures|null=null,calibrationActive=false,headPositionReadySince:number|null=null,headPositionLatched=false;

startButton.onclick=async()=>{try{status.textContent="Loading face landmark model…";await faceTracker.initialize();status.textContent="Requesting camera permission…";const settings=await tracker.start();placeholder.hidden=true;startButton.disabled=true;stopButton.disabled=false;recordButton.disabled=!calibration.model.calibrated;calibrateButton.disabled=false;runLandmarks();updateStatus(settings);statusTimer=window.setInterval(()=>updateStatus(settings),500);}catch(e){status.textContent=`Startup error: ${e instanceof Error?e.message:String(e)}`;}};
recordButton.onclick=()=>{if(!calibration.model.calibrated)return;if(recording)void finishRecording("recording_stop");else beginRecording();};
stopButton.onclick=()=>{closeHeadPosition();if(recording)void finishRecording("recording_stop");if(statusTimer!==null)clearInterval(statusTimer);if(detectionAnimation!==null)cancelAnimationFrame(detectionAnimation);faceTracker.close();overlay.clear();tracker.stop();gazeFilter.reset();headGuard.reset();placeholder.hidden=false;startButton.disabled=false;stopButton.disabled=true;recordButton.disabled=true;calibrateButton.disabled=true;validateButton.disabled=true;gazeDot.hidden=true;exportButton.disabled=!lastRecording.length;status.textContent="Camera stopped.";};
exportButton.onclick=()=>downloadCsv(lastRecording);
downloadCalibrationData.onclick=()=>sessionData.downloadCalibration();
downloadValidationData.onclick=()=>sessionData.downloadValidation();
downloadSessionMetadata.onclick=()=>sessionData.downloadMetadata();
calibrateButton.onclick=()=>openCalibration();
continueCalibration.onclick=()=>runCalibrationNavigation("camera → head positioning",()=>openHeadPosition());
headPositionBack.onclick=()=>runCalibrationNavigation("head positioning → camera",()=>closeHeadPosition());
headPositionContinue.onclick=()=>runCalibrationNavigation("head positioning → calibration setup",()=>{closeHeadPosition();openCalibration();});
demoButton.onclick=()=>openDemo();
resultsDemo.onclick=()=>{validationResults.hidden=true;openDemo();};
resultsRecalibrate.onclick=()=>{validationResults.hidden=true;openCalibration();};
skipRepeatTargets.onclick=()=>{targetRepeatPrompt.hidden=true;};
repeatBadTargets.onclick=async()=>{if(!poorValidationTargets.length)return;validationResults.hidden=true;calibrationStage.hidden=false;calibrationActive=true;gazeDot.hidden=true;setBusy(true);let revalidate=false;status.textContent=`Repeating ${poorValidationTargets.length} inaccurate validation target${poorValidationTargets.length===1?"":"s"}…`;try{const repeated=poorValidationTargets.length,summary=await calibration.recalibrateTargets(()=>latestFeatures,poorValidationTargets);tracker.setCalibrationSummary(summary);tracker.setCalibrationRun(sessionData.currentCalibrationRun);downloadCalibrationData.disabled=!sessionData.hasCalibrationData;status.textContent=`Targeted recalibration complete: ${repeated} targets repeated. Re-validating the updated model…`;poorValidationTargets=[];revalidate=true;}catch(e){validationResults.hidden=false;status.textContent=`Targeted recalibration error: ${e instanceof Error?e.message:String(e)}`;}finally{calibrationActive=false;calibrationStage.hidden=true;gazeFilter.reset();setBusy(false);}if(revalidate)await runValidation();};
exitDemo.onclick=()=>{void finishDemo(true);};
finishDemoButton.onclick=()=>{void finishDemo();};
demoTaskBack.onclick=()=>returnToDemoGallery();
demoDownload.onclick=()=>downloadCsv(lastRecording);
demoDownloadCalibration.onclick=()=>sessionData.downloadCalibration();
demoDownloadValidation.onclick=()=>sessionData.downloadValidation();
demoDownloadSession.onclick=()=>sessionData.downloadMetadata();
demoBack.onclick=()=>{demoResults.hidden=true;setStep("camera");};
demoAgain.onclick=()=>{demoResults.hidden=true;openDemo();};
heatmapFilter.onchange=()=>setHeatmapFilter(heatmapFilter.value);
document.querySelectorAll<HTMLButtonElement>("[data-heatmap-filter]").forEach(button=>button.onclick=()=>setHeatmapFilter(button.dataset.heatmapFilter??"all"));
document.querySelectorAll<HTMLButtonElement>("[data-demo-task]").forEach(button=>button.onclick=()=>launchDemoTask(button.dataset.demoTask!));
cancelCalibrationButton.onclick=()=>{calibrationSetup.hidden=true;setStep("camera");};
calibrationHome.onclick=()=>{postCalibration.hidden=true;setStep("camera");};
calibrationValidate.onclick=()=>{postCalibration.hidden=true;void runValidation();};
dismissHeadWarning.onclick=()=>{headWarning.hidden=true;};

startCalibrationButton.onclick=async()=>{
  console.info("[OpenEyeTrack ELG] Start calibration clicked");
  let config:CalibrationConfig;
  try{config=readCalibrationConfig();console.info("[OpenEyeTrack ELG] Calibration config",config);}
  catch(e){console.error("[OpenEyeTrack ELG] Failed to read calibration config",e);status.textContent=`Calibration setup error: ${e instanceof Error?e.message:String(e)}`;return;}
  setBusy(true);startCalibrationButton.disabled=true;status.textContent=`Loading eye feature model: ${config.featureModel}…`;
  try{
    latestAppearance=null;latestElg=null;elgTracker.reset();
    if(config.featureModel==="elg"){
      console.info("[OpenEyeTrack ELG] Initializing ONNX session");status.textContent="Loading ELG eye-landmark model…";
      await elgTracker.initialize();
      console.info("[OpenEyeTrack ELG] ONNX session ready");status.textContent="ELG model loaded. Running first eye-landmark inference…";
      if(!latestFace)throw new Error("ELG model loaded, but no face landmarks are currently available.");
      latestElg=await elgTracker.estimate(video,latestFace,true);
      console.info("[OpenEyeTrack ELG] First inference result",latestElg);
      if(!latestElg)throw new Error("ELG loaded but did not produce initial eye landmarks.");
      status.textContent="ELG eye landmarks ready. Starting calibration targets…";
    }else{
      console.info("[OpenEyeTrack ELG] Using feature model",config.featureModel);
      await appearanceTracker.setModel(config.featureModel);
      if(config.featureModel!=="mediapipe"&&latestFace){latestAppearance=await appearanceTracker.estimate(video,latestFace,true);if(!latestAppearance)throw new Error("The selected appearance model loaded but did not produce an initial gaze estimate.");}
    }
    calibration.setConfig(config);calibrationSetup.hidden=true;calibrationStage.hidden=false;calibrationActive=true;gazeFilter.reset();
    console.info("[OpenEyeTrack ELG] Calibration targets starting");
    baselineFace=latestFace?latestFace.map(p=>({...p})):null;
    const summary=await calibration.calibrate(()=>latestFeatures,async(round,pose)=>{const total=config.repetitions;if((config.headPoseCount??1)===1){status.textContent=`Calibration run ${round+1} of ${total} · centre head position`;return;}if(round>0)await positionForCalibrationRound(pose,round,total);status.textContent=`Calibration run ${round+1} of ${total} · ${pose} head position`;},async()=>{if((config.headPoseCount??1)>1)await positionForPose("centre","Smooth pursuit: return your head to centre","Return your head to the centre position and hold still before following the moving target.");status.textContent=`Smooth pursuit calibration · follow the target continuously · ${config.smoothPursuit?.speedPxPerSec??100} px/s`;});
    console.info("[OpenEyeTrack ELG] Calibration complete",summary);
    tracker.setCalibrationSummary(summary);tracker.setCalibrationRun(sessionData.currentCalibrationRun);downloadCalibrationData.disabled=!sessionData.hasCalibrationData;validateButton.disabled=false;recordButton.disabled=false;demoButton.disabled=true;setStep("validation");postCalibration.hidden=false;status.textContent=`Calibration complete: ${summary.config.model.type} | ${summary.observations} total observations (${summary.newObservations} new + ${summary.retainedObservations} retained) | pursuit observations: ${summary.smoothPursuitObservations??0} | adaptive targets: ${summary.adaptiveUsed?"yes":"no"}.`;
  }catch(e){
    console.error("[OpenEyeTrack ELG] Calibration startup failed",e);
    calibrationSetup.hidden=false;status.textContent=`Calibration error: ${e instanceof Error?e.message:String(e)}\nTry MediaPipe iris landmarks if the selected ML model cannot be loaded in this browser.`;
  }finally{calibrationActive=false;calibrationStage.hidden=true;gazeFilter.reset();setBusy(false);startCalibrationButton.disabled=false;}
};
async function runValidation(){calibrationStage.hidden=false;calibrationActive=true;gazeDot.hidden=true;setBusy(true);gazeFilter.reset();try{const r=await calibration.validate(()=>latestFeatures);tracker.setValidationResult(r);downloadValidationData.disabled=!sessionData.hasValidationData;metricMean.textContent=`${r.meanPx.toFixed(0)} px`;metricMedian.textContent=`${r.medianPx.toFixed(0)} px`;metricPrecision.textContent=`${r.precisionRmsS2SPx.toFixed(1)} px`;metricValid.textContent=`${((1-r.dataLoss)*100).toFixed(0)}%`;renderValidationMap(r);saveCalibrationToBrowser();poorValidationTargets=adaptiveInput.checked?selectPoorValidationTargets(r):[];targetRepeatPrompt.hidden=poorValidationTargets.length===0;targetRepeatMessage.textContent=poorValidationTargets.length?`${poorValidationTargets.length} validation target${poorValidationTargets.length===1?"":"s"} had substantial error. Would you like to repeat only ${poorValidationTargets.length===1?"this target":"these targets"} and update the calibration model?`:"";validationResults.hidden=false;demoButton.disabled=false;setStep("demo");const model=calibration.calibrationSummary?.config.model.type??"model";status.textContent=`Validation (${model}): mean ${r.meanPx.toFixed(0)} px | median ${r.medianPx.toFixed(0)} px | RMSE ${r.rmsePx.toFixed(0)} px\nPrecision: RMS-S2S ${r.precisionRmsS2SPx.toFixed(1)} px | spatial SD ${r.precisionSdPx.toFixed(1)} px | data loss ${(r.dataLoss*100).toFixed(1)}%\nValidation did not refit the active gaze estimator. Targeted resampling is only offered when explicitly enabled in Advanced calibration settings.`;}catch(e){status.textContent=`Validation error: ${e instanceof Error?e.message:String(e)}`;}finally{calibrationActive=false;calibrationStage.hidden=true;gazeFilter.reset();setBusy(false);}}
validateButton.onclick=()=>{void runValidation();};

async function positionForCalibrationRound(pose:CalibrationHeadPose,round:number,totalRuns:number):Promise<void>{
  const isTilt=pose==="up"||pose==="down",returning=pose==="centre";await positionForPose(pose,`Run ${round+1} of ${totalRuns}: ${returning?"return your head to centre":`${isTilt?"tilt":"move"} your head ${pose}`}`,`${returning?"Return":"Move"} your head ${returning?"to the centre position":pose} until your live face aligns with the target mesh, then hold still.`);}
async function positionForPose(pose:CalibrationHeadPose,title:string,instruction:string):Promise<void>{
  posePositionTitle.textContent=title;posePositionInstruction.textContent=instruction;renderPoseIllustration(pose);posePositionScreen.hidden=false;calibrationStage.hidden=true;poseReadySince=null;if(video.srcObject){posePositionVideo.srcObject=video.srcObject;void posePositionVideo.play();}
  await new Promise<void>(resolve=>{const tick=()=>{drawPoseGuide(pose);const ok=posePositionReady(pose);if(ok){if(poseReadySince===null)poseReadySince=performance.now();posePositionMessage.textContent="Good position — hold…";posePositionMessage.classList.add("ready");if(performance.now()-poseReadySince>=650){posePositionScreen.hidden=true;calibrationStage.hidden=false;resolve();return;}}else{poseReadySince=null;posePositionMessage.textContent="Align your face with the ghost mesh";posePositionMessage.classList.remove("ready");}requestAnimationFrame(tick);};tick();});
  // The pose preview shares the webcam MediaStream with the primary tracking
  // video. Release the secondary consumer as soon as positioning is complete;
  // otherwise the hidden video keeps compositing the camera for the rest of
  // calibration, validation, and recording.
  try{posePositionVideo.pause();posePositionVideo.srcObject=null;}catch(e){console.warn("[OpenEyeTrack calibration] Could not release pose preview",e);}
}
function posePositionReady(pose:string){if(!baselineFace||!latestFace)return false;const centre=(pts:import("@mediapipe/tasks-vision").NormalizedLandmark[])=>{const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}};const b=centre(baselineFace),l=centre(latestFace),d=.075,target={x:b.x+(pose==="left"?-d:pose==="right"?d:0),y:b.y+(pose==="up"?-d:pose==="down"?d:0)};return Math.abs(l.x-target.x)<.025&&Math.abs(l.y-target.y)<.025&&Math.abs(l.w-b.w)<.045&&Math.abs(l.h-b.h)<.055;}
function drawPoseGuide(pose:string){const w=video.videoWidth||640,h=video.videoHeight||360;if(posePositionCanvas.width!==w)posePositionCanvas.width=w;if(posePositionCanvas.height!==h)posePositionCanvas.height=h;const ctx=posePositionCanvas.getContext("2d");if(!ctx)return;ctx.clearRect(0,0,w,h);const d=.075,dx=pose==="left"?-d:pose==="right"?d:0,dy=pose==="up"?-d:pose==="down"?d:0;const draw=(pts:import("@mediapipe/tasks-vision").NormalizedLandmark[]|null,color:string,radius:number,shiftX=0,shiftY=0)=>{if(!pts)return;ctx.fillStyle=color;ctx.strokeStyle="rgba(15,23,42,.35)";ctx.lineWidth=.65;for(const p of pts){ctx.beginPath();ctx.arc((1-(p.x+shiftX))*w,(p.y+shiftY)*h,radius,0,Math.PI*2);ctx.fill();ctx.stroke();}};draw(baselineFace,"rgba(245,158,11,.82)",2.15,dx,dy);draw(latestFace,"rgba(14,165,233,.92)",1.75);}
function renderPoseIllustration(pose:string){const host=q<HTMLElement>("#pose-motion-illustration");const horizontal=pose==="left"||pose==="right";const arrow=pose==="left"?"←":pose==="right"?"→":pose==="up"?"↑":"↓";const shifted=pose==="left"?"translate(-12 0)":pose==="right"?"translate(12 0)":pose==="up"?"rotate(-10 60 48)":"rotate(10 60 48)";const action=horizontal?`Move your whole head slightly ${pose}`:`Tilt your head slightly ${pose}`;const person=(transform="")=>`<svg class="pose-person" viewBox="0 0 120 120" role="img" aria-label="Head position illustration"><g transform="${transform}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="39" r="24"/><path d="M48 62v13M72 62v13M32 105c3-20 14-30 28-30s25 10 28 30"/><path d="M51 38h3M66 38h3M55 50c4 3 7 3 11 0"/></g></svg>`;host.innerHTML=`<div class="pose-example"><div><span class="pose-example-label">Start</span>${person()}</div><span class="pose-arrow">${arrow}</span><div><span class="pose-example-label">Target</span>${person(shifted)}</div></div><strong class="pose-caption">${action}</strong><span class="pose-subcaption">Keep looking at the screen while moving your ${horizontal?"whole head":"head"}.</span>`;}

function beginRecording(){headGuard.setConfig(readHeadGuardConfig());headGuard.start(latestFeatures);tracker.startRecording();tracker.setTrial("test");tracker.mark("recording_start");recording=true;recordButton.textContent="Stop recording";exportButton.disabled=true;}
async function finishRecording(event:string){tracker.mark(event);recording=false;recordButton.textContent="Processing eye data…";await elgTracker.drain();lastRecording=tracker.stopRecording();recordButton.textContent="Start recording";exportButton.disabled=!lastRecording.length;headGuard.reset();}
function interruptForHeadMovement(reason:string){if(!recording)return;finishRecording("head_movement_interrupt");headWarningText.textContent=`Recording stopped because ${reason}.`;headWarning.hidden=false;status.textContent=`Recording interrupted: ${reason}. ${lastRecording.length} samples retained and available for export.`;}

function runLandmarks(){
  // requestAnimationFrame follows the display (often 60+ Hz), not the webcam.
  // Never run MediaPipe/ELG twice against the same 30-Hz camera frame.
  const videoTime=video.currentTime;
  if(videoTime===lastProcessedVideoTime){detectionAnimation=requestAnimationFrame(runLandmarks);return;}
  lastProcessedVideoTime=videoTime;
  const pipelineStarted=performance.now();
  const selected=(featureModelInput?.value??"elg")as EyeFeatureModel;
  const acquisitionMode="queued" as const;
  overlay.resizeTo(video);

  const detectStarted=performance.now();
  const result=faceTracker.detect(video,detectStarted);
  const mediaPipeDetectMs=performance.now()-detectStarted;
  let elgEnqueueMs:number|null=null,featureExtractionMs:number|null=null,gazePredictionMs:number|null=null,overlayRenderMs:number|null=null;

  if(result){
    detectedFaces=result.faceLandmarks.length;
    const face=result.faceLandmarks[0];
    if(face){
      latestFace=face;
      if(selected==="elg"){
        const t=performance.now();
        void elgTracker.estimate(video,face).then(v=>{if(v)latestElg=v;});
        elgEnqueueMs=performance.now()-t;
      }else{
        void appearanceTracker.estimate(video,face).then(v=>{if(v)latestAppearance=v;});
      }
      const matrix=result.facialTransformationMatrixes?.[0]?.data;
      const featureStarted=performance.now();
      latestFeatures=extractEyeHeadFeatures(face,matrix?Array.from(matrix):undefined);
      featureExtractionMs=performance.now()-featureStarted;
      if(latestFeatures&&selected==="elg"&&latestElg){
        latestFeatures.elgLeftRelX=latestElg.leftRelX;latestFeatures.elgLeftRelY=latestElg.leftRelY;latestFeatures.elgRightRelX=latestElg.rightRelX;latestFeatures.elgRightRelY=latestElg.rightRelY;latestFeatures.elgConfidence=(latestElg.leftConfidence+latestElg.rightConfidence)/2;latestFeatures.elgLeftConfidence=latestElg.leftConfidence;latestFeatures.elgRightConfidence=latestElg.rightConfidence;latestFeatures.elgInferenceMs=latestElg.inferenceMs;latestFeatures.elgTimestampMs=latestElg.timestampMs;latestFeatures.elgAgeMs=Math.max(0,performance.now()-latestElg.acquisitionTimestampMs);latestFeatures.elgSequenceId=latestElg.sequenceId;latestFeatures.elgAcquisitionTimestampMs=latestElg.acquisitionTimestampMs;latestFeatures.elgProcessedTimestampMs=latestElg.processedTimestampMs;latestFeatures.elgLatencyMs=latestElg.latencyMs;latestFeatures.elgQueueDepth=elgTracker.queueDepth;latestFeatures.elgLeftRelXRaw=latestElg.leftRelXRaw;latestFeatures.elgLeftRelYRaw=latestElg.leftRelYRaw;latestFeatures.elgRightRelXRaw=latestElg.rightRelXRaw;latestFeatures.elgRightRelYRaw=latestElg.rightRelYRaw;latestFeatures.elgBinocularReliability=latestElg.binocularReliability;
      }else if(latestFeatures&&selected!=="mediapipe"&&latestAppearance){
        latestFeatures.appearanceGazeYaw=latestAppearance.yaw;latestFeatures.appearanceGazePitch=latestAppearance.pitch;
      }
      tracker.setFeatures(latestFeatures);
      if(recording&&latestFeatures){const violation=headGuard.check(latestFeatures);if(violation)interruptForHeadMovement(violation.reason);}
      const gazeStarted=performance.now();
      const raw=latestFeatures?calibration.model.predict(latestFeatures):null,filterResult=raw?gazeFilter.filter(raw):null,filtered=filterResult?.gaze??null;
      gazePredictionMs=performance.now()-gazeStarted;
      tracker.setGaze(raw,filtered,filterResult?.outlier??null,filterResult?.rawDeviationPx??null);
      if(showGaze.checked&&filtered&&!calibrationActive&&calibrationSetup.hidden&&headWarning.hidden){gazeDot.hidden=false;gazeDot.style.left=`${filtered.x}px`;gazeDot.style.top=`${filtered.y}px`;}else gazeDot.hidden=true;
      const overlayStarted=performance.now();
      overlay.draw(face,latestFeatures,showValues.checked);
      overlayRenderMs=performance.now()-overlayStarted;
    }else{
      latestFeatures=null;tracker.setFeatures(null);tracker.setGaze(null);gazeFilter.reset();gazeDot.hidden=true;
      const overlayStarted=performance.now();overlay.clear();overlayRenderMs=performance.now()-overlayStarted;
    }
  }
  tracker.setPipelineDiagnostics({totalMs:performance.now()-pipelineStarted,mediaPipeDetectMs,elgEnqueueMs,featureExtractionMs,gazePredictionMs,overlayRenderMs,elgAcquisitionMode:acquisitionMode});
  detectionAnimation=requestAnimationFrame(runLandmarks);
}
function navigationLog(message:string){console.info("[OpenEyeTrack navigation]",message);status.textContent=message;}
function runCalibrationNavigation(label:string,action:()=>void){console.info("[OpenEyeTrack navigation]",label);try{action();console.info("[OpenEyeTrack navigation]",label,"complete");}catch(e){const message=e instanceof Error?e.message:String(e);console.error("[OpenEyeTrack navigation]",label,"failed",e);status.textContent=`Navigation error (${label}): ${message}`;}}
function openHeadPosition(){navigationLog("Opening head-position screen…");headPositionReadySince=null;headPositionLatched=false;headPositionScreen.hidden=false;gazeDot.hidden=true;setStep("calibration");if(video.srcObject){headPositionVideo.srcObject=video.srcObject;void headPositionVideo.play().catch(e=>console.warn("[OpenEyeTrack navigation] Head-position preview could not autoplay",e));}updateCameraChecks();console.info("[OpenEyeTrack navigation] headPositionScreen.hidden =",headPositionScreen.hidden);}
function closeHeadPosition(){headPositionReadySince=null;headPositionLatched=false;headPositionScreen.hidden=true;try{headPositionVideo.pause();headPositionVideo.srcObject=null;}catch(e){console.warn("[OpenEyeTrack navigation] Could not stop head-position preview",e);}}
function openCalibration(){navigationLog("Opening calibration setup…");headPositionScreen.hidden=true;calibrationSetup.hidden=false;gazeDot.hidden=true;setStep("calibration");console.info("[OpenEyeTrack navigation] calibrationSetup.hidden =",calibrationSetup.hidden);}
function openDemo(){
  demoScreen.hidden=false;demoResults.hidden=true;demoHome.hidden=false;demoRunner.hidden=true;setStep("demo");
  activeDemoTask=null;stopDemoTaskTimers();renderDemoItem("images");renderDemoItem("text");renderDemoItem("video");
  if(recording)void finishRecording("recording_stop");
  gazeDot.hidden=!showGaze.checked;
}
const TASK_TITLES:Record<string,string>={images:"Explore pictures",video:"Watch videos",text:"Reading",proanti:"Pro / anti-saccade",stroop:"Stroop task"};
let activeDemoTask:string|null=null,demoIndices:Record<string,number>={images:0,text:0,video:0},demoTaskToken=0,saccadeMode:"pro"|"anti"="pro",stroopTrial=0,stroopCorrect=0,stroopStartedAt=0;
const demoImage=q<HTMLImageElement>("#demo-image"),demoImageCaption=q<HTMLElement>("#demo-image-caption"),demoReading=q<HTMLElement>("#demo-reading"),demoVideo=q<HTMLVideoElement>("#demo-video"),demoVideoCaption=q<HTMLElement>("#demo-video-caption");
const proantiIntro=q<HTMLElement>("#proanti-intro"),saccadeStage=q<HTMLElement>("#saccade-stage"),saccadeProgress=q<HTMLElement>("#saccade-progress"),saccadeFixation=q<HTMLElement>("#saccade-fixation"),saccadeTarget=q<HTMLElement>("#saccade-target"),startSaccadeTask=q<HTMLButtonElement>("#start-saccade-task");
const stroopIntro=q<HTMLElement>("#stroop-intro"),stroopStage=q<HTMLElement>("#stroop-stage"),stroopProgress=q<HTMLElement>("#stroop-progress"),stroopWord=q<HTMLElement>("#stroop-word"),stroopFeedback=q<HTMLElement>("#stroop-feedback"),startStroopTask=q<HTMLButtonElement>("#start-stroop-task");

function launchDemoTask(name:string){
  if(!(name in TASK_TITLES))return;
  demoHome.hidden=true;demoRunner.hidden=false;activeDemoTask=name;demoTaskTitle.textContent=TASK_TITLES[name];demoTaskKicker.textContent="Live gaze demo";
  document.querySelectorAll<HTMLElement>("[data-panel]").forEach(p=>p.classList.toggle("active",p.dataset.panel===name));
  if(!recording){beginRecording();tracker.mark("demo_start");}
  tracker.mark(`stimulus_${name}`);
  if(name==="images"||name==="text"||name==="video")renderDemoItem(name);
  if(name==="proanti")resetSaccadeTask();
  if(name==="stroop")resetStroopTask();
  updateDemoTrial();
  gazeDot.hidden=!showGaze.checked;
}
function returnToDemoGallery(){
  stopDemoTaskTimers();demoVideo.pause();demoRunner.hidden=true;demoHome.hidden=false;activeDemoTask=null;
  if(recording){tracker.mark("demo_gallery");tracker.setTrial("demo-gallery");}
}
function updateDemoTrial(){
  if(!recording||!activeDemoTask)return;
  if(activeDemoTask==="images")tracker.setTrial(`demo-images-${demoIndices.images+1}`);
  else if(activeDemoTask==="text")tracker.setTrial(`demo-text-${demoIndices.text+1}`);
  else if(activeDemoTask==="video")tracker.setTrial(`demo-video-${demoIndices.video+1}`);
  else tracker.setTrial(`demo-${activeDemoTask}`);
}
async function finishDemo(exitWithoutResults=false){
  stopDemoTaskTimers();demoVideo.pause();
  if(recording)await finishRecording("demo_end");
  demoScreen.hidden=true;demoRunner.hidden=true;demoHome.hidden=false;activeDemoTask=null;
  if(exitWithoutResults){setStep("camera");return;}
  demoResults.hidden=false;demoSampleCount.textContent=`${lastRecording.length} gaze samples`;demoDownload.disabled=!lastRecording.length;demoDownloadCalibration.disabled=!sessionData.hasCalibrationData;demoDownloadValidation.disabled=!sessionData.hasValidationData;demoDownloadSession.disabled=false;setHeatmapFilter("all");
}
function setHeatmapFilter(filter:string){
  heatmapFilter.value=filter;
  document.querySelectorAll<HTMLButtonElement>("[data-heatmap-filter]").forEach(b=>b.classList.toggle("active",b.dataset.heatmapFilter===filter));
  renderHeatmap(filter);
}
function renderHeatmap(filter:string){
  const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(600,Math.round(innerWidth*.82)),h=Math.max(360,Math.round(w*innerHeight/innerWidth));heatmap.width=w*dpr;heatmap.height=h*dpr;heatmap.style.aspectRatio=`${w}/${h}`;const ctx=heatmap.getContext("2d");if(!ctx)return;ctx.scale(dpr,dpr);ctx.fillStyle="#f8fafc";ctx.fillRect(0,0,w,h);
  const samples=lastRecording.filter(s=>{const trial=String(s.trial??"");const matches=filter==="all"||trial.startsWith(`demo-${filter}`);return matches&&s.gazeX!==null&&s.gazeY!==null;});
  const sx=w/innerWidth,sy=h/innerHeight;for(const s of samples){const x=(s.gazeX as number)*sx,y=(s.gazeY as number)*sy,r=42;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,"rgba(239,68,68,.10)");g.addColorStop(.45,"rgba(245,158,11,.055)");g.addColorStop(1,"rgba(59,130,246,0)");ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}ctx.fillStyle="#64748b";ctx.font="14px system-ui";ctx.fillText(`${samples.length} valid gaze samples`,16,26);
}

function renderDemoItem(kind:string){
  if(kind==="images"){const x=DEMO_IMAGES[demoIndices.images%DEMO_IMAGES.length];demoImage.src=x.src;demoImage.alt=x.caption;demoImageCaption.textContent=`${demoIndices.images+1} / ${DEMO_IMAGES.length} · ${x.caption}`;}
  else if(kind==="text"){const x=DEMO_TEXTS[demoIndices.text%DEMO_TEXTS.length];demoReading.innerHTML=`<h3>${x.title}</h3><p class="stimulus-source">${x.source}</p>${x.body.map(p=>`<p>${p}</p>`).join("")}`;}
  else if(kind==="video"){
    const x=DEMO_VIDEOS[demoIndices.video%DEMO_VIDEOS.length];demoVideo.pause();demoVideo.currentTime=0;demoVideo.muted=true;demoVideo.src=x.src;
    demoVideoCaption.textContent=`${demoIndices.video+1} / ${DEMO_VIDEOS.length} · ${x.caption} · up to ${DEMO_VIDEO_MAX_SECONDS} seconds`;
    demoVideo.load();
    if(activeDemoTask==="video"){
      const play=()=>{demoVideo.removeEventListener("canplay",play);void demoVideo.play().catch(()=>{});};
      demoVideo.addEventListener("canplay",play,{once:true});
    }
  }
  updateDemoTrial();
}
demoVideo.ontimeupdate=()=>{
  if(demoVideo.currentTime>=DEMO_VIDEO_MAX_SECONDS){
    demoVideo.pause();tracker.mark(`demo_video_${demoIndices.video+1}_max_duration`);
  }
};
demoVideo.onended=()=>{if(activeDemoTask==="video")tracker.mark(`demo_video_${demoIndices.video+1}_ended`);};
document.querySelectorAll<HTMLButtonElement>(".stimulus-prev,.stimulus-next").forEach(btn=>btn.onclick=()=>{
  const panel=btn.closest<HTMLElement>(".stimulus-panel"),kind=panel?.dataset.panel??"images",items=kind==="images"?DEMO_IMAGES:kind==="text"?DEMO_TEXTS:DEMO_VIDEOS,delta=btn.classList.contains("stimulus-next")?1:-1;
  demoIndices[kind]=(demoIndices[kind]+delta+items.length)%items.length;renderDemoItem(kind);tracker.mark(`demo_${kind}_${demoIndices[kind]+1}`);
});

document.querySelectorAll<HTMLButtonElement>("[data-saccade-mode]").forEach(btn=>btn.onclick=()=>{
  saccadeMode=btn.dataset.saccadeMode==="anti"?"anti":"pro";document.querySelectorAll<HTMLButtonElement>("[data-saccade-mode]").forEach(b=>b.classList.toggle("active",b===btn));
});
startSaccadeTask.onclick=()=>{void runSaccadeTask();};
function resetSaccadeTask(){demoTaskToken++;proantiIntro.hidden=false;saccadeStage.hidden=true;saccadeTarget.hidden=true;saccadeFixation.hidden=false;saccadeProgress.textContent="";}
async function runSaccadeTask(){
  const token=++demoTaskToken;proantiIntro.hidden=true;saccadeStage.hidden=false;
  for(let trial=1;trial<=10;trial++){
    if(token!==demoTaskToken)return;
    const side=trial%2===0?"right":"left";saccadeProgress.textContent=`Trial ${trial} of 10 · ${saccadeMode==="pro"?"look at the dot":"look to the opposite side"}`;
    saccadeTarget.hidden=true;saccadeFixation.hidden=false;tracker.setTrial(`demo-proanti-${saccadeMode}-${trial}-fixation`);
    await demoWait(900+(trial%3)*120);if(token!==demoTaskToken)return;
    saccadeFixation.hidden=true;saccadeTarget.hidden=false;saccadeTarget.classList.toggle("left",side==="left");saccadeTarget.classList.toggle("right",side==="right");
    tracker.setTrial(`demo-proanti-${saccadeMode}-${trial}`);tracker.mark(`saccade_target_${side}`);
    await demoWait(750);if(token!==demoTaskToken)return;saccadeTarget.hidden=true;await demoWait(250);
  }
  saccadeStage.hidden=true;proantiIntro.hidden=false;startSaccadeTask.textContent="Run 10 trials again";tracker.mark("saccade_block_complete");tracker.setTrial("demo-proanti-complete");
}
function demoWait(ms:number){return new Promise<void>(resolve=>window.setTimeout(resolve,ms));}

startStroopTask.onclick=()=>startStroopTaskRun();
document.querySelectorAll<HTMLButtonElement>("[data-stroop-color]").forEach(btn=>btn.onclick=()=>answerStroop(btn.dataset.stroopColor??""));
function resetStroopTask(){demoTaskToken++;stroopTrial=0;stroopCorrect=0;stroopIntro.hidden=false;stroopStage.hidden=true;stroopFeedback.textContent="";startStroopTask.textContent="Start 12 trials";}
function startStroopTaskRun(){demoTaskToken++;stroopTrial=0;stroopCorrect=0;stroopIntro.hidden=true;stroopStage.hidden=false;showStroopTrial();}
function showStroopTrial(){
  if(stroopTrial>=STROOP_TRIALS.length){stroopProgress.textContent="Complete";stroopWord.textContent="Done";stroopWord.style.color="#172033";stroopFeedback.textContent=`${stroopCorrect} / ${STROOP_TRIALS.length} correct`;tracker.mark("stroop_complete");tracker.setTrial("demo-stroop-complete");return;}
  const t=STROOP_TRIALS[stroopTrial];stroopProgress.textContent=`Trial ${stroopTrial+1} of ${STROOP_TRIALS.length}`;stroopWord.textContent=t.word;stroopWord.style.color=t.color;stroopFeedback.textContent="";stroopStartedAt=performance.now();tracker.setTrial(`demo-stroop-${t.condition}-${stroopTrial+1}`);tracker.mark(`stroop_${t.condition}_${t.word.toLowerCase()}_${t.color}`);
}
function answerStroop(answer:string){
  if(stroopIntro.hidden===false||stroopTrial>=STROOP_TRIALS.length)return;
  const trial=STROOP_TRIALS[stroopTrial],target=trial.color,correct=answer===target,rt=Math.round(performance.now()-stroopStartedAt);if(correct)stroopCorrect++;
  stroopFeedback.textContent=correct?`Correct · ${rt} ms`:`Ink colour: ${target} · ${rt} ms`;tracker.mark(`stroop_response_${trial.condition}_${answer}_${correct?"correct":"incorrect"}_${rt}ms`);
  stroopTrial++;window.setTimeout(()=>{if(activeDemoTask==="stroop")showStroopTrial();},350);
}
function stopDemoTaskTimers(){demoTaskToken++;saccadeTarget.hidden=true;saccadeStage.hidden=true;}

renderDemoItem("images");renderDemoItem("text");renderDemoItem("video");

function saveCalibrationToBrowser(){try{const saved=calibration.exportSavedCalibration();if(saved){localStorage.setItem(CALIBRATION_STORAGE_KEY,JSON.stringify(saved));showSavedCalibration();}}catch(e){console.warn("Could not persist calibration",e);}}
function readSavedCalibration():SavedCalibration|null{try{const raw=localStorage.getItem(CALIBRATION_STORAGE_KEY);return raw?JSON.parse(raw) as SavedCalibration:null;}catch{return null;}}
function showSavedCalibration(){const saved=readSavedCalibration();savedCalibrationBanner.hidden=false;savedCalibrationTitle.textContent=saved?"Saved calibration available":"Browser calibration";savedCalibrationDetail.textContent=saved?`Saved ${new Date(saved.savedAt).toLocaleString()} · ${saved.config.featureModel} · ${saved.config.model.type}`:"No saved calibration yet. Complete calibration and validation to save it automatically on this browser.";useSavedCalibration.disabled=!saved;forgetSavedCalibration.disabled=!saved;}
useSavedCalibration.onclick=()=>{const saved=readSavedCalibration();if(!saved)return;try{calibration.restoreSavedCalibration(saved);const summary=calibration.calibrationSummary;if(summary)tracker.setCalibrationSummary(summary);tracker.setCalibrationRun(sessionData.currentCalibrationRun);downloadCalibrationData.disabled=!sessionData.hasCalibrationData;showSavedCalibration();validateButton.disabled=false;recordButton.disabled=false;demoButton.disabled=true;status.textContent="Saved calibration restored. Run validation to check accuracy before trying the demo.";setStep("validation");}catch(e){status.textContent=e instanceof Error?e.message:String(e);}};
forgetSavedCalibration.onclick=()=>{localStorage.removeItem(CALIBRATION_STORAGE_KEY);showSavedCalibration();};
showSavedCalibration();
function selectPoorValidationTargets(r:import("./calibration/CalibrationController").ValidationResult){const floor=Math.max(100,r.medianPx*1.35);return r.pointResults.filter(p=>p.accuracyPx>=floor).sort((a,b)=>b.accuracyPx-a.accuracyPx).slice(0,5);}
function renderValidationMap(r:import("./calibration/CalibrationController").ValidationResult){const dpr=Math.min(devicePixelRatio||1,2),w=720,h=Math.round(w*innerHeight/innerWidth);validationMap.width=w*dpr;validationMap.height=h*dpr;validationMap.style.aspectRatio=`${w}/${h}`;const ctx=validationMap.getContext("2d");if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle="#f8fafc";ctx.fillRect(0,0,w,h);ctx.strokeStyle="#cbd5e1";ctx.lineWidth=1;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(i*w/4,0);ctx.lineTo(i*w/4,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*h/4);ctx.lineTo(w,i*h/4);ctx.stroke();}const errors=r.pointResults.map(p=>p.accuracyPx),maxError=Math.max(...errors,1),sorted=[...r.pointResults].sort((a,b)=>b.accuracyPx-a.accuracyPx),sx=w/innerWidth,sy=h/innerHeight;for(const p of r.pointResults){const x=p.targetX*sx,y=p.targetY*sy,radius=7+18*Math.min(1,p.accuracyPx/maxError);ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fillStyle=p.accuracyPx>=r.meanPx?"rgba(220,38,38,.32)":"rgba(37,99,235,.25)";ctx.fill();ctx.strokeStyle=p.accuracyPx>=r.meanPx?"#dc2626":"#2563eb";ctx.lineWidth=2;ctx.stroke();ctx.fillStyle="#0f172a";ctx.font="700 12px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(`${Math.round(p.accuracyPx)}`,x,y);}validationMapLegend.textContent=`Circle label = error in px · max ${Math.round(maxError)} px`;const worst=sorted.slice(0,Math.min(3,sorted.length));validationMapSummary.textContent=worst.length?`Weakest validation regions: ${worst.map(p=>`${screenRegion(p.targetX/innerWidth,p.targetY/innerHeight)} (${Math.round(p.accuracyPx)} px)`).join(", ")}.`:"";}
function screenRegion(x:number,y:number){const v=y<.34?"top":y>.66?"bottom":"middle",h=x<.34?"left":x>.66?"right":"centre";return v==="middle"&&h==="centre"?"centre":v==="middle"?h:h==="centre"?v:`${v}-${h}`;}
function setStep(name:"camera"|"calibration"|"validation"|"demo"){for(const n of ["camera","calibration","validation","demo"])q<HTMLElement>(`#step-${n}`).classList.toggle("active",n===name);}
function updateCameraChecks(){const fps=tracker.getObservedFps();const faceOk=detectedFaces===1,eyesOk=latestFeatures!==null,fpsMeasured=fps!==null,fpsGood=(fps??0)>=25,position=facePositionStatus(latestFeatures,headPositionLatched);checkFace.classList.toggle("ok",faceOk);checkEyes.classList.toggle("ok",eyesOk);checkFps.classList.toggle("ok",fpsGood);checkFps.classList.toggle("warn",fpsMeasured&&!fpsGood);checkFpsLabel.textContent=fps?`Camera frame rate (${fps.toFixed(1)} FPS${fpsGood?"":" · low"})`:"Camera frame rate (measuring…)";continueCalibration.disabled=!(faceOk&&eyesOk);const acceptable=faceOk&&eyesOk&&position.ready;if(!headPositionScreen.hidden){if(acceptable){if(headPositionReadySince===null)headPositionReadySince=performance.now();if(performance.now()-headPositionReadySince>=500)headPositionLatched=true;}else if(!position.nearReady){headPositionReadySince=null;headPositionLatched=false;}}headPositionGuide.classList.toggle("ready",headPositionLatched||acceptable);headPositionMessage.classList.toggle("ready",headPositionLatched||acceptable);headPositionMessage.textContent=headPositionLatched?"Good position — continue when ready":position.message;headPositionContinue.disabled=!(faceOk&&eyesOk&&headPositionLatched);}
function facePositionStatus(f:EyeHeadFeatures|null,relaxed=false){if(!f)return{ready:false,nearReady:false,message:"Position your face inside the guide"};const dx=f.headX-.5,dy=f.headY-.49,size=f.headZ;const xyLimit=relaxed?.16:.14,distanceMin=relaxed?.12:.13,distanceMax=relaxed?.54:.52;const yawLimit=relaxed?18:15,pitchLimit=relaxed?18:14,rollLimit=relaxed?18:15;const centered=Math.abs(dx)<=xyLimit&&Math.abs(dy)<=xyLimit,distanceOk=size>=distanceMin&&size<=distanceMax,yawOk=f.headYaw===null||Math.abs(f.headYaw)<=yawLimit,pitchOk=f.headPitch===null||Math.abs(f.headPitch)<=pitchLimit,rollOk=f.headRoll===null||Math.abs(f.headRoll)<=rollLimit;const ready=centered&&distanceOk&&yawOk&&pitchOk&&rollOk,nearReady=Math.abs(dx)<=.19&&Math.abs(dy)<=.19&&size>=.10&&size<=.58&&(f.headYaw===null||Math.abs(f.headYaw)<=22)&&(f.headPitch===null||Math.abs(f.headPitch)<=22)&&(f.headRoll===null||Math.abs(f.headRoll)<=22);if(!centered){const horizontal=dx<-.10?"Move slightly to your right":dx>.10?"Move slightly to your left":"";const vertical=dy<-.10?"Move slightly down":dy>.10?"Move slightly up":"";return{ready,nearReady,message:[horizontal,vertical].filter(Boolean).join(" · ")||"Centre your face"};}if(!distanceOk)return{ready,nearReady,message:size<distanceMin?"Move a little closer":"Move a little farther away"};if(!pitchOk)return{ready,nearReady,message:(f.headPitch??0)>0?"Lower your chin slightly":"Raise your chin slightly"};if(!yawOk)return{ready,nearReady,message:(f.headYaw??0)>0?"Turn your face slightly left":"Turn your face slightly right"};if(!rollOk)return{ready,nearReady,message:"Keep your head level"};return{ready,nearReady,message:"Good position — hold briefly"};}
function updateStatus(settings:MediaTrackSettings){updateCameraChecks();if(calibrationActive||!calibrationSetup.hidden||!headWarning.hidden)return;const fps=tracker.getObservedFps(),fd=tracker.getFrameDiagnostics(),model=calibration.calibrationSummary?.config.model.type;status.textContent=["Camera running",`Resolution: ${settings.width??"?"} × ${settings.height??"?"}`,`Observed frame rate: ${fps?.toFixed(1)??"measuring…"} FPS`,`Camera track setting: ${fd.trackFps?.toFixed(1)??"?"} FPS`,`Video presented: ${fd.presentedFps?.toFixed(1)??"measuring…"} FPS`,`Frame callbacks: ${fd.callbackFps?.toFixed(1)??"measuring…"} Hz`,`Missed presented frames: ${fd.missedFrames}`,`Faces detected: ${detectedFaces}`,`Eye feature model: ${calibration.calibrationSummary?.config.featureModel??appearanceTracker.activeModel}`,`ELG acquisition: ${elgTracker.activeAcquisitionMode}`,`Gaze model: ${model??"not calibrated"}${headPoseModeLabel(calibration.calibrationSummary?.config.model)}`,`Calibration memory: ${calibration.hasCalibrationMemory?"available":"none"}`,`Head movement guard: ${headGuardInput.checked?"on":"off"}`,`Samples recorded: ${tracker.getSampleCount()}`].join("\n");}
function headPoseModeLabel(modelConfig:CalibrationConfig["model"]|undefined){
  if(!modelConfig)return"";
  const mode=modelConfig.headPoseMode??(modelConfig.includeHeadPose?"position_orientation":"off");
  return mode==="off"?"":mode==="position"?" + head position":" + head position/orientation";
}
function readCalibrationConfig():CalibrationConfig{return{featureModel:(featureModelInput?.value??"elg")as EyeFeatureModel,points:Number(pointsInput?.value??13)as CalibrationPointCount,settleMs:Number(settleInput?.value??700),sampleMs:Number(sampleInput?.value??900),repetitions:Number(repetitionsInput?.value??5),randomize:randomizeInput?.checked??true,jitterTargets:jitterTargetsInput?.checked??true,targetDistribution:(targetDistributionInput?.value??"repeated")as "repeated"|"coverage",headPoseCount:Number(headPoseCountInput?.value??5)as CalibrationHeadPoseCount,headPoseVariation:Number(headPoseCountInput?.value??5)>1,adaptiveTargets:adaptiveInput?.checked??true,smoothPursuit:{...DEFAULT_SMOOTH_PURSUIT_CONFIG,enabled:smoothPursuitInput?.checked??false,speedPxPerSec:Number(pursuitSpeedInput?.value??100)},target:{sizePx:Number(targetSizeInput?.value??34),shape:(targetShapeInput?.value??"bullseye")as TargetShape,color:targetColorInput?.value??"#172033"},model:{type:(modelInput?.value??"polynomial")as GazeModelType,ridge:Number(ridgeInput?.value??.05),rbfGamma:Number(gammaInput?.value??.15),knnK:Number(kInput?.value??3),headPoseMode:(headPoseModelInput?.value??"off")as HeadPoseMode}};}
function readHeadGuardConfig():HeadMovementGuardConfig{return{enabled:headGuardInput?.checked??true,maxXY:Number(headXYInput?.value??6)/100,maxZ:Number(headZInput?.value??12)/100,maxAngleDeg:Number(headAngleInput?.value??12),graceMs:Number(headGraceInput?.value??700)};}
function downloadCsv(samples:EyeTrackingSample[]){if(!samples.length)return;const columns=Object.keys(samples[0])as(keyof EyeTrackingSample)[],rows=samples.map(s=>columns.map(c=>csvCell(s[c])).join(",")),csv=[columns.join(","),...rows].join("\n"),blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`openeyetrack-${new Date().toISOString().replaceAll(":","-")}.csv`;link.click();URL.revokeObjectURL(url);}
function csvCell(value:unknown){if(value===null||value===undefined)return"";const text=String(value);return /[,"\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;}
function setBusy(busy:boolean){calibrateButton.disabled=busy;validateButton.disabled=busy||!calibration.model.calibrated;recordButton.disabled=busy||!calibration.model.calibrated;}
