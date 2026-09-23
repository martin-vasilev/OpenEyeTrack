import * as ort from "onnxruntime-web";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// ELG currently uses the standard ONNX Runtime Web WASM build. Keep its
// auxiliary modules version-matched and same-origin.
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

export interface ElgEyeFeatures {
  sequenceId: number;
  acquisitionTimestampMs: number;
  processedTimestampMs: number;
  latencyMs: number;
  leftRelX: number;
  leftRelY: number;
  rightRelX: number;
  rightRelY: number;
  leftRelXRaw: number;
  leftRelYRaw: number;
  rightRelXRaw: number;
  rightRelYRaw: number;
  binocularReliability: number;
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
  private ctx: CanvasRenderingContext2D | null;
  private lastRun = 0;
  private readonly minIntervalMs = 33;
  private history: ElgEyeFeatures[] = [];
  private filtered: {leftRelX:number;leftRelY:number;rightRelX:number;rightRelY:number}|null = null;
  private nextSequenceId = 1;
  private queue: Array<{sequenceId:number;acquisitionTimestampMs:number;input:Float32Array;resolve:(v:ElgEyeFeatures|null)=>void;reject:(e:unknown)=>void}> = [];
  private processing = false;
  private drainWaiters: Array<()=>void> = [];
  private backend: "webgpu" | "wasm" = "wasm";
  private benchmarkSession: ort.InferenceSession | null = null;
  private benchmarkInitAttempted = false;
  private benchmarkRuns = 0;
  private benchmarkFailures = 0;
  private benchmarkWasmMs: number[] = [];
  private benchmarkWebgpuMs: number[] = [];
  private benchmarkMaxAbsDiff: number[] = [];
  private acquisitionMode: "queued" | "skip-while-busy" = "queued";

  constructor() {
    // Allocate the 60×36 crop surface once. Resizing a canvas clears it and may
    // reallocate its backing store; doing that twice per gaze sample was pure
    // overhead. clearRect() below still guarantees identical clean eye crops.
    this.canvas.width=W; this.canvas.height=H;
    this.ctx=this.canvas.getContext("2d",{willReadFrequently:true});
  }

