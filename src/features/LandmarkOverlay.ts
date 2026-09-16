import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { EyeHeadFeatures } from "./EyeHeadFeatures";

export class LandmarkOverlay {
  private readonly context: CanvasRenderingContext2D;
  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create canvas context.");
    this.context = context;
  }
  resizeTo(video: HTMLVideoElement): void {
    const width = video.videoWidth || 640, height = video.videoHeight || 360;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }
  clear(): void { this.context.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  draw(landmarks: NormalizedLandmark[], features: EyeHeadFeatures | null = null, showValues = false): void {
    this.clear();
    this.context.fillStyle = "rgba(0, 255, 170, 0.75)";
    for (const point of landmarks) {
      const x = (1 - point.x) * this.canvas.width, y = point.y * this.canvas.height;
      this.context.beginPath(); this.context.arc(x, y, 1.4, 0, Math.PI * 2); this.context.fill();
    }
    if (showValues && features) this.drawDiagnostics(features);
  }
  private drawDiagnostics(f: EyeHeadFeatures): void {
    const lines = [
      `Iris L: ${f.leftIrisX.toFixed(3)}, ${f.leftIrisY.toFixed(3)}`,
      `Iris R: ${f.rightIrisX.toFixed(3)}, ${f.rightIrisY.toFixed(3)}`,
      `Iris size L/R: ${f.leftIrisDiameter.toFixed(4)} / ${f.rightIrisDiameter.toFixed(4)}`,
      `Head XYZ: ${f.headX.toFixed(3)} / ${f.headY.toFixed(3)} / ${f.headZ.toFixed(3)}`,
      `Yaw/Pitch/Roll: ${f.headYaw?.toFixed(1) ?? "—"} / ${f.headPitch?.toFixed(1) ?? "—"} / ${f.headRoll?.toFixed(1) ?? "—"}°`
    ];
    const x=14,y=14,lineHeight=20,width=320,height=lines.length*lineHeight+18;
    this.context.fillStyle="rgba(0,0,0,.68)"; this.context.fillRect(x,y,width,height);
    this.context.font="14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    this.context.textBaseline="top"; this.context.fillStyle="white";
    lines.forEach((line,i)=>this.context.fillText(line,x+10,y+9+i*lineHeight));
  }
}
