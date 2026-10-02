import {
  OPEN_EYE_TRACK_API_VERSION,
  OpenEyeTrackRuntime,
  createOpenEyeTrack,
  defaultCalibrationConfig,
  evaluateNeutralHeadPosition,
  evaluatePoseAlignment,
  isCompatibleOpenEyeTrackApi,
  resolveOpenEyeTrackAssets
} from "../dist-sdk/openeyetrack.es.js";

if (OPEN_EYE_TRACK_API_VERSION !== "1") {
  throw new Error(`Unexpected API version: ${OPEN_EYE_TRACK_API_VERSION}`);
}
if (!isCompatibleOpenEyeTrackApi("1") || isCompatibleOpenEyeTrackApi("999")) {
  throw new Error("API compatibility check failed.");
}

const fakeVideo = {};
const tracker = createOpenEyeTrack(fakeVideo);
const requiredMethods = [
  "start","stop","startRecording","stopRecording","getSampleCount","getLastSample",
  "setTrial","mark","getObservedFps","getFrameDiagnostics",
  "getLatestGaze","onGaze","hasCalibration","getValidationMetrics"
];

for (const method of requiredMethods) {
  if (typeof tracker[method] !== "function") {
    throw new Error(`Missing public API method: ${method}`);
  }
}
if (tracker.apiVersion !== "1") throw new Error("Instance API version mismatch.");
if (tracker.getSampleCount() !== 0) throw new Error("New tracker should have zero samples.");
if (tracker.getLatestGaze() !== null) throw new Error("New tracker should have no gaze estimate.");
if (tracker.hasCalibration()) throw new Error("New tracker should not report calibration.");

const unsubscribe = tracker.onGaze(() => {});
if (typeof unsubscribe !== "function") throw new Error("onGaze() must return an unsubscribe function.");
unsubscribe();

console.log("OpenEyeTrack SDK API v1 smoke test passed.");

const runtimeMethods = [
  "initialize","start","stop","setConnectionState","isConnected","close",
  "runSetupProcedure","startSetup","calibrate","validate","recalibrateTargets",
  "startRecording","stopRecording","setRecordingState","isRecordingEnabled","checkRecording",
  "setTrial","sendMessage","message","mark",
  "getLastGazePosition","getPosition","getLastSample","newestFloatSample",
  "getRecordingData","getMessages","onGaze"
];

for (const method of runtimeMethods) {
  if (typeof OpenEyeTrackRuntime.prototype[method] !== "function") {
    throw new Error(`Missing experiment runtime method: ${method}`);
  }
}
const defaults = defaultCalibrationConfig();
if (defaults.points !== 13 || defaults.repetitions !== 5 || defaults.headPoseCount !== 1) {
  throw new Error("Safe SDK calibration defaults changed unexpectedly.");
}
console.log("OpenEyeTrack experiment runtime compatibility surface passed.");

const portable = resolveOpenEyeTrackAssets({
  baseUrl: "https://example.org/study/vendor/openeyetrack/"
});
if (portable.elgModelUrl !== "https://example.org/study/vendor/openeyetrack/models/gazeml_elg_i60x36_n32.onnx") {
  throw new Error(`Portable ELG asset resolution failed: ${portable.elgModelUrl}`);
}
if (portable.mediapipeWasmBaseUrl !== "https://example.org/study/vendor/openeyetrack/mediapipe/wasm/") {
  throw new Error(`Portable MediaPipe asset resolution failed: ${portable.mediapipeWasmBaseUrl}`);
}
console.log("OpenEyeTrack portable asset resolution passed.");

const neutral = evaluateNeutralHeadPosition({
  headX: .5,
  headY: .49,
  headZ: .25,
  headYaw: 0,
  headPitch: 0,
  headRoll: 0
});
if (!neutral.ready) throw new Error(`Neutral head-position criterion failed: ${neutral.message}`);

const baselineFace = [{ x: .4, y: .4, z: 0 }, { x: .6, y: .6, z: 0 }];
const leftFace = [{ x: .325, y: .4, z: 0 }, { x: .525, y: .6, z: 0 }];
if (!evaluatePoseAlignment(baselineFace, leftFace, "left").ready) {
  throw new Error("Ghost-mesh pose alignment criterion failed.");
}
console.log("OpenEyeTrack head-position guidance criteria passed.");
