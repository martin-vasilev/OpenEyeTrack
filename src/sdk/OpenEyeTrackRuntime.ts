import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { OpenEyeTrack } from "../core/OpenEyeTrack";
import type { CameraConfig } from "../camera/Camera";
import { FaceFeatureTracker } from "../features/FaceFeatureTracker";
import { AppearanceGazeTracker, type AppearanceGazeFeatures } from "../features/AppearanceGazeTracker";
import { ElgEyeTracker, type ElgEyeFeatures } from "../features/ElgEyeTracker";
import { extractEyeHeadFeatures, type EyeHeadFeatures } from "../features/EyeHeadFeatures";
import {
  CalibrationController,
  type CalibrationConfig,
  type CalibrationHeadPose,
  type CalibrationSummary,
  type SavedCalibration,
  type ValidationPointResult,
  type ValidationResult
} from "../calibration/CalibrationController";
import { DEFAULT_SMOOTH_PURSUIT_CONFIG } from "../calibration/SmoothPursuitCalibration";
import { AdaptiveGazeFilter } from "../gaze/AdaptiveGazeFilter";
import { SessionDataManager } from "../data/SessionDataManager";
import type { EyeTrackingSample } from "../types/Sample";
import type { GazePrediction } from "../calibration/LinearGazeModel";
import {
  resolveOpenEyeTrackAssets,
  type OpenEyeTrackAssetConfig,
  type ResolvedOpenEyeTrackAssets
} from "../core/AssetPaths";
import {
  DefaultSetupUI,
  OpenEyeTrackSetupCancelledError
} from "./DefaultSetupUI";
import { cloneLandmarks } from "./HeadPositioning";

export interface OpenEyeTrackMessage {
  timestamp: number;
  message: string;
  trial: string | null;
}

export interface OpenEyeTrackRuntimeFrame {
  timestamp: number;
  face: NormalizedLandmark[] | null;
  features: EyeHeadFeatures | null;
  rawGaze: GazePrediction | null;
  gaze: GazePrediction | null;
  detectedFaces: number;
}

export interface OpenEyeTrackSetupResult {
  RESULT: "CALIBRATION_OK";
  calibration: CalibrationSummary;
  validation: ValidationResult | null;
}

export interface OpenEyeTrackSetupOptions {
  config?: CalibrationConfig;
  validate?: boolean;
  /**
   * "default" temporarily takes over the browser viewport for positioning,
   * calibration and validation. "none" leaves all setup presentation to the host.
   *
   * When calibrationTarget is omitted from the runtime constructor, this
   * defaults to "default".
   */
  ui?: "default" | "none";
  beforeRound?: (round: number, pose: CalibrationHeadPose) => Promise<void>;
  beforePursuit?: () => Promise<void>;
}

export interface OpenEyeTrackRuntimeOptions {
  video: HTMLVideoElement;
  /**
   * Optional host-provided calibration target. Omit this to let the SDK create
   * and manage its own full-screen setup/calibration UI.
   */
  calibrationTarget?: HTMLElement;
  calibrationConfig?: CalibrationConfig;
  sessionData?: SessionDataManager;
  onFrame?: (frame: OpenEyeTrackRuntimeFrame) => void;
  /**
   * Convenience base directory for models/ and mediapipe/wasm/.
   * Defaults to the directory containing the hosting experiment page.
   */
  assetBaseUrl?: string;
  /** Fine-grained asset overrides. These take precedence over assetBaseUrl. */
  assets?: OpenEyeTrackAssetConfig;
}

export function defaultCalibrationConfig(): CalibrationConfig {
  return {
    featureModel: "elg",
    points: 13,
    settleMs: 700,
    sampleMs: 900,
    repetitions: 5,
    randomize: true,
    jitterTargets: true,
    targetDistribution: "repeated",
    headPoseVariation: false,
    headPoseCount: 1,
    adaptiveTargets: false,
    smoothPursuit: { ...DEFAULT_SMOOTH_PURSUIT_CONFIG, enabled: false, speedPxPerSec: 100 },
    target: { sizePx: 34, shape: "bullseye", color: "#172033" },
    model: { type: "polynomial", ridge: .05, rbfGamma: .15, knnK: 3, headPoseMode: "off" }
  };
}

