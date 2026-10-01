import {
  OPEN_EYE_TRACK_API_VERSION,
  createOpenEyeTrack
} from "./sdk";

const video = document.querySelector<HTMLVideoElement>("#camera")!;
const startCamera = document.querySelector<HTMLButtonElement>("#start-camera")!;
const startRecording = document.querySelector<HTMLButtonElement>("#start-recording")!;
const stopRecording = document.querySelector<HTMLButtonElement>("#stop-recording")!;
const stopCamera = document.querySelector<HTMLButtonElement>("#stop-camera")!;
const status = document.querySelector<HTMLElement>("#status")!;
document.querySelector<HTMLElement>("#api-version")!.textContent = OPEN_EYE_TRACK_API_VERSION;

const tracker = createOpenEyeTrack(video);

startCamera.onclick = async () => {
  try {
    const settings = await tracker.start({ frameRate: 60 });
    status.textContent = `Camera started through SDK API v${tracker.apiVersion}.\n${JSON.stringify(settings, null, 2)}`;
    startCamera.disabled = true;
    startRecording.disabled = false;
    stopCamera.disabled = false;
  } catch (error) {
    status.textContent = `Camera error: ${error instanceof Error ? error.message : String(error)}`;
  }
};

startRecording.onclick = () => {
  tracker.setTrial("sdk-smoke-trial");
  tracker.mark("recording_start");
  tracker.startRecording();
  startRecording.disabled = true;
  stopRecording.disabled = false;
  status.textContent = "Recording sample stream through the stable SDK API…";
};

stopRecording.onclick = () => {
  tracker.mark("recording_stop");
  const samples = tracker.stopRecording();
  stopRecording.disabled = true;
  startRecording.disabled = false;
  status.textContent = `SDK recording succeeded: ${samples.length} samples.\nFirst sample fields: ${samples[0] ? Object.keys(samples[0]).slice(0, 12).join(", ") : "none"}`;
};

stopCamera.onclick = () => {
  tracker.stop();
  startCamera.disabled = false;
  startRecording.disabled = true;
  stopRecording.disabled = true;
  stopCamera.disabled = true;
  status.textContent = "Camera stopped. SDK smoke test complete.";
};