  get activeBackend(): "webgpu" | "wasm" { return this.backend; }
  get activeAcquisitionMode(): "queued" | "skip-while-busy" { return this.acquisitionMode; }
  get webgpuActive(): boolean { return this.benchmarkSession !== null; }
  get webgpuBenchmarkSummary(): string {
    const median=(x:number[])=>{if(!x.length)return null;const s=[...x].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
    const gpu=median(this.benchmarkWebgpuMs),diff=median(this.benchmarkMaxAbsDiff);
    if(!this.benchmarkInitAttempted)return "WebGPU benchmark: waiting";
    if(!this.benchmarkSession)return `WebGPU benchmark: unavailable (${this.benchmarkFailures} failure${this.benchmarkFailures===1?"":"s"})`;
    return `WebGPU benchmark: ${this.benchmarkRuns} runs · median ${gpu?.toFixed(1)??"?"} ms · median max |Δ| ${diff?.toExponential(2)??"?"}`;
  }
  setAcquisitionMode(mode:"queued"|"skip-while-busy"):void { this.acquisitionMode=mode; }

  reset(): void { this.history = []; this.filtered = null; }

  get queueDepth(): number { return this.queue.length + (this.processing ? 1 : 0); }

  async drain(): Promise<void> {
    if (!this.processing && this.queue.length === 0) return;
    await new Promise<void>(resolve => this.drainWaiters.push(resolve));
  }

  private stabilize(v: ElgEyeFeatures): ElgEyeFeatures {
    const raw={leftRelX:v.leftRelX,leftRelY:v.leftRelY,rightRelX:v.rightRelX,rightRelY:v.rightRelY};
    this.history.push(v); if(this.history.length>5)this.history.shift();
    if(!this.filtered){this.filtered={...raw};return {...v,...raw,leftRelXRaw:raw.leftRelX,leftRelYRaw:raw.leftRelY,rightRelXRaw:raw.rightRelX,rightRelYRaw:raw.rightRelY,binocularReliability:1};}
    const prev=this.filtered;
    const dl={x:raw.leftRelX-prev.leftRelX,y:raw.leftRelY-prev.leftRelY};
    const dr={x:raw.rightRelX-prev.rightRelX,y:raw.rightRelY-prev.rightRelY};
    const magL=Math.hypot(dl.x,dl.y),magR=Math.hypot(dr.x,dr.y);
    const dot=dl.x*dr.x+dl.y*dr.y, direction=(magL>1e-5&&magR>1e-5)?Math.max(0,dot/(magL*magR)):1;
    const magnitudeAgreement=1-Math.min(1,Math.abs(magL-magR)/Math.max(.015,Math.max(magL,magR)));
    const confidence=Math.max(0,Math.min(1,(v.leftConfidence+v.rightConfidence)/2));
    const binocularReliability=Math.max(0,Math.min(1,.45*direction+.35*magnitudeAgreement+.20*confidence));
    const jointMovement=(magL+magR)/2;
    // Fixation-scale changes get strong smoothing. Large, binocularly coherent
    // changes get a high gain so genuine saccades are not smeared in time.
    const movementGain=jointMovement<.012?.16:jointMovement<.03?.28:jointMovement<.065?.52:.82;
    const alpha=Math.max(.08,Math.min(.90,movementGain*(.35+.65*binocularReliability)));
    // If one eye jumps much farther than the other, reduce only that eye's gain.
    const imbalance=Math.max(.02,Math.max(magL,magR));
    const leftPenalty=magL>magR*1.8?Math.max(.2,1-(magL-magR)/imbalance):1;
    const rightPenalty=magR>magL*1.8?Math.max(.2,1-(magR-magL)/imbalance):1;
    const al=Math.max(.06,alpha*leftPenalty),ar=Math.max(.06,alpha*rightPenalty);
    this.filtered={leftRelX:prev.leftRelX+al*dl.x,leftRelY:prev.leftRelY+al*dl.y,rightRelX:prev.rightRelX+ar*dr.x,rightRelY:prev.rightRelY+ar*dr.y};
    return {...v,...this.filtered,leftRelXRaw:raw.leftRelX,leftRelYRaw:raw.leftRelY,rightRelXRaw:raw.rightRelX,rightRelYRaw:raw.rightRelY,binocularReliability};
  }

  async initialize(): Promise<void> {
    if (this.session) return;
    const timeout = <T>(p:Promise<T>) => Promise.race([p,new Promise<never>((_,reject)=>window.setTimeout(()=>reject(new Error("ELG model loading timed out after 30 seconds.")),30000))]);
    // Use the standard WASM build, not the WebGPU bundle with a WASM provider.
    // Disable graph rewrites for this legacy converted TensorFlow graph. ORT's
    // optimization pass can infer incompatible dimensions in the ELG graph
    // before inference begins; the model previously ran without these rewrites.
    this.session=await timeout(ort.InferenceSession.create(MODEL_URL,{executionProviders:["wasm"],graphOptimizationLevel:"all"}));
    this.backend="wasm"; console.info("[OpenEyeTrack ELG] Using restored known-working WASM configuration");
    // Experimental shadow benchmark only. Production gaze remains WASM.
    this.benchmarkInitAttempted=true;
    try{
      this.benchmarkSession=await timeout(ort.InferenceSession.create(MODEL_URL,{executionProviders:["webgpu"],graphOptimizationLevel:"disabled"}));
      console.info("[OpenEyeTrack ELG benchmark] WebGPU shadow session ready");
    }catch(e){this.benchmarkFailures++;this.benchmarkSession=null;console.warn("[OpenEyeTrack ELG benchmark] WebGPU unavailable; WASM remains authoritative",e);}
  }

  estimate(video: HTMLVideoElement, landmarks: NormalizedLandmark[], force=false): Promise<ElgEyeFeatures | null> {
    if (!this.session || video.videoWidth === 0 || landmarks.length < 478) return Promise.resolve(null);
    // A/B diagnostic: reproduce the pre-#61 behavior by refusing to crop a new
    // eye image while ONNX inference is already active. The queued mode is the
    // current #61+ architecture.
    if (this.acquisitionMode==="skip-while-busy" && this.processing) return Promise.resolve(null);
    const now = performance.now();
    if (!force && now - this.lastRun < this.minIntervalMs) return Promise.resolve(null);
    this.lastRun = now;
    // Capture the tiny normalized eye inputs immediately while this video frame
    // and its MediaPipe landmarks are current. ONNX inference can then lag
    // behind without changing which image the gaze estimate belongs to.
    const left = this.cropEye(video, landmarks, LEFT_EYE);
    const right = this.cropEye(video, landmarks, RIGHT_EYE);
    if (!left || !right) return Promise.resolve(null);
    const input = new Float32Array(2 * H * W);
    input.set(left, 0); input.set(right, H * W);
    const sequenceId=this.nextSequenceId++, acquisitionTimestampMs=now;
    return new Promise<ElgEyeFeatures|null>((resolve,reject)=>{
      this.queue.push({sequenceId,acquisitionTimestampMs,input,resolve,reject});
      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || !this.session) return;
    this.processing=true;
    try {
      while(this.queue.length){
        const job=this.queue.shift()!;
        const started=performance.now();
        try{
          const feeds:Record<string,ort.Tensor>={};
          feeds[this.session.inputNames[0]]=new ort.Tensor("float32",job.input,[2,H,W,1]);
          const outputs=await this.session.run(feeds);
          const wasmFinished=performance.now();
          this.benchmarkWasmMs.push(wasmFinished-started);if(this.benchmarkWasmMs.length>120)this.benchmarkWasmMs.shift();
          // Run WebGPU only as a low-frequency shadow benchmark so it cannot change
          // calibration, filtering, recording, or the authoritative WASM result.
          if(this.benchmarkSession && this.benchmarkRuns<30 && this.benchmarkRuns%1===0){
            try{
              const gpuFeeds:Record<string,ort.Tensor>={};gpuFeeds[this.benchmarkSession.inputNames[0]]=new ort.Tensor("float32",job.input,[2,H,W,1]);
              const gpuStarted=performance.now(),gpuOutputs=await this.benchmarkSession.run(gpuFeeds),gpuFinished=performance.now();
              const wasmName=this.session.outputNames[0],gpuName=this.benchmarkSession.outputNames[0];
              const wd=outputs[wasmName]?.data,gd=gpuOutputs[gpuName]?.data;
              let maxDiff=NaN;if(wd instanceof Float32Array&&gd instanceof Float32Array&&wd.length===gd.length){maxDiff=0;for(let i=0;i<wd.length;i++)maxDiff=Math.max(maxDiff,Math.abs(wd[i]-gd[i]));}
              this.benchmarkWebgpuMs.push(gpuFinished-gpuStarted);this.benchmarkMaxAbsDiff.push(maxDiff);this.benchmarkRuns++;
              console.info("[OpenEyeTrack ELG benchmark]",{run:this.benchmarkRuns,wasmMs:wasmFinished-started,webgpuMs:gpuFinished-gpuStarted,maxAbsDiff:maxDiff});
            }catch(e){this.benchmarkFailures++;this.benchmarkSession=null;console.warn("[OpenEyeTrack ELG benchmark] WebGPU shadow run failed; disabling benchmark",e);}
          }
          const candidates=this.session.outputNames.map(name=>({name,tensor:outputs[name]})).filter((v):v is {name:string;tensor:ort.Tensor}=>Boolean(v.tensor));
          let decoded:{l:{x:number;y:number;confidence:number};r:{x:number;y:number;confidence:number}}|null=null;
          for(const {tensor} of candidates){if(!(tensor.data instanceof Float32Array))continue;const dims=tensor.dims.map(Number);const l=decodeIris(tensor.data,dims,0),r=decodeIris(tensor.data,dims,1);if(l&&r){decoded={l,r};break;}}
          if(!decoded)throw new Error(`ELG model ran, but no output matched an 18-channel 60×36 heatmap. Outputs: ${candidates.map(({name,tensor})=>`${name} [${tensor.dims.join("×")}]`).join(", ")}`);
          const processedTimestampMs=performance.now(),{l,r}=decoded;
          job.resolve(this.stabilize({sequenceId:job.sequenceId,acquisitionTimestampMs:job.acquisitionTimestampMs,processedTimestampMs,latencyMs:processedTimestampMs-job.acquisitionTimestampMs,leftRelX:l.x,leftRelY:l.y,rightRelX:r.x,rightRelY:r.y,leftRelXRaw:l.x,leftRelYRaw:l.y,rightRelXRaw:r.x,rightRelYRaw:r.y,binocularReliability:1,leftConfidence:l.confidence,rightConfidence:r.confidence,inferenceMs:processedTimestampMs-started,timestampMs:job.acquisitionTimestampMs}));
        }catch(e){job.reject(e);}
      }
    }finally{
      this.processing=false;
      if(this.queue.length===0){const waiters=this.drainWaiters.splice(0);for(const resolve of waiters)resolve();}
      else void this.processQueue();
    }
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
    const ctx=this.ctx;if(!ctx)return null;
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