/**
 * Experiment-facing runtime. This owns the browser tracking pipeline that was
 * historically orchestrated directly from main.ts.
 *
 * The method aliases intentionally resemble EyeLink/PsychoPy/Psychtoolbox
 * control flows while remaining asynchronous where browser permissions or
 * model loading require it.
 */
export class OpenEyeTrackRuntime {
  readonly core: OpenEyeTrack;
  readonly sessionData: SessionDataManager;
  readonly calibration: CalibrationController;
  readonly assets: ResolvedOpenEyeTrackAssets;

  private readonly faceTracker: FaceFeatureTracker;
  private readonly appearanceTracker: AppearanceGazeTracker;
  private readonly elgTracker: ElgEyeTracker;
  private readonly gazeFilter = new AdaptiveGazeFilter();
  private readonly calibrationTarget: HTMLElement;
  private setupUi: DefaultSetupUI | null = null;

  private animationId: number | null = null;
  private lastProcessedVideoTime = -1;
  private connected = false;
  private recording = false;
  private currentTrial: string | null = null;
  private latestFace: NormalizedLandmark[] | null = null;
  private latestFeatures: EyeHeadFeatures | null = null;
  private latestAppearance: AppearanceGazeFeatures | null = null;
  private latestElg: ElgEyeFeatures | null = null;
  private detectedFaces = 0;
  private config: CalibrationConfig;
  private lastRecording: EyeTrackingSample[] = [];
  private messages: OpenEyeTrackMessage[] = [];

  constructor(private readonly options: OpenEyeTrackRuntimeOptions) {
    const assetConfig: OpenEyeTrackAssetConfig = { ...options.assets };
    if (options.assetBaseUrl && assetConfig.baseUrl === undefined) assetConfig.baseUrl = options.assetBaseUrl;
    this.assets = resolveOpenEyeTrackAssets(assetConfig);
    const usePackagedWorker =
      options.assetBaseUrl !== undefined ||
      assetConfig.baseUrl !== undefined ||
      assetConfig.faceLandmarkerWorkerUrl !== undefined;
    this.faceTracker = new FaceFeatureTracker({
      mediapipeWasmBaseUrl: this.assets.mediapipeWasmBaseUrl,
      faceLandmarkerModelUrl: this.assets.faceLandmarkerModelUrl,
      workerUrl: usePackagedWorker ? this.assets.faceLandmarkerWorkerUrl : undefined
    });
    this.appearanceTracker = new AppearanceGazeTracker({
      mobileOneModelUrl: this.assets.mobileOneModelUrl,
      resnet34ModelUrl: this.assets.resnet34ModelUrl,
      ortWasmBaseUrl: this.assets.ortWasmBaseUrl
    });
    this.elgTracker = new ElgEyeTracker({
      modelUrl: this.assets.elgModelUrl,
      ortWasmBaseUrl: this.assets.ortWasmBaseUrl
    });
    this.config = cloneConfig(options.calibrationConfig ?? defaultCalibrationConfig());
    this.sessionData = options.sessionData ?? new SessionDataManager();
    this.core = new OpenEyeTrack(options.video);
    if (options.calibrationTarget) {
      this.calibrationTarget = options.calibrationTarget;
    } else {
      this.setupUi = new DefaultSetupUI(options.video);
      this.calibrationTarget = this.setupUi.target;
    }
    this.calibration = new CalibrationController(this.calibrationTarget, this.config, this.sessionData);
  }

  async initialize(): Promise<void> {
    await this.faceTracker.initialize();
  }

  async start(config: CameraConfig = {}): Promise<MediaTrackSettings> {
    return this.setConnectionState(true, config);
  }

  stop(): void {
    void this.setConnectionState(false);
  }

