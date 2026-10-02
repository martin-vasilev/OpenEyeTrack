import type { CameraConfig } from "../camera/Camera";
import type { EyeTrackingSample } from "../types/Sample";

export const OPEN_EYE_TRACK_API_VERSION = "1" as const;
export type OpenEyeTrackApiVersion = typeof OPEN_EYE_TRACK_API_VERSION;

export interface OpenEyeTrackGazePoint {
  x: number;
  y: number;
  confidence?: number;
  support?: number;
  extrapolating?: boolean;
}

export interface OpenEyeTrackFrameDiagnostics {
  trackFps: number | null;
  mediaFps: number | null;
  callbackFps: number | null;
  presentedFps: number | null;
  missedFrames: number;
}

export interface OpenEyeTrackValidationMetrics {
  meanPx: number;
  medianPx: number;
  rmsePx: number;
  precisionRmsS2SPx: number;
  precisionSdPx: number;
  dataLoss: number;
  points: number;
}

export type OpenEyeTrackGazeListener = (gaze: OpenEyeTrackGazePoint | null) => void;

/**
 * Stable experiment-facing API. Platform adapters should depend on this
 * interface rather than internal feature extraction, calibration, model or
 * demo modules.
 */
export interface OpenEyeTrackAPI {
  readonly apiVersion: OpenEyeTrackApiVersion;

  start(config?: CameraConfig): Promise<MediaTrackSettings>;
  stop(): void;

  startRecording(): void;
  stopRecording(): EyeTrackingSample[];
  getSampleCount(): number;
  getLastSample(): EyeTrackingSample | null;

  setTrial(trialId: string | null): void;
  mark(event: string | null): void;

  getObservedFps(): number | null;
  getFrameDiagnostics(): OpenEyeTrackFrameDiagnostics;

  getLatestGaze(): OpenEyeTrackGazePoint | null;
  onGaze(listener: OpenEyeTrackGazeListener): () => void;

  hasCalibration(): boolean;
  getValidationMetrics(): OpenEyeTrackValidationMetrics | null;
}

export type { CameraConfig } from "../camera/Camera";
export type { EyeTrackingSample } from "../types/Sample";
