import * as ort from "onnxruntime-web";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

export interface ElgEyeFeatures {
  leftRelX: number;
  leftRelY: number;
  rightRelX: number;
  rightRelY: number;
  leftConfidence: number;
  rightConfidence: number;
  inferenceMs: number;
  timestampMs: number;
}

const MODEL_URL = "/OpenEyeTrack/models/gazeml_elg_i60x36_n32.onnx";
const W = 60, H = 36;
const LEFT_EYE = { inner: 362, outer: 263 };
const RIGHT_EYE = { inner: 133, outer: 33 };

export class ElgEyeTracker {
  private session: ort.InferenceSession | null = null;
  private canvas = document.createElement("canvas");
  private busy = false;
  private lastRun = 0;
  private readonly minIntervalMs = 33;

  async initialize(): Promise<void> {
    if (this.session) return;
    const load = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    });
    const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("ELG model loading timed out after 30 seconds.")), 30000));
    this.session = await Promise.race([load, timeout]);
  }

  async estimate(video: HTMLVideoElement, landmarks: NormalizedLandmark[], force=false): Promise<ElgEyeFeatures | null> {
    if (!this.session || this.busy || video.videoWidth === 0 || landmarks.length < 478) return null;
    const now = performance.now();
    if (!force && now - this.lastRun < this.minIntervalMs) return null;
    this.lastRun = now;
    this.busy = true;
    const started = performance.now();
    try {
      const left = this.cropEye(video, landmarks, LEFT_EYE);
      const right = this.cropEye(video, landmarks, RIGHT_EYE);
      if (!left || !right) return null;
      const input = new Float32Array(2 * H * W);
      input.set(left, 0); input.set(right, H * W);
      const feeds: Record<string, ort.Tensor> = {};
      feeds[this.session.inputNames[0]] = new ort.Tensor("float32", input, [2, H, W, 1]);
      const outputs = await this.session.run(feeds);
      const tensor = outputs[this.session.outputNames[0]];
      const data = tensor.data as Float32Array;
      const dims = tensor.dims.map(Number);
      const l = decodeIris(data, dims, 0), r = decodeIris(data, dims, 1);
      if (!l || !r) return null;
      return {
        leftRelX:l.x, leftRelY:l.y, rightRelX:r.x, rightRelY:r.y,
        leftConfidence:l.confidence, rightConfidence:r.confidence,
        inferenceMs:performance.now()-started, timestampMs:performance.now()
      };
    } finally { this.busy = false; }
  }

  private cropEye(video: HTMLVideoElement, landmarks: NormalizedLandmark[], eye:{inner:number;outer:number}): Float32Array | null {
    const a=landmarks[eye.inner], b=landmarks[eye.outer];
    const cx=(a.x+b.x)/2*video.videoWidth, cy=(a.y+b.y)/2*video.videoHeight;
    const cornerDistance=Math.hypot((a.x-b.x)*video.videoWidth,(a.y-b.y)*video.videoHeight);
    const cropW=cornerDistance*1.8, cropH=cropW*H/W;
    if(cropW<12||cropH<7)return null;
    const sx=cx-cropW/2, sy=cy-cropH/2;
    this.canvas.width=W;this.canvas.height=H;
    const ctx=this.canvas.getContext("2d",{willReadFrequently:true});if(!ctx)return null;
    ctx.clearRect(0,0,W,H);ctx.drawImage(video,sx,sy,cropW,cropH,0,0,W,H);
    const rgba=ctx.getImageData(0,0,W,H).data, gray=new Uint8Array(W*H),hist=new Uint32Array(256);
    for(let i=0;i<gray.length;i++){const g=Math.round(.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2]);gray[i]=g;hist[g]++;}
    const cdf=new Uint32Array(256);let total=0,cdfMin=0;for(let i=0;i<256;i++){total+=hist[i];cdf[i]=total;if(!cdfMin&&hist[i])cdfMin=total;}
    const out=new Float32Array(W*H),den=Math.max(1,total-cdfMin);
    for(let i=0;i<gray.length;i++){const eq=Math.round((cdf[gray[i]]-cdfMin)*255/den);out[i]=eq/127.5-1;}
    return out;
  }
}

function decodeIris(data:Float32Array,dims:number[],batch:number):{x:number;y:number;confidence:number}|null{
  if(dims.length!==4||dims[0]<2)return null;
  const nhwc=dims[1]===H&&dims[2]===W;
  const channels=nhwc?dims[3]:dims[1];
  if(channels<16)return null;
  let sx=0,sy=0,sc=0,n=0;
  for(let c=8;c<16;c++){
    let best=-Infinity,bx=0,by=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const idx=nhwc?(((batch*H+y)*W+x)*channels+c):(((batch*channels+c)*H+y)*W+x);
      const v=data[idx];if(v>best){best=v;bx=x;by=y;}
    }
    if(Number.isFinite(best)){sx+=bx/(W-1);sy+=by/(H-1);sc+=best;n++;}
  }
  return n?{x:sx/n,y:sy/n,confidence:sc/n}:null;
}
