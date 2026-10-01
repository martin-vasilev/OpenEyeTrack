# OpenEyeTrack

Browser-native webcam eye tracking for behavioural and psychological research.

<h2 align="center"><a href="https://martin-vasilev.github.io/OpenEyeTrack/">▶ Try OpenEyeTrack in your browser</a></h2>

<p align="center"><strong>No installation required for the live demo.</strong> Start your camera, calibrate, validate, and try the interactive gaze tasks directly in the browser.</p>

---

## Current status

OpenEyeTrack is an active research prototype for running webcam-based eye tracking entirely in the browser. The current production build includes working gaze estimation, calibration and validation, head-pose tracking, recording/export tools, quality-control checks, and a set of interactive demo paradigms.

The current default workflow is:

1. **Camera check**
2. **Gaze calibration**
3. **Validation**
4. **Live demo / recording**
5. **Heatmaps and data export**

The project is still under active development and should not yet be treated as a drop-in replacement for a laboratory eye tracker without task-specific validation.

## What is currently implemented

### Webcam and tracking

- browser-native webcam acquisition;
- frame-level and Unix-epoch timestamps;
- observed camera/callback frame-rate diagnostics;
- MediaPipe face landmarks and facial transformation matrices;
- eye-region feature extraction;
- ELG eye-landmark gaze features as the current default;
- live gaze position with confidence/support information;
- head position, apparent distance and yaw/pitch/roll;
- optional head-movement guard during recording;
- gaze filtering and outlier diagnostics;
- live gaze cursor.

### Gaze-estimation options

The current interface includes several selectable feature/model combinations.

**Eye feature models**

- **ELG eye landmarks** — current default;
- MediaPipe iris landmarks;
- MobileGaze MobileOne S0;
- MobileGaze ResNet-34.

**Gaze mapping models**

- linear ridge regression;
- **robust polynomial ridge regression** — current default;
- RBF kernel regression;
- k-nearest neighbours.

Head information can optionally be included in the gaze mapping as:

- **Off** — current default;
- Position only: X / Y / apparent distance;
- Position + orientation: X / Y / distance + yaw / pitch / roll.

Head variables enter as linear correction terms; the current model does not use eye × head interaction terms.

## Current safe calibration defaults

The production build currently starts with the best-known stable configuration from development testing:

- **13 targets**
- **5 calibration runs**
- **1 centre head pose**
- stable/repeated target grid
- polynomial ridge gaze model
- ELG eye landmarks
- head-pose predictors **off**
- smooth-pursuit calibration **off**
- targeted re-sampling of inaccurate validation locations **off**

Advanced settings also allow:

- 5, 9, 13, 15 or 25 calibration targets;
- distributed screen coverage across runs;
- 1, 3 or 5 instructed head poses;
- optional smooth-pursuit calibration;
- different gaze-model families;
- optional head-position/orientation predictors;
- configurable target size, shape, colour, settle time and sampling time.

## Validation

After calibration, OpenEyeTrack runs a separate validation step and reports measures including:

- mean validation error;
- median validation error;
- RMS sample-to-sample precision;
- percentage of valid samples;
- a spatial validation-error map.

Validation does not automatically refit the gaze model under the current safe defaults.

## Interactive demo tasks

The GitHub Pages build includes several tasks intended to show different uses of browser eye tracking:

- **Pictures** — free viewing of natural images;
- **Videos** — short autoplaying clips;
- **Reading** — longer text passages with comfortable font size and spacing;
- **Pro / anti-saccade** — simple peripheral eye-movement trials;
- **Stroop** — congruent and incongruent colour-word trials;
- **Visual World** — spoken instructions with four competing visual objects;
- **Visual Search** — find a target among distractors;
- **Gaze-contingent moving window** — pictures are masked except for a clear region centred on the current gaze estimate.

The demo records gaze automatically once a task starts and provides task-specific heatmap filtering afterwards.

## Data export

OpenEyeTrack currently exposes several downloadable files.

### Gaze recording

The main recording is exported as a timestamped CSV such as:

