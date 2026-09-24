import * as ort from "onnxruntime-web";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

export interface ElgEyeFeatures {
  sequenceId:number; acquisitionTimestampMs:number; processedTimestampMs:number; latencyMs:number;
  leftRelX:number; leftRelY:number; rightRelX:number; rightRelY:number;
  leftRelXRaw:number; leftRelYRaw:number; rightRelXRaw:number; rightRelYRaw:number;
  binocularReliability:number; leftConfidence:number; rightConfidence:number;
  inferenceMs:number; timestampMs:number;
}

type ElgBackend = "wasm" | "webgpu";
const MODEL_URL = "/OpenEyeTrack/models/gazeml_elg_i60x36_n32.onnx";
const W=60,H=36;
const LEFT_EYE={inner:362,outer:263}, RIGHT_EYE={inner:133,outer:33};

export class ElgEyeTracker {
  private session:ort.InferenceSession|null=null;
  private canvas=document.createElement("canvas");
  private ctx:CanvasRenderingContext2D|null;
  private lastRun=0;
  private readonly minIntervalMs=33;
  private history:ElgEyeFeatures[]=[];
  private filtered:{leftRelX:number;leftRelY:number;rightRelX:number;rightRelY:number}|null=null;
  private nextSequenceId=1;
  private queue:Array<{sequenceId:number;acquisitionTimestampMs:number;input:Float32Array;resolve:(v:ElgEyeFeatures|null)=>void;reject:(e:unknown)=>void}>=[];
  private processing=false;
  private drainWaiters:Array<()=>void>=[];
  private backend:ElgBackend="wasm";
  private requestedBackend:ElgBackend="wasm";
  private backendInitializing=false;
  private backendError:string|null=null;
  private backendRuns=0;
  private backendFailures=0;
  private backendTimes:number[]=[];
  private acquisitionMode:"queued"|"skip-while-busy"="queued";

  constructor(){
    this.canvas.width=W;this.canvas.height=H;
    this.ctx=this.canvas.getContext("2d",{willReadFrequently:true});
    queueMicrotask(()=>this.installBackendSelector());
  }

  private installBackendSelector():void{
    if(document.querySelector("#elg-backend-mode"))return;
    const acquisition=document.querySelector<HTMLSelectElement>("#elg-acquisition-mode");
    if(!acquisition)return;
    const label=document.createElement("label");
    label.innerHTML='<span>ELG backend (A/B test)</span><select id="elg-backend-mode"><option value="wasm" selected>WASM / CPU (baseline)</option><option value="webgpu">WebGPU / GPU (experimental)</option></select>';
    acquisition.closest("label")?.insertAdjacentElement("beforebegin",label);
    const select=label.querySelector<HTMLSelectElement>("#elg-backend-mode")!;
    select.addEventListener("change",()=>{
      const next=select.value==="webgpu"?"webgpu":"wasm";
      if(next===this.requestedBackend)return;
      this.requestedBackend=next;
      this.session=null;this.backendInitializing=false;this.backendError=null;this.backendRuns=0;this.backendFailures=0;this.backendTimes=[];
      this.reset();
      console.info(`[OpenEyeTrack ELG A/B] Backend selected: ${next}. It will be used exclusively at next initialization.`);
    });
  }

