import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";
import { LinearGazeModel, type CalibrationObservation } from "./LinearGazeModel";

export interface CalibrationConfig {
  settleMs: number;
  sampleMs: number;
}

export interface ValidationResult {
  meanPx: number;
  medianPx: number;
  rmsePx: number;
  points: number;
}

const DEFAULT_POINTS = [
  [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
  [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
  [0.1, 0.9], [0.5, 0.9], [0.9, 0.9]
] as const;

export class CalibrationController {
  readonly model = new LinearGazeModel();
  private readonly observations: CalibrationObservation[] = [];

  constructor(private readonly target: HTMLElement, private readonly config: CalibrationConfig) {}

  async calibrate(getFeatures: () => EyeHeadFeatures | null): Promise<void> {
    this.observations.length = 0;
    this.target.hidden = false;
    for (const [nx, ny] of DEFAULT_POINTS) {
      this.place(nx, ny);
      await wait(this.config.settleMs);
      const end = performance.now() + this.config.sampleMs;
      while (performance.now() < end) {
        const features = getFeatures();
        if (features) this.observations.push({ targetX: nx * innerWidth, targetY: ny * innerHeight, features: { ...features } });
        await wait(33);
      }
    }
    this.target.hidden = true;
    this.model.fit(this.observations);
  }

  async validate(getFeatures: () => EyeHeadFeatures | null): Promise<ValidationResult> {
    const errors: number[] = [];
    this.target.hidden = false;
    for (const [nx, ny] of DEFAULT_POINTS) {
      this.place(nx, ny);
      await wait(this.config.settleMs);
      const targetX = nx * innerWidth, targetY = ny * innerHeight;
      const end = performance.now() + this.config.sampleMs;
      const predictions: { x: number; y: number }[] = [];
      while (performance.now() < end) {
        const features = getFeatures();
        const prediction = features ? this.model.predict(features) : null;
        if (prediction) predictions.push(prediction);
        await wait(33);
      }
      if (predictions.length) {
        const x = median(predictions.map((p) => p.x));
        const y = median(predictions.map((p) => p.y));
        errors.push(Math.hypot(x - targetX, y - targetY));
      }
    }
    this.target.hidden = true;
    const sorted = [...errors].sort((a, b) => a - b);
    return {
      meanPx: errors.reduce((a, b) => a + b, 0) / errors.length,
      medianPx: median(sorted),
      rmsePx: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length),
      points: errors.length
    };
  }

  private place(nx: number, ny: number): void {
    this.target.style.left = `${nx * 100}%`;
    this.target.style.top = `${ny * 100}%`;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function median(values: number[]): number {
  if (!values.length) return Number.NaN;
  const x = [...values].sort((a, b) => a - b);
  const mid = Math.floor(x.length / 2);
  return x.length % 2 ? x[mid] : (x[mid - 1] + x[mid]) / 2;
}
