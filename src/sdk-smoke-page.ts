import {
  OPEN_EYE_TRACK_API_VERSION,
  OpenEyeTrackRuntime,
  defaultCalibrationConfig
} from "./sdk";

const video = document.querySelector<HTMLVideoElement>("#camera")!;
const calibrationTarget = document.querySelector<HTMLElement>("#calibration-target")!;
const connect = document.querySelector<HTMLButtonElement>("#connect")!;
const setup = document.querySelector<HTMLButtonElement>("#setup")!;
const startRecording = document.querySelector<HTMLButtonElement>("#start-recording")!;
const sendMessage = document.querySelector<HTMLButtonElement>("#message")!;
const stopRecording = document.querySelector<HTMLButtonElement>("#stop-recording")!;
const disconnect = document.querySelector<HTMLButtonElement>("#disconnect")!;
const status = document.querySelector<HTMLElement>("#status")!;
document.querySelector<HTMLElement>("#api-version")!.textContent = OPEN_EYE_TRACK_API_VERSION;

const config = {
  ...defaultCalibrationConfig(),
  points: 5 as const,
  repetitions: 1,
  settleMs: 350,
  sampleMs: 600,
  randomize: false,
  jitterTargets: false
};

const tracker = new OpenEyeTrackRuntime({
  video,
  calibrationTarget,
  calibrationConfig: config,
  assetBaseUrl: new URL("./", document.baseURI).href
});

connect.onclick = async () => {
  try {
    const settings = await tracker.setConnectionState(true, { frameRate: 60 });
    status.textContent = `Connected. isConnected() = ${tracker.isConnected()}\nAsset base: ${tracker.getAssetUrls().baseUrl}\nELG model: ${tracker.getAssetUrls().elgModelUrl}\n${JSON.stringify(settings, null, 2)}`;
    connect.disabled = true;
    setup.disabled = false;
    disconnect.disabled = false;
  } catch (error) {
    status.textContent = `Connection error: ${error instanceof Error ? error.message : String(error)}`;
  }
};

setup.onclick = async () => {
  setup.disabled = true;
  status.textContent = "Running quick runSetupProcedure()…";
  try {
    const result = await tracker.runSetupProcedure({ config, validate: true });
    status.textContent =
      `${result.RESULT}\nCalibration observations: ${result.calibration.observations}\nValidation mean error: ${result.validation?.meanPx.toFixed(1) ?? "n/a"} px\nReady for recording.`;
    startRecording.disabled = false;
  } catch (error) {
    status.textContent = `Setup error: ${error instanceof Error ? error.message : String(error)}`;
    setup.disabled = false;
  }
};

startRecording.onclick = () => {
  tracker.setTrial("sdk-runtime-trial-001");
  tracker.setRecordingState(true);
  tracker.sendMessage("TRIALID sdk-runtime-trial-001");
  tracker.sendMessage("RECORDING_START");
  startRecording.disabled = true;
  sendMessage.disabled = false;
  stopRecording.disabled = false;
  status.textContent = "Recording. Use the message button to add an EyeLink-style event marker.";
};

sendMessage.onclick = () => {
  tracker.sendMessage("STIM_ONSET");
  const gaze = tracker.getLastGazePosition();
  const sample = tracker.newestFloatSample();
  status.textContent =
    `STIM_ONSET sent.\nLatest gaze: ${gaze ? gaze.map(v => v.toFixed(1)).join(", ") : "not available"}\nNewest sample frame: ${sample?.frameId ?? "not available"}`;
};

stopRecording.onclick = async () => {
  tracker.sendMessage("TRIAL_RESULT 0");
  await tracker.drain();
  const samples = tracker.stopRecording();
  startRecording.disabled = false;
  sendMessage.disabled = true;
  stopRecording.disabled = true;
  status.textContent =
    `Recording stopped: ${samples.length} samples, ${tracker.getMessages().length} timestamped messages.\nsetRecordingState/isRecordingEnabled = ${tracker.isRecordingEnabled()}`;
};

disconnect.onclick = async () => {
  await tracker.setConnectionState(false);
  connect.disabled = false;
  setup.disabled = true;
  startRecording.disabled = true;
  sendMessage.disabled = true;
  stopRecording.disabled = true;
  disconnect.disabled = true;
  status.textContent = "Disconnected. SDK runtime smoke test complete.";
};
