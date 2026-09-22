import * as ort from "onnxruntime-web";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// ELG currently uses the standard ONNX Runtime Web WASM build. Keep its
// auxiliary modules version-matched and same-origin.
ort.env.wasm.wasmPaths = "/OpenEyeTrack/ort/";

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
  private history: ElgEyeFeatures[] = [];
  private backend: "webgpu" | "wasm" = "wasm";

  get activeBackend(): "webgpu" | "wasm" { return this.backend; }

  reset(): void { this.history = []; }

  private stabilize(v: ElgEyeFeatures): ElgEyeFeatures {
    this.history.push(v); if(this.history.length>5)this.history.shift();
    const recent=this.history.slice(-3), med=(key:keyof ElgEyeFeatures)=>{const a=recent.map(x=>x[key] as number).sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
    return {...v,leftRelX:med("leftRelX"),leftRelY:med("leftRelY"),rightRelX:med("rightRelX"),rightRelY:med("rightRelY")};
  }

  async initialize(): Promise<void> {
    if (this.session) return;
    const timeout = <T>(p:Promise<T>) => Promise.race([p,new Promise<never>((_,reject)=>window.setTimeout(()=>reject(new Error("ELG model loading timed out after 30 seconds.")),30000))]);
    // Use the standard WASM build, not the WebGPU bundle with a WASM provider.
    // Disable graph rewrites for this legacy converted TensorFlow graph. ORT's
    // optimization pass can infer incompatible dimensions in the ELG graph
    // before inference begins; the model previously ran without these rewrites.
    this.session=await timeout(ort.InferenceSession.create(MODEL_URL,{executionProviders:["wasm"],graphOptimizationLevel:"disabled"}));
    this.backend="wasm"; console.info("[OpenEyeTrack ELG] Using WASM backend (WebGPU disabled for incompatible ELG graph)");
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
      const candidates = this.session.outputNames
        .map(name => ({ name, tensor: outputs[name] }))
        .filter((v): v is {name:string;tensor:ort.Tensor} => Boolean(v.tensor));
      console.info("[OpenEyeTrack ELG] ONNX outputs", candidates.map(({name,tensor}) => ({name,dims:tensor.dims.map(Number),type:tensor.type})));
      let decoded: {l:{x:number;y:number;confidence:number};r:{x:number;y:number;confidence:number}} | null = null;
      for (const {tensor} of candidates) {
        if (!(tensor.data instanceof Float32Array)) continue;
        const dims=tensor.dims.map(Number);
        const l=decodeIris(tensor.data,dims,0), r=decodeIris(tensor.data,dims,1);
        if(l&&r){decoded={l,r};break;}
      }
      if(!decoded)throw new Error(`ELG model ran, but no output matched an 18-channel 60×36 heatmap. Outputs: ${candidates.map(({name,tensor})=>`${name} [${tensor.dims.join("×")}]`).join(", ")}`);
      const {l,r}=decoded;
      return this.stabilize({
        leftRelX:l.x, leftRelY:l.y, rightRelX:r.x, rightRelY:r.y,
        leftConfidence:l.confidence, rightConfidence:r.confidence,
        inferenceMs:performance.now()-started, timestampMs:performance.now()
      });
    } finally { this.busy = false; }
  }

  private cropEye(video: HTMLVideoElement, landmarks: NormalizedLandmark[], eye:{inner:number;outer:number}): Float32Array | null {
    const a=landmarks[eye.inner], b=landmarks[eye.outer];
    const ax=a.x*video.videoWidth, ay=a.y*video.videoHeight, bx=b.x*video.videoWidth, by=b.y*video.videoHeight;
    const cx=(ax+bx)/2, cy=(ay+by)/2;
    const cornerDistance=Math.hypot(ax-bx,ay-by);
    if(cornerDistance<12)return null;
    // Normalize roll and scale before the fixed 60x36 ELG input. The eye corners
    // are mapped to a consistent horizontal axis, so head roll/crop jitter does
    // not masquerade as iris motion.
    const angle=Math.atan2(by-ay,bx-ax);
    const cropW=cornerDistance*1.8, cropH=cropW*H/W;
    this.canvas.width=W;this.canvas.height=H;
    const ctx=this.canvas.getContext("2d",{willReadFrequently:true});if(!ctx)return null;
    ctx.save();ctx.clearRect(0,0,W,H);
    ctx.translate(W/2,H/2);
    ctx.scale(W/cropW,H/cropH);
    ctx.rotate(-angle);
    ctx.translate(-cx,-cy);
    ctx.drawImage(video,0,0);
    ctx.restore();
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
  const nchw=dims[2]===H&&dims[3]===W;
  if(!nhwc&&!nchw)return null;
  const channels=nhwc?dims[3]:dims[1];
  if(channels<16)return null;
  const at=(c:number,x:number,y:number)=>data[nhwc?(((batch*H+y)*W+x)*channels+c):(((batch*channels+c)*H+y)*W+x)];
  let sx=0,sy=0,sc=0,n=0;
  for(let c=8;c<16;c++){
    let best=-Infinity,bx=0,by=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=at(c,x,y);if(v>best){best=v;bx=x;by=y;}}
    if(!Number.isFinite(best))continue;
    // Sub-pixel centroid around the local heatmap maximum. Subtract the local
    // floor so broad background activation does not pull the estimate.
    let wx=0,wy=0,ws=0;
    const radius=2, floor=Math.max(0,best*0.35);
    for(let y=Math.max(0,by-radius);y<=Math.min(H-1,by+radius);y++)for(let x=Math.max(0,bx-radius);x<=Math.min(W-1,bx+radius);x++){
      const w=Math.max(0,at(c,x,y)-floor);wx+=x*w;wy+=y*w;ws+=w;
    }
    const px=ws>1e-8?wx/ws:bx,py=ws>1e-8?wy/ws:by;
    sx+=px/(W-1);sy+=py/(H-1);sc+=best;n++;
  }
  return n?{x:sx/n,y:sy/n,confidence:sc/n}:null;
}
