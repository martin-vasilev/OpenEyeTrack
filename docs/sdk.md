# OpenEyeTrack SDK infrastructure

This document describes the experiment-facing API introduced during the v0.3 infrastructure phase.

## Stability model

OpenEyeTrack separates **package versions** from the **experiment API version**.

- Package releases may change as tracking, calibration and gaze-estimation internals improve.
- Platform integrations should depend on the exported `OpenEyeTrackAPI` contract.
- The current experiment API is **v1**.
- Internal classes, feature extractors, calibration implementations and demo code are not part of the compatibility promise.
- New public methods may be added without breaking API v1. Existing v1 methods should not be removed or have their meaning changed without introducing a new API version.

The exported constant is:

```ts
OPEN_EYE_TRACK_API_VERSION === "1"
```

## Current stable core contract

```ts
const tracker = createOpenEyeTrack(video);

await tracker.start({ frameRate: 60 });

tracker.setTrial("trial-001");
tracker.mark("stimulus_onset");

tracker.startRecording();

// experiment runs here

const samples = tracker.stopRecording();
tracker.stop();
```

The v1 contract currently includes:

- camera start/stop;
- recording start/stop;
- trial labels;
- event markers;
- sample count;
- frame-rate diagnostics;
- latest live gaze readout;
- live gaze subscription;
- calibration-state readout;
- validation-metric readout.

Calibration UI and platform-specific adapters will be layered on top of this core contract.

## Live gaze

Adapters and gaze-contingent paradigms can subscribe without depending on gaze-model internals:

```ts
const unsubscribe = tracker.onGaze(gaze => {
  if (!gaze) return;
  spotlight.style.left = `${gaze.x}px`;
  spotlight.style.top = `${gaze.y}px`;
});

// later
unsubscribe();
```

## Package builds

Development now produces a separate SDK bundle:

```bash
npm run build:sdk
```

Outputs:

```text
dist-sdk/
  openeyetrack.es.js
  openeyetrack.iife.js
  types/
```

The ESM build is intended for bundlers and modern experiment code. The IIFE build is intended for experimental platforms that can load a browser script but do not provide a package bundler.

The package remains `private: true` while the SDK is under development, preventing accidental npm publication.

## Compatibility test

Before packaging a new version:

```bash
npm run test:sdk
```

This builds the ESM/IIFE SDK, emits TypeScript declarations, imports the built ESM package in Node, and checks API version 1 plus the required public methods.

CI also runs this contract smoke test on pull requests.

## Manual browser smoke test

The development build includes:

`/OpenEyeTrack/dev/sdk-test.html`

It uses the exported factory rather than the main demo application and checks:

- SDK import;
- camera startup;
- recording;
- trial/event markers;
- sample production.

This tests the integration boundary independently from the OpenEyeTrack demo UI.

## Future adapters

Platform packages can depend on `OpenEyeTrackAPI`, for example:

```text
@openeyetrack/core
@openeyetrack/jspsych
@openeyetrack/psychojs
```

A jsPsych extension should call only stable methods such as `setTrial()`, `mark()`, `startRecording()`, `stopRecording()` and `onGaze()`.

This means gaze models, calibration algorithms, filtering and feature extraction can be replaced in later releases without requiring platform adapters to be rewritten, provided the public API contract remains compatible.


## EyeLink / PsychoPy / Psychtoolbox compatibility vocabulary

The experiment runtime intentionally exposes familiar control names.

| Familiar workflow | OpenEyeTrack runtime |
| --- | --- |
| PsychoPy `setConnectionState(True)` | `await tracker.setConnectionState(true)` |
| PsychoPy `runSetupProcedure()` | `await tracker.runSetupProcedure()` |
| PsychoPy `setRecordingState(True/False)` | `tracker.setRecordingState(true/false)` |
| PsychoPy `isRecordingEnabled()` | `tracker.isRecordingEnabled()` |
| PsychoPy `getLastGazePosition()` | `tracker.getLastGazePosition()` |
| PsychoPy `getPosition()` | `tracker.getPosition()` |
| EyeLink / PTB `StartSetup` | `await tracker.startSetup()` |
| EyeLink / PTB `StartRecording` | `tracker.startRecording()` |
| EyeLink / PTB `StopRecording` | `tracker.stopRecording()` |
| EyeLink / PTB `Message` | `tracker.sendMessage(message)` or `tracker.message(message)` |
| EyeLink / PTB `NewestFloatSample` | `tracker.newestFloatSample()` |
| EyeLink connection close | `tracker.close()` or `await tracker.setConnectionState(false)` |

Browser operations that require permission, model loading, calibration or validation are asynchronous and therefore return promises.

OpenEyeTrack does not emulate EyeLink host-PC commands or EDF transfer. Browser recordings remain OpenEyeTrack sample/event data rather than pretending to be EDF files.

### Trial markers

A familiar EyeLink-style experiment can use:

```ts
tracker.setTrial("trial-012");
tracker.sendMessage("TRIALID trial-012");
tracker.setRecordingState(true);

tracker.sendMessage("STIM_ONSET");
// present stimulus

tracker.sendMessage("RESPONSE left");
tracker.sendMessage("TRIAL_RESULT 0");
tracker.setRecordingState(false);
```

`sendMessage()` records a timestamped message in the runtime event log and also places the message onto the sample stream as the next event marker.

### Why aliases are useful

The aliases are not intended to make OpenEyeTrack pretend to be an EyeLink device. They reduce the conceptual changes needed when porting an experiment: setup, recording state, messages and live gaze access retain familiar meanings, while the underlying browser tracker remains replaceable.


## Portable asset hosting

The SDK no longer assumes it is hosted at `/OpenEyeTrack/`.

By default, OpenEyeTrack resolves its local runtime assets relative to the directory containing the experiment page:

```text
<experiment base>/
  models/
    gazeml_elg_i60x36_n32.onnx
    mobileone_s0_gaze.onnx
    resnet34_gaze.onnx
  mediapipe/
    wasm/
      ...
```

For an experiment hosted somewhere else, set a base directory explicitly:

```ts
const tracker = new OpenEyeTrackRuntime({
  video,
  calibrationTarget,
  assetBaseUrl: "https://example.org/my-study/openeyetrack/"
});
```

This resolves, for example:

```text
https://example.org/my-study/openeyetrack/models/gazeml_elg_i60x36_n32.onnx
https://example.org/my-study/openeyetrack/mediapipe/wasm/
```

Fine-grained overrides are also supported:

```ts
const tracker = new OpenEyeTrackRuntime({
  video,
  calibrationTarget,
  assets: {
    baseUrl: "/vendor/openeyetrack/",
    elgModelUrl: "https://models.example.org/elg.onnx",
    mediapipeWasmBaseUrl: "/shared/mediapipe/wasm/",
    ortWasmBaseUrl: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/"
  }
});
```

The resolved manifest can be inspected at runtime:

```ts
console.log(tracker.getAssetUrls());
```

This is intended to let the same SDK bundle run under GitHub Pages, JATOS, Pavlovia, university web servers, or other browser experiment hosts without editing OpenEyeTrack source code.

The MediaPipe face-landmarker model remains remotely hosted by default, but `faceLandmarkerModelUrl` can be overridden for fully controlled/self-hosted deployments.
