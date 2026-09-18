import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";

export interface CalibrationObservation { targetX: number; targetY: number; features: EyeHeadFeatures; }
export interface GazePrediction { x: number; y: number; confidence?: number; support?: number; extrapolating?: boolean; }

const FEATURE_COUNT = 12;
const RIDGE = 1e-4;

function vector(f: EyeHeadFeatures): number[] {
  const relX = (f.leftRelX + f.rightRelX) / 2;
  const relY = (f.leftRelY + f.rightRelY) / 2;
  return [1, relX, relY, f.leftRelX - f.rightRelX, f.leftRelY - f.rightRelY,
    f.headX, f.headY, f.headZ, f.headYaw ?? 0, f.headPitch ?? 0, f.headRoll ?? 0, relX * relY];
}

function solve(matrix: number[][], values: number[]): number[] {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, values[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    if (Math.abs(divisor) < 1e-12) throw new Error("Calibration model is singular.");
    for (let j = col; j <= n; j++) a[col][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

function fitAxis(observations: CalibrationObservation[], axis: "targetX" | "targetY"): number[] {
  const xtx = Array.from({ length: FEATURE_COUNT }, () => Array(FEATURE_COUNT).fill(0));
  const xty = Array(FEATURE_COUNT).fill(0);
  for (const observation of observations) {
    const x = vector(observation.features), y = observation[axis];
    for (let i = 0; i < FEATURE_COUNT; i++) {
      xty[i] += x[i] * y;
      for (let j = 0; j < FEATURE_COUNT; j++) xtx[i][j] += x[i] * x[j];
    }
  }
  for (let i = 1; i < FEATURE_COUNT; i++) xtx[i][i] += RIDGE;
  return solve(xtx, xty);
}

export class LinearGazeModel {
  private betaX: number[] | null = null; private betaY: number[] | null = null;
  fit(observations: CalibrationObservation[]): void {
    if (observations.length < FEATURE_COUNT) throw new Error(`Need at least ${FEATURE_COUNT} calibration observations.`);
    this.betaX = fitAxis(observations, "targetX"); this.betaY = fitAxis(observations, "targetY");
  }
  predict(features: EyeHeadFeatures): GazePrediction | null {
    if (!this.betaX || !this.betaY) return null;
    const x = vector(features), dot = (beta: number[]) => beta.reduce((sum, b, i) => sum + b * x[i], 0);
    return { x: dot(this.betaX), y: dot(this.betaY), confidence: 1, support: 1, extrapolating: false };
  }
  get calibrated(): boolean { return this.betaX !== null && this.betaY !== null; }
}
