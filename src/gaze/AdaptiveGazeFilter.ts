import type { GazePrediction } from "../calibration/LinearGazeModel";

export class AdaptiveGazeFilter {
  private previous: GazePrediction | null = null;
  private previousTime: number | null = null;

  reset(): void { this.previous = null; this.previousTime = null; }

  filter(raw: GazePrediction, now = performance.now()): GazePrediction {
    if (!this.previous || this.previousTime === null) {
      this.previous = { ...raw }; this.previousTime = now; return { ...raw };
    }
    const dt = Math.max(1, now - this.previousTime);
    const distance = Math.hypot(raw.x - this.previous.x, raw.y - this.previous.y);
    const velocity = distance / dt; // px/ms
    // Strong smoothing during fixation-like stability; progressively less during fast movements.
    const alpha = Math.min(0.85, Math.max(0.18, 0.18 + velocity * 0.32));
    const filtered = {
      x: alpha * raw.x + (1 - alpha) * this.previous.x,
      y: alpha * raw.y + (1 - alpha) * this.previous.y
    };
    this.previous = filtered; this.previousTime = now;
    return filtered;
  }
}
