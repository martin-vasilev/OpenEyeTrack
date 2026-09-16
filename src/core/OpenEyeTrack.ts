import { Camera, type CameraConfig } from "../camera/Camera";
import { Recorder } from "../recording/Recorder";
import type { EyeTrackingSample } from "../types/Sample";
import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";

export class OpenEyeTrack {
  private readonly camera: Camera;
  private readonly recorder = new Recorder();
  private frameId = 0;
  private frameRequestId: number | null = null;
  private animationFrameId: number | null = null;
  private currentTrial: string | null = null;
  private currentEvent: string | null = null;
  private recentFrameTimes: number[] = [];
  private latestFeatures: EyeHeadFeatures | null = null;

  constructor(private readonly video: HTMLVideoElement) {
    this.camera = new Camera(video);
  }

  async start(config: CameraConfig = {}): Promise<MediaTrackSettings> {
    const settings = await this.camera.start(config);
    this.frameId = 0;
    this.recentFrameTimes = [];
    this.scheduleFrame();
    return settings;
  }

  stop(): void {
    if (this.frameRequestId !== null && "cancelVideoFrameCallback" in this.video) {
      this.video.cancelVideoFrameCallback(this.frameRequestId);
    }
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.frameRequestId = null;
    this.animationFrameId = null;
    this.camera.stop();
  }

  startRecording(): void { this.recorder.start(); }
  stopRecording(): EyeTrackingSample[] { return this.recorder.stop(); }
  setTrial(trial: string | null): void { this.currentTrial = trial; }
  mark(event: string | null): void { this.currentEvent = event; }
  getSampleCount(): number { return this.recorder.count; }
  setFeatures(features: EyeHeadFeatures | null): void { this.latestFeatures = features; }

  getObservedFps(): number | null {
    if (this.recentFrameTimes.length < 2) return null;
    const duration = this.recentFrameTimes[this.recentFrameTimes.length - 1] - this.recentFrameTimes[0];
    return duration > 0 ? ((this.recentFrameTimes.length - 1) * 1000) / duration : null;
  }

  private scheduleFrame(): void {
    if ("requestVideoFrameCallback" in this.video) {
      this.frameRequestId = this.video.requestVideoFrameCallback((_now, metadata) => {
        this.captureSample(metadata.mediaTime * 1000);
        this.scheduleFrame();
      });
    } else {
      this.animationFrameId = requestAnimationFrame(() => {
        if (!this.camera.isRunning()) return;
        this.captureSample(performance.now());
        this.scheduleFrame();
      });
    }
  }

  private captureSample(timestamp: number): void {
    this.recentFrameTimes.push(timestamp);
    if (this.recentFrameTimes.length > 120) this.recentFrameTimes.shift();

    this.recorder.add({
      timestamp,
      frameId: this.frameId++,
      gazeX: null,
      gazeY: null,
      gazeConfidence: null,
      pupilLeft: this.latestFeatures?.leftIrisDiameter ?? null,
      pupilRight: this.latestFeatures?.rightIrisDiameter ?? null,
      pupilLeftConfidence: null,
      pupilRightConfidence: null,
      headX: this.latestFeatures?.headX ?? null,
      headY: this.latestFeatures?.headY ?? null,
      headZ: this.latestFeatures?.headZ ?? null,
      headYaw: this.latestFeatures?.headYaw ?? null,
      headPitch: this.latestFeatures?.headPitch ?? null,
      headRoll: this.latestFeatures?.headRoll ?? null,
      faceConfidence: null,
      eyeConfidence: null,
      trial: this.currentTrial,
      event: this.currentEvent
    });

    this.currentEvent = null;
  }
}
