import * as ort from "onnxruntime-web";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// GitHub Pages serves the app from /OpenEyeTrack/. Point ORT at an absolute
// runtime location so it does not try to fetch its WASM files from the site root.
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

export type EyeFeatureModel = "mediapipe" | "mobileone_s0" | "resnet34";

export interface AppearanceGazeFeatures {
  yaw: number;
  pitch: number;
  model: EyeFeatureModel;
}

const MODEL_URLS: Record<Exclude<EyeFeatureModel, "mediapipe">, string> = {
  mobileone_s0: `${import.meta.env.BASE_URL}models/mobileone_s0_gaze.onnx`,
  resnet34: `${import.meta.env.BASE_URL}models/resnet34_gaze.onnx`
};

export class AppearanceGazeTracker {
  private session: ort.InferenceSession | null = null;
  private model: EyeFeatureModel = "mediapipe";
  private canvas = document.createElement("canvas");
  private busy = false;
  private lastRun = 0;
  private readonly minIntervalMs = 80;

  get activeModel(): EyeFeatureModel { return this.model; }

  async setModel(model: EyeFeatureModel): Promise<void> {
    if (model === this.model && (model === "mediapipe" || this.session)) return;
    this.model = model;
    this.session = null;
    if (model === "mediapipe") return;
    const load = ort.InferenceSession.create(MODEL_URLS[model], {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    });
    this.session = await withTimeout(load, 30000, `Timed out loading ${model}.`);
  }

  async estimate(video: HTMLVideoElement, landmarks: NormalizedLandmark[], force=false): Promise<AppearanceGazeFeatures | null> {
    if (this.model === "mediapipe" || !this.session || this.busy || video.videoWidth === 0) return null;
    const now = performance.now();
    if (!force && now - this.lastRun < this.minIntervalMs) return null;
    this.lastRun = now; this.busy = true;
    try {
      const input = this.preprocess(video, landmarks);
      if (!input) return null;
      const feeds: Record<string, ort.Tensor> = {};
      feeds[this.session.inputNames[0]] = new ort.Tensor("float32", input, [1,3,448,448]);
      const outputs = await this.session.run(feeds);
      const yawLogits = outputs[this.session.outputNames[0]].data as Float32Array;
      const pitchLogits = outputs[this.session.outputNames[1]].data as Float32Array;
      return { yaw: decodeAngle(yawLogits), pitch: decodeAngle(pitchLogits), model: this.model };
    } finally { this.busy = false; }
  }

  private preprocess(video: HTMLVideoElement, landmarks: NormalizedLandmark[]): Float32Array | null {
    if (!landmarks.length) return null;
    const xs=landmarks.map(p=>p.x), ys=landmarks.map(p=>p.y);
    const minX=Math.max(0,Math.min(...xs)), maxX=Math.min(1,Math.max(...xs));
    const minY=Math.max(0,Math.min(...ys)), maxY=Math.min(1,Math.max(...ys));
    const w=maxX-minX,h=maxY-minY,padX=w*.12,padY=h*.12;
    const sx=Math.max(0,(minX-padX)*video.videoWidth), sy=Math.max(0,(minY-padY)*video.videoHeight);
    const ex=Math.min(video.videoWidth,(maxX+padX)*video.videoWidth), ey=Math.min(video.videoHeight,(maxY+padY)*video.videoHeight);
    if(ex-sx<20||ey-sy<20)return null;
    this.canvas.width=448;this.canvas.height=448;
    const ctx=this.canvas.getContext("2d",{willReadFrequently:true});if(!ctx)return null;
    ctx.drawImage(video,sx,sy,ex-sx,ey-sy,0,0,448,448);
    const rgba=ctx.getImageData(0,0,448,448).data,out=new Float32Array(3*448*448);
    const mean=[.485,.456,.406],sd=[.229,.224,.225],plane=448*448;
    for(let i=0;i<plane;i++){out[i]=(rgba[i*4]/255-mean[0])/sd[0];out[plane+i]=(rgba[i*4+1]/255-mean[1])/sd[1];out[2*plane+i]=(rgba[i*4+2]/255-mean[2])/sd[2];}
    return out;
  }
}
function decodeAngle(logits: Float32Array): number {
  let max=-Infinity;for(const v of logits)if(v>max)max=v;
  let sum=0,weighted=0;for(let i=0;i<logits.length;i++){const p=Math.exp(logits[i]-max);sum+=p;weighted+=p*i;}
  const degrees=(weighted/sum)*4-180;return degrees*Math.PI/180;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise,new Promise<T>((_,reject)=>window.setTimeout(()=>reject(new Error(message)),ms))]);
}