  async setConnectionState(connected: true, config?: CameraConfig): Promise<MediaTrackSettings>;
  async setConnectionState(connected: false, config?: CameraConfig): Promise<false>;
  async setConnectionState(connected: boolean, config: CameraConfig = {}): Promise<MediaTrackSettings | false> {
    if (connected) {
      if (this.connected) return this.options.video.srcObject
        ? (this.options.video.srcObject as MediaStream).getVideoTracks()[0]?.getSettings() ?? {}
        : {};
      await this.initialize();
      const settings = await this.core.start(config);
      this.connected = true;
      this.lastProcessedVideoTime = -1;
      this.schedulePipeline();
      return settings;
    }
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    this.animationId = null;
    this.connected = false;
    this.recording = false;
    this.faceTracker.close();
    this.core.stop();
    this.gazeFilter.reset();
    this.latestFace = null;
    this.latestFeatures = null;
    this.latestAppearance = null;
    this.latestElg = null;
    this.detectedFaces = 0;
    this.setupUi?.hide();
    return false;
  }

  isConnected(): boolean { return this.connected; }

  close(): void { this.stop(); }

  setCalibrationConfig(config: CalibrationConfig): void {
    this.config = cloneConfig(config);
    this.calibration.setConfig(this.config);
  }

  getCalibrationConfig(): CalibrationConfig { return cloneConfig(this.config); }

  async calibrate(options: Omit<OpenEyeTrackSetupOptions, "validate"> = {}): Promise<CalibrationSummary> {
    if (!this.connected) throw new Error("OpenEyeTrack is not connected. Start the camera first.");
    if (options.config) this.setCalibrationConfig(options.config);
    await this.prepareFeatureModel();
    const summary = await this.calibration.calibrate(
      () => this.latestFeatures,
      options.beforeRound,
      options.beforePursuit
    );
    this.core.setCalibrationSummary(summary);
    this.core.setCalibrationRun(this.sessionData.currentCalibrationRun);
    this.gazeFilter.reset();
    return summary;
  }

  async validate(): Promise<ValidationResult> {
    if (!this.calibration.model.calibrated) throw new Error("Calibrate before validation.");
    const result = await this.calibration.validate(() => this.latestFeatures);
    this.core.setValidationResult(result);
    this.gazeFilter.reset();
    return result;
  }

  async recalibrateTargets(points: ValidationPointResult[]): Promise<CalibrationSummary> {
    const summary = await this.calibration.recalibrateTargets(() => this.latestFeatures, points);
    this.core.setCalibrationSummary(summary);
    this.core.setCalibrationRun(this.sessionData.currentCalibrationRun);
    this.gazeFilter.reset();
    return summary;
  }

  exportSavedCalibration(): SavedCalibration | null {
    return this.calibration.exportSavedCalibration();
  }

  restoreSavedCalibration(saved: SavedCalibration): void {
    this.calibration.restoreSavedCalibration(saved);
    this.config = cloneConfig(saved.config);
    const summary = this.calibration.calibrationSummary;
    if (summary) this.core.setCalibrationSummary(summary);
    this.core.setCalibrationRun(this.sessionData.currentCalibrationRun);
    this.gazeFilter.reset();
  }

