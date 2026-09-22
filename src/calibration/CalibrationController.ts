import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";
import type { CalibrationObservation, GazePrediction } from "./LinearGazeModel";
import { createGazeEstimator, serializeGazeEstimator, restoreGazeEstimator, type GazeModelConfig, type SerializedGazeModel } from "./GazeModels";
import type { GazeEstimator } from "../gaze/GazeEstimator";
import { CalibrationMemory } from "./CalibrationMemory";
import { buildHeadPoseReference, type HeadPoseReference } from "../qc/CalibrationHeadPose";
export type CalibrationPointCount = 5 | 9 | 13;
export type TargetShape = "bullseye" | "circle" | "dot" | "cross";
export interface CalibrationTargetConfig { sizePx:number; shape:TargetShape; color:string; }
export interface CalibrationConfig { featureModel:"mediapipe"|"elg"|"mobileone_s0"|"resnet34"; points:CalibrationPointCount; settleMs:number; sampleMs:number; repetitions:number; randomize:boolean; jitterTargets:boolean; headPoseVariation:boolean; adaptiveTargets:boolean; target:CalibrationTargetConfig; model:GazeModelConfig; }
export interface CalibrationSummary { id:string; config:CalibrationConfig; observations:number; newObservations:number; retainedObservations:number; targetsCompleted:number; samplesCollected:number; adaptiveUsed:boolean; headPoseReference:HeadPoseReference|null; }
export interface SavedCalibration {version:1;savedAt:string;screenWidth:number;screenHeight:number;config:CalibrationConfig;model:SerializedGazeModel;summary:CalibrationSummary|null;}
export interface ValidationPointResult { targetX:number; targetY:number; samplesExpected:number; samplesValid:number; accuracyPx:number; precisionRmsS2SPx:number; precisionSdPx:number; }
export interface ValidationResult { meanPx:number; medianPx:number; rmsePx:number; precisionRmsS2SPx:number; precisionSdPx:number; dataLoss:number; points:number; pointResults:ValidationPointResult[]; }
const POINT_SETS:Record<CalibrationPointCount,readonly(readonly[number,number])[]>={5:[[.5,.5],[.12,.12],[.88,.12],[.12,.88],[.88,.88]],9:[[.12,.12],[.5,.12],[.88,.12],[.12,.5],[.5,.5],[.88,.5],[.12,.88],[.5,.88],[.88,.88]],13:[[.12,.12],[.5,.12],[.88,.12],[.12,.5],[.5,.5],[.88,.5],[.12,.88],[.5,.88],[.88,.88],[.31,.31],[.69,.31],[.31,.69],[.69,.69]]};
const FEATURE_KEYS:(keyof EyeHeadFeatures)[]=["leftIrisX","leftIrisY","rightIrisX","rightIrisY","leftRelX","leftRelY","rightRelX","rightRelY","leftIrisDiameter","rightIrisDiameter","headX","headY","headZ","headYaw","headPitch","headRoll","appearanceGazeYaw","appearanceGazePitch","elgLeftRelX","elgLeftRelY","elgRightRelX","elgRightRelY","elgConfidence"];
export class CalibrationController {
  model:GazeEstimator;private config:CalibrationConfig;private lastSummary:CalibrationSummary|null=null;private memory=new CalibrationMemory();private activePoints:readonly(readonly[number,number])[]=POINT_SETS[13];private accumulatedObservations:CalibrationObservation[]=[];private accumulatedModelKey="";
  constructor(private readonly target:HTMLElement,config:CalibrationConfig){this.config=cloneConfig(config);this.model=createGazeEstimator(this.config.model);this.accumulatedModelKey=modelKey(this.config.model);this.applyTargetStyle();}
  setConfig(config:CalibrationConfig){const changed=JSON.stringify(config.model)!==JSON.stringify(this.config.model);this.config=cloneConfig(config);if(changed){this.model=createGazeEstimator(this.config.model);this.accumulatedObservations=[];this.accumulatedModelKey=modelKey(this.config.model);}this.applyTargetStyle();}
  get pointCount(){return this.activePoints.length;}get calibrationSummary(){return this.lastSummary;}get hasCalibrationMemory(){return this.memory.has(this.config.model.type);}
  clearCalibrationMemory(){this.memory.clear();this.accumulatedObservations=[];this.lastSummary=null;}
  exportSavedCalibration():SavedCalibration|null{const model=serializeGazeEstimator(this.model,this.config.model);return model?{version:1,savedAt:new Date().toISOString(),screenWidth:innerWidth,screenHeight:innerHeight,config:cloneConfig(this.config),model,summary:this.lastSummary}:null;}
  restoreSavedCalibration(saved:SavedCalibration){if(saved.version!==1)throw new Error("Unsupported saved calibration.");const scaleX=innerWidth/saved.screenWidth,scaleY=innerHeight/saved.screenHeight;if(Math.abs(scaleX-1)>.08||Math.abs(scaleY-1)>.08)throw new Error("Saved calibration was made at a substantially different browser size. Please recalibrate.");this.config=cloneConfig(saved.config);this.model=restoreGazeEstimator(this.config.model,saved.model);this.lastSummary=saved.summary;this.accumulatedObservations=[];this.accumulatedModelKey=modelKey(this.config.model);this.applyTargetStyle();}