  get activeBackend():ElgBackend{return this.backend;}
  get activeAcquisitionMode():"queued"|"skip-while-busy"{return this.acquisitionMode;}
  get webgpuActive():boolean{return this.backend==="webgpu"&&this.session!==null;}
  get webgpuStatus():"waiting"|"initializing"|"active"|"unavailable"{
    if(this.requestedBackend!=="webgpu")return "waiting";
    if(this.backendInitializing)return "initializing";
    if(this.backend==="webgpu"&&this.session)return "active";
    return this.backendError?"unavailable":"waiting";
  }
  get webgpuError():string|null{return this.backendError;}
  get webgpuBenchmarkMetrics():{status:string;error:string|null;runs:number;failures:number;wasmMedianMs:number|null;webgpuMedianMs:number|null;maxAbsDiffMedian:number|null}{
    const v=this.backendTimes.filter(Number.isFinite).sort((a,b)=>a-b),median=v.length?v[Math.floor(v.length/2)]:null;
    return {status:this.webgpuStatus,error:this.backendError,runs:this.backendRuns,failures:this.backendFailures,wasmMedianMs:this.backend==="wasm"?median:null,webgpuMedianMs:this.backend==="webgpu"?median:null,maxAbsDiffMedian:null};
  }
  get webgpuBenchmarkSummary():string{
    const m=this.webgpuBenchmarkMetrics;
    if(this.requestedBackend!=="webgpu")return `A/B backend: WASM only · ${m.runs} runs · median ${m.wasmMedianMs?.toFixed(1)??"?"} ms`;
    if(this.backendInitializing)return "A/B backend: WebGPU initializing…";
    if(this.backendError)return `A/B backend: WebGPU unavailable · ${this.backendError}`;
    return `A/B backend: WebGPU only · ${m.runs} runs · median ${m.webgpuMedianMs?.toFixed(1)??"?"} ms`;
  }
  setAcquisitionMode(mode:"queued"|"skip-while-busy"):void{this.acquisitionMode=mode;}
  reset():void{this.history=[];this.filtered=null;}
  get queueDepth():number{return this.queue.length+(this.processing?1:0);}
  async drain():Promise<void>{if(!this.processing&&!this.queue.length)return;await new Promise<void>(r=>this.drainWaiters.push(r));}

  private stabilize(v:ElgEyeFeatures):ElgEyeFeatures{
    const raw={leftRelX:v.leftRelX,leftRelY:v.leftRelY,rightRelX:v.rightRelX,rightRelY:v.rightRelY};
    this.history.push(v);if(this.history.length>5)this.history.shift();
    if(!this.filtered){this.filtered={...raw};return {...v,...raw,leftRelXRaw:raw.leftRelX,leftRelYRaw:raw.leftRelY,rightRelXRaw:raw.rightRelX,rightRelYRaw:raw.rightRelY,binocularReliability:1};}
    const prev=this.filtered,dl={x:raw.leftRelX-prev.leftRelX,y:raw.leftRelY-prev.leftRelY},dr={x:raw.rightRelX-prev.rightRelX,y:raw.rightRelY-prev.rightRelY};
    const magL=Math.hypot(dl.x,dl.y),magR=Math.hypot(dr.x,dr.y),dot=dl.x*dr.x+dl.y*dr.y;
    const direction=(magL>1e-5&&magR>1e-5)?Math.max(0,dot/(magL*magR)):1;
    const magnitudeAgreement=1-Math.min(1,Math.abs(magL-magR)/Math.max(.015,Math.max(magL,magR)));
    const confidence=Math.max(0,Math.min(1,(v.leftConfidence+v.rightConfidence)/2));
    const binocularReliability=Math.max(0,Math.min(1,.45*direction+.35*magnitudeAgreement+.20*confidence));
    const jointMovement=(magL+magR)/2,movementGain=jointMovement<.012?.16:jointMovement<.03?.28:jointMovement<.065?.52:.82;
    const alpha=Math.max(.08,Math.min(.90,movementGain*(.35+.65*binocularReliability))),imbalance=Math.max(.02,Math.max(magL,magR));
    const leftPenalty=magL>magR*1.8?Math.max(.2,1-(magL-magR)/imbalance):1,rightPenalty=magR>magL*1.8?Math.max(.2,1-(magR-magL)/imbalance):1;
    const al=Math.max(.06,alpha*leftPenalty),ar=Math.max(.06,alpha*rightPenalty);
    this.filtered={leftRelX:prev.leftRelX+al*dl.x,leftRelY:prev.leftRelY+al*dl.y,rightRelX:prev.rightRelX+ar*dr.x,rightRelY:prev.rightRelY+ar*dr.y};
    return {...v,...this.filtered,leftRelXRaw:raw.leftRelX,leftRelYRaw:raw.leftRelY,rightRelXRaw:raw.rightRelX,rightRelYRaw:raw.rightRelY,binocularReliability};
  }

