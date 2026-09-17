import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";
import { LinearGazeModel, type CalibrationObservation, type GazePrediction } from "./LinearGazeModel";
export type CalibrationPointCount = 5 | 9 | 13;
export interface CalibrationConfig { points: CalibrationPointCount; settleMs: number; sampleMs: number; repetitions: number; randomize: boolean; }
export interface CalibrationSummary { id: string; config: CalibrationConfig; observations: number; targetsCompleted: number; samplesCollected: number; }
export interface ValidationPointResult { targetX: number; targetY: number; samplesExpected: number; samplesValid: number; accuracyPx: number; precisionRmsS2SPx: number; precisionSdPx: number; }
export interface ValidationResult { meanPx: number; medianPx: number; rmsePx: number; precisionRmsS2SPx: number; precisionSdPx: number; dataLoss: number; points: number; pointResults: ValidationPointResult[]; }
const POINT_SETS: Record<CalibrationPointCount, readonly (readonly [number, number])[]> = {
  5:[[.5,.5],[.12,.12],[.88,.12],[.12,.88],[.88,.88]],
  9:[[.12,.12],[.5,.12],[.88,.12],[.12,.5],[.5,.5],[.88,.5],[.12,.88],[.5,.88],[.88,.88]],
  13:[[.12,.12],[.5,.12],[.88,.12],[.12,.5],[.5,.5],[.88,.5],[.12,.88],[.5,.88],[.88,.88],[.31,.31],[.69,.31],[.31,.69],[.69,.69]]
};
const FEATURE_KEYS: (keyof EyeHeadFeatures)[] = ["leftIrisX","leftIrisY","rightIrisX","rightIrisY","leftRelX","leftRelY","rightRelX","rightRelY","leftIrisDiameter","rightIrisDiameter","headX","headY","headZ","headYaw","headPitch","headRoll"];
export class CalibrationController {
  readonly model = new LinearGazeModel(); private config: CalibrationConfig; private lastSummary: CalibrationSummary | null = null;
  constructor(private readonly target: HTMLElement, config: CalibrationConfig) { this.config={...config}; }
  setConfig(config: CalibrationConfig): void { this.config={...config}; }
  get pointCount(): number { return this.config.points; }
  get calibrationSummary(): CalibrationSummary | null { return this.lastSummary; }
  async calibrate(getFeatures:()=>EyeHeadFeatures|null): Promise<CalibrationSummary> {
    const observations: CalibrationObservation[]=[]; let samplesCollected=0; const sequence=this.calibrationSequence(); this.target.hidden=false;
    try { for (const [nx,ny] of sequence) { this.place(nx,ny); await wait(this.config.settleMs); const samples:EyeHeadFeatures[]=[]; const end=performance.now()+this.config.sampleMs;
      while(performance.now()<end){const f=getFeatures(); if(f){samples.push({...f}); samplesCollected++;} await wait(33);}
      if(samples.length) observations.push({targetX:nx*innerWidth,targetY:ny*innerHeight,features:medianFeatures(samples)});
    }} finally { this.target.hidden=true; }
    this.model.fit(observations); this.lastSummary={id:`cal-${Date.now()}`,config:{...this.config},observations:observations.length,targetsCompleted:sequence.length,samplesCollected}; return this.lastSummary;
  }
  async validate(getFeatures:()=>EyeHeadFeatures|null): Promise<ValidationResult> {
    const results:ValidationPointResult[]=[]; let totalExpected=0,totalValid=0; this.target.hidden=false;
    try { for(const [nx,ny] of POINT_SETS[this.config.points]){this.place(nx,ny);await wait(this.config.settleMs);const targetX=nx*innerWidth,targetY=ny*innerHeight,predictions:GazePrediction[]=[];const expected=Math.max(1,Math.round(this.config.sampleMs/33));const end=performance.now()+this.config.sampleMs;
      while(performance.now()<end){const f=getFeatures(),p=f?this.model.predict(f):null;if(p)predictions.push(p);await wait(33);} totalExpected+=expected;totalValid+=predictions.length;
      if(predictions.length){const x=median(predictions.map(p=>p.x)),y=median(predictions.map(p=>p.y));results.push({targetX,targetY,samplesExpected:expected,samplesValid:predictions.length,accuracyPx:Math.hypot(x-targetX,y-targetY),precisionRmsS2SPx:rmsS2S(predictions),precisionSdPx:spatialSd(predictions)});}
    }} finally {this.target.hidden=true;} if(!results.length)throw new Error("No valid gaze samples were collected during validation.");
    const errors=results.map(r=>r.accuracyPx);return {meanPx:mean(errors),medianPx:median(errors),rmsePx:Math.sqrt(mean(errors.map(e=>e*e))),precisionRmsS2SPx:mean(results.map(r=>r.precisionRmsS2SPx)),precisionSdPx:mean(results.map(r=>r.precisionSdPx)),dataLoss:Math.max(0,1-totalValid/totalExpected),points:results.length,pointResults:results};
  }
  private calibrationSequence(){const sequence:(readonly[number,number])[]=[];for(let r=0;r<this.config.repetitions;r++){const p=[...POINT_SETS[this.config.points]];if(this.config.randomize)shuffle(p);sequence.push(...p);}return sequence;}
  private place(nx:number,ny:number){this.target.style.left=`${nx*100}%`;this.target.style.top=`${ny*100}%`;}
}
function medianFeatures(samples:EyeHeadFeatures[]):EyeHeadFeatures{const out={} as EyeHeadFeatures;for(const key of FEATURE_KEYS){const vals=samples.map(s=>s[key]).filter((v):v is number=>typeof v==="number"&&Number.isFinite(v));(out as unknown as Record<string,number|null>)[key]=vals.length?median(vals):null;}return out;}
function rmsS2S(p:GazePrediction[]){if(p.length<2)return 0;const d=p.slice(1).map((q,i)=>{const a=p[i];return (q.x-a.x)**2+(q.y-a.y)**2;});return Math.sqrt(mean(d));}
function spatialSd(p:GazePrediction[]){const mx=mean(p.map(q=>q.x)),my=mean(p.map(q=>q.y));return Math.sqrt(mean(p.map(q=>(q.x-mx)**2+(q.y-my)**2)));}
function mean(v:number[]){return v.reduce((a,b)=>a+b,0)/v.length;} function wait(ms:number){return new Promise<void>(r=>setTimeout(r,ms));}
function median(v:number[]){const s=[...v].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function shuffle<T>(v:T[]){for(let i=v.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[v[i],v[j]]=[v[j],v[i]];}}