  async runSetupProcedure(options: OpenEyeTrackSetupOptions = {}): Promise<OpenEyeTrackSetupResult> {
    if (!this.connected) throw new Error("OpenEyeTrack is not connected. Start the camera first.");

    const uiMode = options.ui ?? (this.options.calibrationTarget ? "none" : "default");
    if (uiMode === "none") {
      const calibration = await this.calibrate(options);
      const validation = options.validate === false ? null : await this.validate();
      return { RESULT: "CALIBRATION_OK", calibration, validation };
    }

    const ui = this.ensureSetupUi();
    const config = cloneConfig(options.config ?? this.config);
    const totalRuns = Math.max(1, Math.min(5, Math.round(config.repetitions)));

    try {
      await ui.intro(
        config,
        () => this.latestFeatures,
        () => this.detectedFaces
      );

      const baselineFace = cloneLandmarks(this.latestFace);
      if (!baselineFace) throw new Error("Could not capture a neutral face reference for calibration.");

      ui.showProgress(`Preparing ${featureModelLabel(config.featureModel)}…`);

      const calibration = await this.calibrate({
        config,
        beforeRound: async (round, pose) => {
          if (options.beforeRound) {
            await options.beforeRound(round, pose);
            ui.showCalibration(round, totalRuns, pose);
            return;
          }

          if ((config.headPoseCount ?? 1) > 1 && round > 0) {
            await ui.guidePose(
              round,
              totalRuns,
              pose,
              baselineFace,
              () => this.latestFace
            );
          } else {
            ui.showCalibration(round, totalRuns, pose);
          }
        },
        beforePursuit: async () => {
          if (options.beforePursuit) {
            await options.beforePursuit();
            ui.showProgress("Smooth-pursuit calibration · follow the target");
            return;
          }

          if ((config.headPoseCount ?? 1) > 1) {
            await ui.guidePose(
              Math.max(0, totalRuns - 1),
              totalRuns,
              "centre",
              baselineFace,
              () => this.latestFace
            );
          }
          await ui.promptPursuit();
        }
      });

      let validation: ValidationResult | null = null;
      if (options.validate !== false) {
        ui.showValidation();
        validation = await this.validate();
      }

      await ui.results(validation);
      return { RESULT: "CALIBRATION_OK", calibration, validation };
    } catch (error) {
      if (error instanceof OpenEyeTrackSetupCancelledError) {
        ui.hide();
        throw error;
      }
      await ui.error(error);
      throw error;
    }
  }

  async startSetup(options: OpenEyeTrackSetupOptions = {}): Promise<OpenEyeTrackSetupResult> {
    return this.runSetupProcedure(options);
  }

  private ensureSetupUi(): DefaultSetupUI {
    if (!this.setupUi) this.setupUi = new DefaultSetupUI(this.options.video, this.calibrationTarget);
    return this.setupUi;
  }

  startRecording(): void {
    this.core.startRecording();
    this.recording = true;
  }

  stopRecording(): EyeTrackingSample[] {
    this.lastRecording = this.core.stopRecording();
    this.recording = false;
    return [...this.lastRecording];
  }

  setRecordingState(recording: boolean): boolean {
    if (recording && !this.recording) this.startRecording();
    else if (!recording && this.recording) this.stopRecording();
    return this.recording;
  }

  isRecordingEnabled(): boolean { return this.recording; }

  checkRecording(): boolean { return this.recording; }

  getRecordingData(): EyeTrackingSample[] { return [...this.lastRecording]; }

  setTrial(trialId: string | null): void {
    this.currentTrial = trialId;
    this.core.setTrial(trialId);
  }

  sendMessage(message: string): void {
    const timestamp = performance.timeOrigin + performance.now();
    this.messages.push({ timestamp, message, trial: this.currentTrial });
    this.core.mark(message);
  }

  message(message: string): void { this.sendMessage(message); }

  mark(message: string | null): void {
    if (message === null) { this.core.mark(null); return; }
    this.sendMessage(message);
  }

  getMessages(): OpenEyeTrackMessage[] { return this.messages.map(m => ({ ...m })); }

  clearMessages(): void { this.messages = []; }

  getLastGazePosition(): [number, number] | null {
    const gaze = this.core.getLatestGaze();
    return gaze ? [gaze.x, gaze.y] : null;
  }

  getPosition(): [number, number] | null { return this.getLastGazePosition(); }

  getLastSample(): EyeTrackingSample | null { return this.core.getLastSample(); }

  newestFloatSample(): EyeTrackingSample | null { return this.getLastSample(); }

  getLatestFeatures(): EyeHeadFeatures | null { return this.latestFeatures ? { ...this.latestFeatures } : null; }

