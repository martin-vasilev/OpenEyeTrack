# OpenEyeTrack

Browser-native webcam eye tracking for behavioural and psychological research.

> **Status:** early v0.1 prototype. The current build provides webcam acquisition, frame-level timestamps, observed frame-rate monitoring, a stable sample schema, local recording and CSV export. Gaze, pupil and head-pose fields are placeholders for the next modules.

## Goals

OpenEyeTrack is being developed as a reusable research framework rather than a single gaze-estimation model. The long-term platform will support:

- gaze position and confidence;
- pupil-size measures;
- head position and movement;
- configurable calibration and validation;
- drift checks and correction;
- transparent quality-control metrics;
- local browser processing by default;
- experiment event markers and sample-level export;
- replaceable gaze-estimation models;
- integrations with research platforms such as jsPsych.

## Quick start

Requirements: a current Node.js installation and a modern browser with webcam access.

```bash
git clone https://github.com/martin-vasilev/OpenEyeTrack.git
cd OpenEyeTrack
npm install
npm run dev
```

Open the local address shown by Vite, click **Start camera**, grant webcam permission, then start a short recording. The prototype reports the negotiated camera settings and an observed frame-rate estimate. Stop the recording to enable CSV export.

## Build

```bash
npm run typecheck
npm run build
npm run preview
```

## Current structure

```text
src/
  camera/       webcam acquisition
  core/         public OpenEyeTrack API
  recording/    sample recording
  types/        shared data structures
docs/
  specification.md
```

Planned modules will add `features/`, `gaze/`, `pupil/`, `head/`, `calibration/`, `validation/`, `drift/` and `qc/` as they become functional.

## Basic API direction

```ts
const tracker = new OpenEyeTrack(videoElement);

await tracker.start({ frameRate: 60 });

tracker.startRecording();
tracker.setTrial("trial-001");
tracker.mark("stimulus_onset");

// run experiment

const samples = tracker.stopRecording();
tracker.stop();
```

## Data

Each frame can produce an `EyeTrackingSample`. At this stage, timestamps, frame IDs, trials and event markers are implemented. Gaze, pupil, head-pose and tracking-quality fields intentionally remain `null` until their respective measurement modules are added.

Fixation and saccade classification are intentionally not part of the acquisition layer: OpenEyeTrack's core output is sample-level data.

## Privacy

The intended default is local processing: webcam imagery should remain on the participant's device. The current prototype does not upload or store webcam video.

## Documentation

See [docs/specification.md](docs/specification.md) for the initial architecture and roadmap.

## Licence

A non-commercial/source-available licence is planned. The exact licence text should be finalized before the first public release; commercial-use restrictions mean the project should not be described as OSI-defined “open source” unless the licence later changes.

## Contributing

The project is at an early design stage. Issues describing measurement requirements, browser behaviour, validation procedures and reproducible benchmarks are especially welcome.