  async calibrate(getFeatures:()=>EyeHeadFeatures|null,beforeRound?:(round:number)=>Promise<void>):Promise<CalibrationSummary>{
    const key=modelKey(this.config.model);if(key!==this.accumulatedModelKey){this.accumulatedObservations=[];this.accumulatedModelKey=key;}
    const adaptive=this.config.adaptiveTargets?this.memory.adaptivePoints(this.config.model.type,this.config.points):null;this.activePoints=adaptive??POINT_SETS[this.config.points];
    const newObservations:CalibrationObservation[]=[];const calibrationFeatureSamples:EyeHeadFeatures[]=[];let samplesCollected=0;const rounds=this.config.headPoseVariation?5:this.config.repetitions;this.target.hidden=false;
    try{for(let round=0;round<rounds;round++){if(beforeRound)await beforeRound(round);let points=this.activePoints.map(([x,y])=>{if(!this.config.jitterTargets)return[x,y]as const;const j=.035;return[clamp(x+(Math.random()*2-1)*j,.07,.93),clamp(y+(Math.random()*2-1)*j,.07,.93)]as const;});if(this.config.randomize)shuffle(points);for(const[nx,ny]of points){this.place(nx,ny);await wait(this.config.settleMs);const samples=await collectFeatureSamples(getFeatures,this.config.sampleMs,this.config.featureModel==="elg");for(const copy of samples){calibrationFeatureSamples.push(copy);samplesCollected++;}if(samples.length){const stable=selectStableCalibrationSamples(samples);for(const features of stable)newObservations.push({targetX:nx*innerWidth,targetY:ny*innerHeight,features});}}}}finally{this.target.hidden=true;}
    const retainPrevious=this.config.adaptiveTargets&&this.accumulatedObservations.length>0;const retained=retainPrevious?this.accumulatedObservations:[];const combined=[...retained,...newObservations];const candidate=createGazeEstimator(this.config.model);await candidate.fit(combined);this.model=candidate;this.accumulatedObservations=combined;
    this.lastSummary={id:`cal-${Date.now()}`,config:cloneConfig(this.config),observations:combined.length,newObservations:newObservations.length,retainedObservations:retained.length,targetsCompleted:rounds*this.activePoints.length,samplesCollected,adaptiveUsed:adaptive!==null,headPoseReference:buildHeadPoseReference(calibrationFeatureSamples)};return this.lastSummary;
  }

