# OpenEyeTrack software architecture

## Vision

OpenEyeTrack is a reusable, browser-native webcam eye-tracking framework for behavioural research. It should run without participant installation, support self-hosting, process webcam imagery locally by default, and expose transparent sample-level measurements and quality metrics.

## Architecture

The intended processing pipeline is:

Camera → face/eye features → gaze model → calibration → screen coordinates → quality control → recording/export

Modules are kept separate so gaze-estimation algorithms can change without changing the experiment-facing API.

### Planned modules

- Camera acquisition and frame timing
- Face/eye/iris landmarks
- Pupil-size measurement
- Head pose and movement
- Gaze estimation
- Configurable calibration
- Independent validation
- Drift checks/correction
- Quality control
- Sample-level recording and event markers
- CSV/JSON export
- Experiment integrations

## Sample-level data

The acquisition layer records samples rather than imposing fixation/saccade classification. Reserved fields include gaze coordinates and confidence, left/right pupil measures, head position/rotation, tracking confidence, trial labels and event markers.

## Privacy

The default design keeps raw webcam frames on the participant device. Sending or storing images/video should require a separate explicit feature and appropriate researcher consent/governance.

## v0.1

The first milestone is intentionally small: open a URL, grant webcam permission, capture frame timestamps, estimate observed FPS, record sample-level rows locally and export CSV.

## Roadmap

1. Face, eye and iris landmarks.
2. Head pose.
3. Pupil-size features.
4. Baseline gaze estimation.
5. Configurable calibration.
6. Independent validation and QC.
7. Drift checks and correction.
8. jsPsych integration.
9. EyeLink benchmarking mode.