`openeyetrack-2026-10-01T15-00-00.000Z.csv`

Sample-level fields include, where available:

- timestamps and frame IDs;
- raw and filtered gaze X/Y;
- gaze confidence/support;
- outlier and raw-deviation information;
- eye-feature confidence;
- head X/Y/Z and yaw/pitch/roll;
- calibration and validation references;
- trial labels and event markers;
- camera/frame diagnostics;
- optional developer timing diagnostics.

### Calibration and validation

The interface can also download:

- `calibration.csv`
- `validation.csv`
- `session_metadata.json`

Calibration data include raw samples, fitted observations, target coordinates, calibration run/round, head-pose condition and timestamps. Validation data include target locations, gaze samples and run information.

## Privacy

The intended default is local processing.

Webcam frames are processed in the browser and OpenEyeTrack does not upload or store webcam video as part of the current application. The browser does download model/runtime assets required for tracking, including MediaPipe resources, but camera imagery itself is not sent to those model hosts.

Researchers deploying modified versions should independently verify their own hosting, logging and data-handling arrangements.

## Live deployment

Production demo:

**https://martin-vasilev.github.io/OpenEyeTrack/**

Developer diagnostics page:

**https://martin-vasilev.github.io/OpenEyeTrack/diagnostics.html**

The repository also maintains a development preview under `/OpenEyeTrack/dev/` for experimental changes.

## Local development

Requirements:

- current Node.js;
- a modern browser with webcam access;
- WebAssembly and Web Worker support.

Basic setup:

```bash
git clone https://github.com/martin-vasilev/OpenEyeTrack.git
cd OpenEyeTrack
npm install
npm run dev
```

The repository does not commit all large model/runtime assets directly. The GitHub Pages workflow provisions the current ELG/MobileGaze model files, ONNX Runtime browser files and MediaPipe WASM assets before building.

For a production-equivalent local build, mirror the asset-provisioning steps in:

`.github/workflows/deploy-pages.yml`

Then run:

```bash
npm run typecheck
npm run build
npm run preview
```

## Project structure

```text
src/
  calibration/   calibration, validation and gaze mapping
  camera/        webcam acquisition
  core/          OpenEyeTrack runtime and sampling loop
  data/          calibration / validation session export
  features/      MediaPipe, ELG and appearance-based feature extraction
  gaze/          gaze filtering
  qc/            head-position and quality-control utilities
  recording/     sample recording
  types/         shared sample/data structures
  diagnostics.ts browser performance diagnostics

docs/
  specification.md
```

## Core API

The acquisition layer remains usable independently of the demo interface:

```ts
const tracker = new OpenEyeTrack(videoElement);

await tracker.start({ frameRate: 60 });

tracker.startRecording();
tracker.setTrial("trial-001");
tracker.mark("stimulus_onset");

// run experiment and provide features/gaze estimates

const samples = tracker.stopRecording();
tracker.stop();
```

OpenEyeTrack's core output is sample-level data. Fixation and saccade classification are intentionally kept outside the acquisition layer so researchers can choose analysis methods appropriate for their task and sampling rate.

## Diagnostics

A dedicated diagnostics page is included for benchmarking browser/camera performance. Development recordings can optionally include internal timing columns such as:

- callback timing;
- MediaPipe processing time;
- ELG inference timing;
- frame-drop information;
- internal pipeline timing.

These developer diagnostics are off by default for normal recordings.

## Documentation

See [docs/specification.md](docs/specification.md) for the architecture/specification notes.

## Licence

A dedicated licence file has not yet been finalised in the repository. The intended direction is non-commercial/source-available licensing.

Until a licence is added, do not assume that the absence of a licence grants permission for unrestricted reuse or redistribution.

## Contributing

Issues and pull requests are welcome, particularly around:

- calibration and validation methodology;
- webcam sampling performance;
- gaze-estimation accuracy;
- cross-browser behaviour;
- reproducible benchmarks;
- behavioural-research integrations;
- new demo paradigms and experiment components.
