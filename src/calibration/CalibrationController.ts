import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";
import { LinearGazeModel, type CalibrationObservation } from "./LinearGazeModel";

export type CalibrationPointCount = 5 | 9 | 13;

export interface CalibrationConfig {
  points: CalibrationPointCount;
  settleMs: number;
  sampleMs: number;
  repetitions: number;
  randomize: boolean;
}

export interface ValidationResult {
  meanPx: number;
  medianPx: number;
  rmsePx: number;
  points: number;
}

const POINT_SETS: Record<CalibrationPointCount, readonly (readonly [number, number])[]> = {
  5: [
    [0.5, 0.5],
    [0.12, 0.12], [0.88, 0.12],
    [0.12, 0.88], [0.88, 0.88]
  ],
  9: [
    [0.12, 0.12], [0.5, 0.12], [0.88, 0.12],
    [0.12, 0.5], [0.5, 0.5], [0.88, 0.5],
    [0.12, 0.88], [0.5, 0.88], [0.88, 0.88]
  ],
  13: [
    [0.12, 0.12], [0.5, 0.12], [0.88, 0.12],
    [0.12, 0.5], [0.5, 0.5], [0.88, 0.5],
    [0.12, 0.88], [0.5, 0.88], [0.88, 0.88],
    [0.31, 0.31], [0.69, 0.31], [0.31, 0.69], [0.69, 0.69]
  ]
};

export class CalibrationController {
  readonly model = new LinearGazeModel();
  private readonly observations: CalibrationObservation[] = [];
  private config: CalibrationConfig;

  constructor(private readonly target: HTMLElement, config: CalibrationConfig) {
    this.config = { ...config };
  }

  setConfig(config: CalibrationConfig): void {
    this.config = { ...config };
  }

  get pointCount(): number {
    return this.config.points;
  }

  async calibrate(getFeatures: () => EyeHeadFeatures | null): Promise<void> {
    this.observations.length = 0;
    const sequence = this.calibrationSequence();
    this.target.hidden = false;
    try {
      for (const [nx, ny] of sequence) {
        this.place(nx, ny);
        await wait(this.config.settleMs);
        const end = performance.now() + this.config.sampleMs;
        while (performance.now() < end) {
          const features = getFeatures();
          if (features) {
            this.observations.push({
              targetX: nx * innerWidth,
              targetY: ny * innerHeight,
              features: { ...features }
            });
          }
          await wait(33);
        }
      }
    } finally {
      this.target.hidden = true;
    }
    this.model.fit(this.observations);
  }

  async validate(getFeatures: () => EyeHeadFeatures | null): Promise<ValidationResult> {
    const errors: number[] = [];
    const points = POINT_SETS[this.config.points];
    this.target.hidden = false;
    try {
      for (const [nx, ny] of points) {
        this.place(nx, ny);
        await wait(this.config.settleMs);
        const targetX = nx * innerWidth;
        const targetY = ny * innerHeight;
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
    } finally {
      this.target.hidden = true;
    }
    if (!errors.length) throw new Error("No valid gaze samples were collected during validation.");
    return {
      meanPx: errors.reduce((a, b) => a + b, 0) / errors.length,
      medianPx: median(errors),
      rmsePx: Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length),
      points: errors.length
    };
  }

  private calibrationSequence(): (readonly [number, number])[] {
    const sequence: (readonly [number, number])[] = [];
    for (let repetition = 0; repetition < this.config.repetitions; repetition++) {
      const points = [...POINT_SETS[this.config.points]];
      if (this.config.randomize) shuffle(points);
      sequence.push(...points);
    }
    return sequence;
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
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function shuffle<T>(values: T[]): void {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
}
