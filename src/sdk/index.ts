import { OpenEyeTrack } from "../core/OpenEyeTrack";
import {
  OPEN_EYE_TRACK_API_VERSION,
  type OpenEyeTrackAPI
} from "../core/PublicAPI";

export { OPEN_EYE_TRACK_API_VERSION } from "../core/PublicAPI";

export type {
  CameraConfig,
  EyeTrackingSample,
  OpenEyeTrackAPI,
  OpenEyeTrackApiVersion,
  OpenEyeTrackFrameDiagnostics,
  OpenEyeTrackGazeListener,
  OpenEyeTrackGazePoint,
  OpenEyeTrackValidationMetrics
} from "../core/PublicAPI";

/**
 * Create an experiment-facing OpenEyeTrack instance.
 * The returned object is typed as OpenEyeTrackAPI so integrations depend only
 * on the stable public contract.
 */
export function createOpenEyeTrack(video: HTMLVideoElement): OpenEyeTrackAPI {
  return new OpenEyeTrack(video);
}

export function isCompatibleOpenEyeTrackApi(version: string): boolean {
  return version === OPEN_EYE_TRACK_API_VERSION;
}

export {
  OpenEyeTrackRuntime,
  defaultCalibrationConfig
} from "./OpenEyeTrackRuntime";

export type {
  OpenEyeTrackMessage,
  OpenEyeTrackRuntimeFrame,
  OpenEyeTrackRuntimeOptions,
  OpenEyeTrackSetupOptions,
  OpenEyeTrackSetupResult
} from "./OpenEyeTrackRuntime";

export { resolveOpenEyeTrackAssets } from "../core/AssetPaths";
export type {
  OpenEyeTrackAssetConfig,
  ResolvedOpenEyeTrackAssets
} from "../core/AssetPaths";
