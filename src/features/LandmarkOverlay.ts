import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export class LandmarkOverlay {
  private readonly context: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create canvas context.");
    this.context = context;
  }

  resizeTo(video: HTMLVideoElement): void {
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 360;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  clear(): void {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(landmarks: NormalizedLandmark[]): void {
    this.clear();
    this.context.fillStyle = "rgba(0, 255, 170, 0.75)";

    for (const point of landmarks) {
      // Video preview is mirrored in CSS, so mirror x for the overlay too.
      const x = (1 - point.x) * this.canvas.width;
      const y = point.y * this.canvas.height;
      this.context.beginPath();
      this.context.arc(x, y, 1.4, 0, Math.PI * 2);
      this.context.fill();
    }
  }
}