  getLatestFace(): NormalizedLandmark[] | null { return this.latestFace ? this.latestFace.map(p => ({ ...p })) : null; }

  getDetectedFaces(): number { return this.detectedFaces; }

  getSampleCount(): number { return this.core.getSampleCount(); }

  getAssetUrls(): ResolvedOpenEyeTrackAssets { return { ...this.assets }; }

  async drain(): Promise<void> { await this.elgTracker.drain(); }

  resetGazeFilter(): void { this.gazeFilter.reset(); }

  getFeatureModel(): CalibrationConfig["featureModel"] { return this.config.featureModel; }

  getAcquisitionMode(): string { return this.elgTracker.activeAcquisitionMode; }

  getObservedFps(): number | null { return this.core.getObservedFps(); }

  getFrameDiagnostics() { return this.core.getFrameDiagnostics(); }

  onGaze(listener: Parameters<OpenEyeTrack["onGaze"]>[0]): () => void { return this.core.onGaze(listener); }

  hasCalibration(): boolean { return this.core.hasCalibration(); }

  getValidationMetrics() { return this.core.getValidationMetrics(); }

  downloadCalibrationData(): void { this.sessionData.downloadCalibration(); }

  downloadValidationData(): void { this.sessionData.downloadValidation(); }

  downloadSessionMetadata(): void { this.sessionData.downloadMetadata(); }

  private async prepareFeatureModel(): Promise<void> {
    this.latestAppearance = null;
    this.latestElg = null;
    this.elgTracker.reset();
    if (this.config.featureModel === "elg") {
      await this.elgTracker.initialize();
      await this.waitForFace();
      if (!this.latestFace) throw new Error("No face landmarks are currently available.");
      this.latestElg = await this.elgTracker.estimate(this.options.video, this.latestFace, true);
      if (!this.latestElg) throw new Error("ELG loaded but did not produce initial eye landmarks.");
      await this.waitFor(() => this.latestFeatures?.elgSequenceId !== null, 2500);
    } else {
      await this.appearanceTracker.setModel(this.config.featureModel);
      if (this.config.featureModel !== "mediapipe") {
        await this.waitForFace();
        if (this.latestFace) this.latestAppearance = await this.appearanceTracker.estimate(this.options.video, this.latestFace, true);
      }
    }
  }

  private async waitForFace(): Promise<void> {
    await this.waitFor(() => this.latestFace !== null, 5000);
  }

  private async waitFor(test: () => boolean, timeoutMs: number): Promise<void> {
    const started = performance.now();
    while (!test()) {
      if (performance.now() - started > timeoutMs) throw new Error("Timed out waiting for eye-tracking features.");
      await new Promise<void>(resolve => setTimeout(resolve, 25));
    }
  }

  private schedulePipeline(): void {
    if (!this.connected) return;
    const videoTime = this.options.video.currentTime;
    if (videoTime !== this.lastProcessedVideoTime) {
      this.lastProcessedVideoTime = videoTime;
      this.processFrame();
    }
    this.animationId = requestAnimationFrame(() => this.schedulePipeline());
  }

