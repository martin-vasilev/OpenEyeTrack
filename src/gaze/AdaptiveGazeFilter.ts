import type { GazePrediction } from "../calibration/LinearGazeModel";

export interface FilteredGazeResult {
  gaze: GazePrediction;
  outlier: boolean;
  rawDeviationPx: number;
}

/**
 * Robust short-history gaze filter.
 *
 * Every raw prediction still comes directly from the fitted calibration model.
 * A 5-sample rolling median is used only to protect the displayed/filtered
 * signal from isolated catastrophic predictions. Large movements are accepted
 * when they persist for two consecutive samples, so genuine saccades are not
 * permanently suppressed.
 */
export class AdaptiveGazeFilter {
  private history: GazePrediction[] = [];
  private previous: GazePrediction | null = null;
  private pendingLarge: GazePrediction | null = null;

  reset(): void {
    this.history = [];
    this.previous = null;
    this.pendingLarge = null;
  }

  filter(raw: GazePrediction): FilteredGazeResult {
    if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) {
      return { gaze: this.previous ?? raw, outlier: true, rawDeviationPx: Infinity };
    }

    if (this.history.length < 3 || !this.previous) {
      this.accept(raw);
      return { gaze: { ...raw }, outlier: false, rawDeviationPx: 0 };
    }

    const center = {
      x: median(this.history.map(p => p.x)),
      y: median(this.history.map(p => p.y))
    };
    const deviations = this.history.map(p => Math.hypot(p.x - center.x, p.y - center.y));
    const typicalDeviation = Math.max(35, median(deviations) * 3);
    const deviation = Math.hypot(raw.x - center.x, raw.y - center.y);

    if (deviation > typicalDeviation) {
      // A real saccade should be followed by another estimate in the same new
      // neighbourhood. A one-frame excursion is treated as an artifact.
      if (this.pendingLarge) {
        const agreement = Math.hypot(raw.x - this.pendingLarge.x, raw.y - this.pendingLarge.y);
        const transitionTolerance = Math.max(90, typicalDeviation * 1.5);
        if (agreement <= transitionTolerance) {
          this.history = [];
          this.pendingLarge = null;
          this.accept(raw);
          return { gaze: { ...raw }, outlier: false, rawDeviationPx: deviation };
        }
      }
      this.pendingLarge = { ...raw };
      return { gaze: { ...this.previous }, outlier: true, rawDeviationPx: deviation };
    }

    this.pendingLarge = null;
    this.accept(raw);
    const robustX = median(this.history.map(p => p.x));
    const robustY = median(this.history.map(p => p.y));
    const alpha = 0.35;
    const gaze: GazePrediction = {
      ...raw,
      x: alpha * robustX + (1 - alpha) * this.previous.x,
      y: alpha * robustY + (1 - alpha) * this.previous.y
    };
    this.previous = gaze;
    return { gaze, outlier: false, rawDeviationPx: deviation };
  }

  private accept(raw: GazePrediction): void {
    this.history.push({ ...raw });
    if (this.history.length > 5) this.history.shift();
    this.previous = { ...raw };
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}
