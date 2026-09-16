import type { EyeTrackingSample } from "../types/Sample";

export class Recorder {
  private samples: EyeTrackingSample[] = [];
  private recording = false;

  start(): void {
    this.samples = [];
    this.recording = true;
  }

  stop(): EyeTrackingSample[] {
    this.recording = false;
    return this.getSamples();
  }

  add(sample: EyeTrackingSample): void {
    if (this.recording) this.samples.push(sample);
  }

  getSamples(): EyeTrackingSample[] {
    return [...this.samples];
  }

  get count(): number {
    return this.samples.length;
  }
}
