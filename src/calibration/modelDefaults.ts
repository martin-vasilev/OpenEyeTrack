import type { GazeModelConfig } from "./GazeModels";

export const DEFAULT_GAZE_MODEL: GazeModelConfig = {
  type: "rbf",
  ridge: 0.05,
  rbfGamma: 0.15,
  knnK: 3
};
