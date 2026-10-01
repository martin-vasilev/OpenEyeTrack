import {
  OPEN_EYE_TRACK_API_VERSION,
  OpenEyeTrackRuntime,
  createOpenEyeTrack,
  defaultCalibrationConfig,
  isCompatibleOpenEyeTrackApi
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