  private processFrame(): void {
    const pipelineStarted = performance.now();
    const detectStarted = performance.now();
    const result = this.faceTracker.detect(this.options.video, detectStarted);
    const mediaPipeDetectMs = performance.now() - detectStarted;
    let elgEnqueueMs: number | null = null;
    let featureExtractionMs: number | null = null;
    let gazePredictionMs: number | null = null;

    let raw: GazePrediction | null = null;
    let filtered: GazePrediction | null = null;

    if (result) {
      this.detectedFaces = result.faceLandmarks.length;
      const face = result.faceLandmarks[0];
      if (face) {
        this.latestFace = face;
        if (this.config.featureModel === "elg") {
          const started = performance.now();
          void this.elgTracker.estimate(this.options.video, face).then(value => {
            if (value) this.latestElg = value;
          });
          elgEnqueueMs = performance.now() - started;
        } else {
          void this.appearanceTracker.estimate(this.options.video, face).then(value => {
            if (value) this.latestAppearance = value;
          });
        }

        const matrix = result.facialTransformationMatrixes?.[0]?.data;
        const featureStarted = performance.now();
        this.latestFeatures = extractEyeHeadFeatures(face, matrix ? Array.from(matrix) : undefined);
        featureExtractionMs = performance.now() - featureStarted;
        this.mergeModelFeatures();

        this.core.setFeatures(this.latestFeatures);
        const gazeStarted = performance.now();
        raw = this.latestFeatures ? this.calibration.model.predict(this.latestFeatures) : null;
        const filterResult = raw ? this.gazeFilter.filter(raw) : null;
        filtered = filterResult?.gaze ?? null;
        gazePredictionMs = performance.now() - gazeStarted;
        this.core.setGaze(raw, filtered, filterResult?.outlier ?? null, filterResult?.rawDeviationPx ?? null);
      } else this.clearFrame();
    }

    this.core.setPipelineDiagnostics({
      totalMs: performance.now() - pipelineStarted,
      mediaPipeDetectMs,
      elgEnqueueMs,
      featureExtractionMs,
      gazePredictionMs,
      overlayRenderMs: null,
      elgAcquisitionMode: this.elgTracker.activeAcquisitionMode
    });

    this.options.onFrame?.({
      timestamp: performance.timeOrigin + performance.now(),
      face: this.latestFace,
      features: this.latestFeatures,
      rawGaze: raw,
      gaze: filtered,
      detectedFaces: this.detectedFaces
    });
  }

  private mergeModelFeatures(): void {
    if (!this.latestFeatures) return;
    if (this.config.featureModel === "elg" && this.latestElg) {
      const e = this.latestElg;
      Object.assign(this.latestFeatures, {
        elgLeftRelX: e.leftRelX, elgLeftRelY: e.leftRelY,
        elgRightRelX: e.rightRelX, elgRightRelY: e.rightRelY,
        elgConfidence: (e.leftConfidence + e.rightConfidence) / 2,
        elgLeftConfidence: e.leftConfidence, elgRightConfidence: e.rightConfidence,
        elgInferenceMs: e.inferenceMs, elgTimestampMs: e.timestampMs,
        elgAgeMs: Math.max(0, performance.now() - e.acquisitionTimestampMs),
        elgSequenceId: e.sequenceId, elgAcquisitionTimestampMs: e.acquisitionTimestampMs,
        elgProcessedTimestampMs: e.processedTimestampMs, elgLatencyMs: e.latencyMs,
        elgQueueDepth: this.elgTracker.queueDepth,
        elgLeftRelXRaw: e.leftRelXRaw, elgLeftRelYRaw: e.leftRelYRaw,
        elgRightRelXRaw: e.rightRelXRaw, elgRightRelYRaw: e.rightRelYRaw,
        elgBinocularReliability: e.binocularReliability
      });
    } else if (this.config.featureModel !== "mediapipe" && this.latestAppearance) {
      this.latestFeatures.appearanceGazeYaw = this.latestAppearance.yaw;
      this.latestFeatures.appearanceGazePitch = this.latestAppearance.pitch;
    }
  }

  private clearFrame(): void {
    this.latestFace = null;
    this.latestFeatures = null;
    this.core.setFeatures(null);
    this.core.setGaze(null);
    this.gazeFilter.reset();
  }
}

function featureModelLabel(model: CalibrationConfig["featureModel"]): string {
  if (model === "elg") return "ELG eye-landmark model";
  if (model === "mediapipe") return "MediaPipe iris landmarks";
  if (model === "mobileone_s0") return "MobileGaze MobileOne S0";
  return "MobileGaze ResNet-34";
}

function cloneConfig(config: CalibrationConfig): CalibrationConfig {
  return {
    ...config,
    target: { ...config.target },
    model: { ...config.model },
    smoothPursuit: config.smoothPursuit ? { ...config.smoothPursuit } : undefined
  };
}