  async recalibrateTargets(getFeatures:()=>EyeHeadFeatures|null,points:ValidationPointResult[]):Promise<CalibrationSummary>{
    if(!points.length)throw new Error("No validation targets were selected for recalibration.");
    const newObservations:CalibrationObservation[]=[],calibrationFeatureSamples:EyeHeadFeatures[]=[];let samplesCollected=0;this.target.hidden=false;
    try{for(const point of points){const nx=point.targetX/innerWidth,ny=point.targetY/innerHeight;this.place(nx,ny);await wait(this.config.settleMs);const samples=await collectFeatureSamples(getFeatures,this.config.sampleMs,this.config.featureModel==="elg");calibrationFeatureSamples.push(...samples);samplesCollected+=samples.length;for(const features of selectStableCalibrationSamples(samples))newObservations.push({targetX:point.targetX,targetY:point.targetY,features});}}finally{this.target.hidden=true;}
    const retained=[...this.accumulatedObservations],combined=[...retained,...newObservations],candidate=createGazeEstimator(this.config.model);await candidate.fit(combined);this.model=candidate;this.accumulatedObservations=combined;
    this.lastSummary={id:`cal-${Date.now()}`,config:cloneConfig(this.config),observations:combined.length,newObservations:newObservations.length,retainedObservations:retained.length,targetsCompleted:points.length,samplesCollected,adaptiveUsed:true,headPoseReference:buildHeadPoseReference(calibrationFeatureSamples)??this.lastSummary?.headPoseReference??null};return this.lastSummary;
  }
  async validate(getFeatures:()=>EyeHeadFeatures|null):Promise<ValidationResult>{const validationPoints=POINT_SETS[this.config.points];const results:ValidationPointResult[]=[];let totalExpected=0,totalValid=0;this.target.hidden=false;try{for(const[nx,ny]of validationPoints){this.place(nx,ny);await wait(this.config.settleMs);const targetX=nx*innerWidth,targetY=ny*innerHeight,predictions:GazePrediction[]=[];const expected=Math.max(1,Math.round(this.config.sampleMs/33));const features=await collectFeatureSamples(getFeatures,this.config.sampleMs,this.config.featureModel==="elg");for(const f of features){const p=this.model.predict(f);if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))predictions.push(p);}totalExpected+=expected;totalValid+=Math.min(expected,predictions.length);if(predictions.length){const x=median(predictions.map(p=>p.x)),y=median(predictions.map(p=>p.y));results.push({targetX,targetY,samplesExpected:expected,samplesValid:predictions.length,accuracyPx:Math.hypot(x-targetX,y-targetY),precisionRmsS2SPx:rmsS2S(predictions),precisionSdPx:spatialSd(predictions)});}}}finally{this.target.hidden=true;}if(!results.length)throw new Error("No valid gaze samples were collected during validation.");this.memory.save(this.config.model.type,results);const errors=results.map(r=>r.accuracyPx);return{meanPx:mean(errors),medianPx:median(errors),rmsePx:Math.sqrt(mean(errors.map(e=>e*e))),precisionRmsS2SPx:mean(results.map(r=>r.precisionRmsS2SPx)),precisionSdPx:mean(results.map(r=>r.precisionSdPx)),dataLoss:Math.max(0,1-totalValid/totalExpected),points:results.length,pointResults:results};}
  private place(nx:number,ny:number){this.target.style.left=`${nx*100}%`;this.target.style.top=`${ny*100}%`;}
  private applyTargetStyle(){this.target.dataset.shape=this.config.target.shape;this.target.style.setProperty("--target-size",`${this.config.target.sizePx}px`);this.target.style.setProperty("--target-color",this.config.target.color);}
}
function clamp(v:number,a:number,b:number){return Math.max(a,Math.min(b,v));}
function modelKey(c:GazeModelConfig){return JSON.stringify(c);}
function cloneConfig(c:CalibrationConfig):CalibrationConfig{return{...c,target:{...c.target},model:{...c.model}};}
function medianFeatures(samples:EyeHeadFeatures[]):EyeHeadFeatures{const out={}as EyeHeadFeatures;for(const key of FEATURE_KEYS){const vals=samples.map(s=>s[key]).filter((v):v is number=>typeof v==="number"&&Number.isFinite(v));(out as unknown as Record<string,number|null>)[key]=vals.length?median(vals):null;}return out;}
function selectStableCalibrationSamples(samples:EyeHeadFeatures[]):EyeHeadFeatures[]{
  if(samples.length<=3)return samples.length?[medianFeatures(samples)]:[];
  const scored=samples.map((s,i)=>{
    const reliability=s.elgBinocularReliability??1;
    const rawJump=i===0?0:elgRawDistance(samples[i-1],s);
    return{s,reliability,rawJump};
  });
  const jumps=scored.slice(1).map(x=>x.rawJump).sort((a,b)=>a-b);
  const jumpCut=jumps.length?Math.max(.012,quantile(jumps,.70)*1.5):Infinity;
  let stable=scored.filter(x=>x.reliability>=.45&&x.rawJump<=jumpCut).map(x=>x.s);
  if(stable.length<Math.min(5,samples.length))stable=[...samples];
  // Retain several independent observations per target rather than collapsing
  // the entire fixation to one median. Temporal bins reduce autocorrelation.
  const n=Math.min(6,stable.length),out:EyeHeadFeatures[]=[];
  for(let k=0;k<n;k++){const a=Math.floor(k*stable.length/n),b=Math.max(a+1,Math.floor((k+1)*stable.length/n));out.push(medianFeatures(stable.slice(a,b)));}
  return out;
}
function elgRawDistance(a:EyeHeadFeatures,b:EyeHeadFeatures){
  const av=[a.elgLeftRelXRaw,a.elgLeftRelYRaw,a.elgRightRelXRaw,a.elgRightRelYRaw],bv=[b.elgLeftRelXRaw,b.elgLeftRelYRaw,b.elgRightRelXRaw,b.elgRightRelYRaw];
  if(av.some(v=>v===null)||bv.some(v=>v===null))return 0;
  return Math.sqrt(av.reduce<number>((sum,v,i)=>sum+((v as number)-(bv[i] as number))**2,0)/4);
}
function quantile(v:number[],q:number){if(!v.length)return 0;const s=[...v].sort((a,b)=>a-b),p=(s.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return s[l]+(s[h]-s[l])*(p-l);}
function rmsS2S(p:GazePrediction[]){if(p.length<2)return 0;return Math.sqrt(mean(p.slice(1).map((q,i)=>(q.x-p[i].x)**2+(q.y-p[i].y)**2)));}function spatialSd(p:GazePrediction[]){const mx=mean(p.map(q=>q.x)),my=mean(p.map(q=>q.y));return Math.sqrt(mean(p.map(q=>(q.x-mx)**2+(q.y-my)**2)));}function mean(v:number[]){return v.reduce((a,b)=>a+b,0)/v.length;}function wait(ms:number){return new Promise<void>(r=>setTimeout(r,ms));}function median(v:number[]){const s=[...v].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}function shuffle<T>(v:T[]){for(let i=v.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[v[i],v[j]]=[v[j],v[i]];}}


async function collectFeatureSamples(getFeatures:()=>EyeHeadFeatures|null,sampleMs:number,freshElgOnly:boolean):Promise<EyeHeadFeatures[]>{
  const expected=Math.max(1,Math.round(sampleMs/33));
  const samples:EyeHeadFeatures[]=[];
  const seenElg=new Set<number>();
  // Accuracy-first mode: for ELG, sample unique completed inferences rather than
  // counting repeated cached values as independent observations. Allow extra
  // wall-clock time for slower devices instead of silently creating data loss.
  const deadline=performance.now()+(freshElgOnly?Math.max(sampleMs*3,sampleMs+1500):sampleMs);
  while(performance.now()<deadline&&samples.length<expected){
    const f=getFeatures();
    if(f){
      if(!freshElgOnly){samples.push({...f});}
      else if(f.elgTimestampMs!==null&&!seenElg.has(f.elgTimestampMs)){
        seenElg.add(f.elgTimestampMs);samples.push({...f});
      }
    }
    await wait(8);
  }
  return samples;
}