  async initialize():Promise<void>{
    if(this.session&&this.backend===this.requestedBackend)return;
    const timeout=<T>(p:Promise<T>)=>Promise.race([p,new Promise<never>((_,reject)=>window.setTimeout(()=>reject(new Error("ELG model loading timed out after 30 seconds.")),30000))]);
    this.backendInitializing=true;this.backendError=null;this.session=null;
    const chosen=this.requestedBackend;
    try{
      const options:ort.InferenceSession.SessionOptions=chosen==="webgpu"?{executionProviders:["webgpu"],graphOptimizationLevel:"disabled"}:{executionProviders:["wasm"],graphOptimizationLevel:"all"};
      this.session=await timeout(ort.InferenceSession.create(MODEL_URL,options));
      this.backend=chosen;this.backendInitializing=false;
      console.info(`[OpenEyeTrack ELG A/B] ${chosen.toUpperCase()}-only session ready. No shadow backend is running.`);
    }catch(e){
      this.backendInitializing=false;this.backendFailures++;this.backendError=e instanceof Error?e.message:String(e);
      console.error(`[OpenEyeTrack ELG A/B] ${chosen.toUpperCase()} initialization failed`,e);
      throw e;
    }
  }

  estimate(video:HTMLVideoElement,landmarks:NormalizedLandmark[],force=false):Promise<ElgEyeFeatures|null>{
    if(!this.session||video.videoWidth===0||landmarks.length<478)return Promise.resolve(null);
    if(this.acquisitionMode==="skip-while-busy"&&this.processing)return Promise.resolve(null);
    const now=performance.now();if(!force&&now-this.lastRun<this.minIntervalMs)return Promise.resolve(null);this.lastRun=now;
    const left=this.cropEye(video,landmarks,LEFT_EYE),right=this.cropEye(video,landmarks,RIGHT_EYE);if(!left||!right)return Promise.resolve(null);
    const input=new Float32Array(2*H*W);input.set(left,0);input.set(right,H*W);
    const sequenceId=this.nextSequenceId++,acquisitionTimestampMs=now;
    return new Promise<ElgEyeFeatures|null>((resolve,reject)=>{this.queue.push({sequenceId,acquisitionTimestampMs,input,resolve,reject});void this.processQueue();});
  }

  private async processQueue():Promise<void>{
    if(this.processing||!this.session)return;this.processing=true;
    try{
      while(this.queue.length){
        const job=this.queue.shift()!,started=performance.now();
        try{
          const feeds:Record<string,ort.Tensor>={};feeds[this.session.inputNames[0]]=new ort.Tensor("float32",job.input,[2,H,W,1]);
          const outputs=await this.session.run(feeds),finished=performance.now(),elapsed=finished-started;
          this.backendTimes.push(elapsed);if(this.backendTimes.length>500)this.backendTimes.shift();this.backendRuns++;
          const candidates=this.session.outputNames.map(name=>({name,tensor:outputs[name]})).filter((v):v is {name:string;tensor:ort.Tensor}=>Boolean(v.tensor));
          let decoded:{l:{x:number;y:number;confidence:number};r:{x:number;y:number;confidence:number}}|null=null;
          for(const {tensor} of candidates){if(!(tensor.data instanceof Float32Array))continue;const dims=tensor.dims.map(Number),l=decodeIris(tensor.data,dims,0),r=decodeIris(tensor.data,dims,1);if(l&&r){decoded={l,r};break;}}
          if(!decoded)throw new Error(`ELG model ran, but no output matched an 18-channel 60×36 heatmap. Outputs: ${candidates.map(({name,tensor})=>`${name} [${tensor.dims.join("×")}]`).join(", ")}`);
          const processedTimestampMs=performance.now(),{l,r}=decoded;
          job.resolve(this.stabilize({sequenceId:job.sequenceId,acquisitionTimestampMs:job.acquisitionTimestampMs,processedTimestampMs,latencyMs:processedTimestampMs-job.acquisitionTimestampMs,leftRelX:l.x,leftRelY:l.y,rightRelX:r.x,rightRelY:r.y,leftRelXRaw:l.x,leftRelYRaw:l.y,rightRelXRaw:r.x,rightRelYRaw:r.y,binocularReliability:1,leftConfidence:l.confidence,rightConfidence:r.confidence,inferenceMs:elapsed,timestampMs:job.acquisitionTimestampMs}));
        }catch(e){this.backendFailures++;job.reject(e);}
      }
    }finally{this.processing=false;if(!this.queue.length){const w=this.drainWaiters.splice(0);for(const r of w)r();}else void this.processQueue();}
  }

