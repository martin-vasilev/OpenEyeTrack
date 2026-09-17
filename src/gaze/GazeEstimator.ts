import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";
import type { CalibrationObservation, GazePrediction } from "../calibration/LinearGazeModel";

/** Common contract for participant-specific and future pretrained gaze estimators. */
export interface GazeEstimator {
  readonly name: string;
  readonly calibrated: boolean;
  fit(observations: CalibrationObservation[]): void | Promise<void>;
  predict(features: EyeHeadFeatures): GazePrediction | null;
}