  private cropEye(video:HTMLVideoElement,landmarks:NormalizedLandmark[],eye:{inner:number;outer:number}):Float32Array|null{
    const a=landmarks[eye.inner],b=landmarks[eye.outer],ax=a.x*video.videoWidth,ay=a.y*video.videoHeight,bx=b.x*video.videoWidth,by=b.y*video.videoHeight;
    const cx=(ax+bx)/2,cy=(ay+by)/2,cornerDistance=Math.hypot(ax-bx,ay-by);if(cornerDistance<12)return null;
    const angle=Math.atan2(by-ay,bx-ax),cropW=cornerDistance*1.8,cropH=cropW*H/W,ctx=this.ctx;if(!ctx)return null;
    ctx.save();ctx.clearRect(0,0,W,H);ctx.translate(W/2,H/2);ctx.scale(W/cropW,H/cropH);ctx.rotate(-angle);ctx.translate(-cx,-cy);ctx.drawImage(video,0,0);ctx.restore();
    const rgba=ctx.getImageData(0,0,W,H).data,gray=new Uint8Array(W*H),hist=new Uint32Array(256);
    for(let i=0;i<gray.length;i++){const g=Math.round(.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2]);gray[i]=g;hist[g]++;}
    const cdf=new Uint32Array(256);let total=0,cdfMin=0;for(let i=0;i<256;i++){total+=hist[i];cdf[i]=total;if(!cdfMin&&hist[i])cdfMin=total;}
    const out=new Float32Array(W*H),den=Math.max(1,total-cdfMin);for(let i=0;i<gray.length;i++){const eq=Math.round((cdf[gray[i]]-cdfMin)*255/den);out[i]=eq/127.5-1;}return out;
  }
}

function decodeIris(data:Float32Array,dims:number[],batch:number):{x:number;y:number;confidence:number}|null{
  if(dims.length!==4||dims[0]<2)return null;const nhwc=dims[1]===H&&dims[2]===W,nchw=dims[2]===H&&dims[3]===W;if(!nhwc&&!nchw)return null;
  const channels=nhwc?dims[3]:dims[1];if(channels<16)return null;
  const at=(c:number,x:number,y:number)=>data[nhwc?(((batch*H+y)*W+x)*channels+c):(((batch*channels+c)*H+y)*W+x)];
  let sx=0,sy=0,sc=0,n=0;
  for(let c=8;c<16;c++){
    let best=-Infinity,bx=0,by=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=at(c,x,y);if(v>best){best=v;bx=x;by=y;}}
    if(!Number.isFinite(best))continue;let wx=0,wy=0,ws=0;const radius=2,floor=Math.max(0,best*.35);
    for(let y=Math.max(0,by-radius);y<=Math.min(H-1,by+radius);y++)for(let x=Math.max(0,bx-radius);x<=Math.min(W-1,bx+radius);x++){const w=Math.max(0,at(c,x,y)-floor);wx+=x*w;wy+=y*w;ws+=w;}
    const px=ws>1e-8?wx/ws:bx,py=ws>1e-8?wy/ws:by;sx+=px/(W-1);sy+=py/(H-1);sc+=best;n++;
  }
  return n?{x:sx/n,y:sy/n,confidence:sc/n}:null;
}
