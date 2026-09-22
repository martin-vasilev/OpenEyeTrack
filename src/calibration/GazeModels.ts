import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";
import type { CalibrationObservation } from "./LinearGazeModel";
import type { GazeEstimator } from "../gaze/GazeEstimator";

export type GazeModelType = "linear" | "polynomial" | "rbf" | "knn";
export interface GazeModelConfig { type: GazeModelType; ridge: number; rbfGamma: number; knnK: number; }
export interface SerializedGazeModel {version:1;type:GazeModelType;state:unknown;}

function baseVector(f: EyeHeadFeatures): number[] {
  if (f.elgLeftRelX !== null && f.elgLeftRelY !== null && f.elgRightRelX !== null && f.elgRightRelY !== null) {
    const x=(f.elgLeftRelX+f.elgRightRelX)/2, y=(f.elgLeftRelY+f.elgRightRelY)/2;
    // Common binocular movement is the primary gaze signal. Disagreement is
    // retained as a smaller correction term because it is substantially noisier.
    return [x,y,(f.elgLeftRelX-f.elgRightRelX)*0.35,(f.elgLeftRelY-f.elgRightRelY)*0.35];
  }
  if (f.appearanceGazeYaw !== null && f.appearanceGazePitch !== null) return [f.appearanceGazeYaw, f.appearanceGazePitch];
  const relX=(f.leftRelX+f.rightRelX)/2, relY=(f.leftRelY+f.rightRelY)/2;
  return [relX,relY,f.leftRelX-f.rightRelX,f.leftRelY-f.rightRelY];
}
// Floors prevent tiny calibration variance from turning ordinary webcam noise into
// very large standardized feature changes. Indices follow baseVector().
const FEATURE_SD_FLOORS=[0.008,0.008,0.015,0.015];
// Eye-relative features drive gaze. Head pose is contextual correction only.
const RBF_DISTANCE_WEIGHTS=[1,1,0.8,0.8];
function standardize(rows:number[][]){const p=rows[0].length,mean=Array(p).fill(0),sd=Array(p).fill(0);for(const r of rows)for(let j=0;j<p;j++)mean[j]+=r[j]/rows.length;for(const r of rows)for(let j=0;j<p;j++)sd[j]+=(r[j]-mean[j])**2;for(let j=0;j<p;j++){const observed=Math.sqrt(sd[j]/Math.max(1,rows.length-1));sd[j]=Math.max(Number.isFinite(observed)?observed:0,FEATURE_SD_FLOORS[j]??1e-3);}return{mean,sd,rows:rows.map(r=>r.map((v,j)=>(v-mean[j])/sd[j]))};}
function applyStandardize(r:number[],mean:number[],sd:number[]){return r.map((v,j)=>(v-mean[j])/sd[j]);}
function weightRbfDistance(r:number[]){return r.map((v,j)=>v*(RBF_DISTANCE_WEIGHTS[j]??1));}
function solve(a:number[][],b:number[]){const n=a.length,m=a.map((r,i)=>[...r,b[i]]);for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(m[r][c])>Math.abs(m[p][c]))p=r;[m[c],m[p]]=[m[p],m[c]];const d=m[c][c];if(Math.abs(d)<1e-12)throw new Error("Gaze model matrix is singular.");for(let j=c;j<=n;j++)m[c][j]/=d;for(let r=0;r<n;r++){if(r===c)continue;const f=m[r][c];for(let j=c;j<=n;j++)m[r][j]-=f*m[c][j];}}return m.map(r=>r[n]);}
function ridgeFit(x:number[][],y:number[],lambda:number){const p=x[0].length,xtx=Array.from({length:p},()=>Array(p).fill(0)),xty=Array(p).fill(0);for(let r=0;r<x.length;r++)for(let i=0;i<p;i++){xty[i]+=x[r][i]*y[r];for(let j=0;j<p;j++)xtx[i][j]+=x[r][i]*x[r][j];}for(let i=1;i<p;i++)xtx[i][i]+=lambda;return solve(xtx,xty);}
function dot(a:number[],b:number[]){return a.reduce((s,v,i)=>s+v*b[i],0);}

class FeatureRidgeEstimator implements GazeEstimator {
  readonly name:string; private bx:number[]|null=null;private by:number[]|null=null;private mean:number[]=[];private sd:number[]=[];
  constructor(private quadratic:boolean,private lambda:number){this.name=quadratic?"polynomial":"linear";}
  fit(obs:CalibrationObservation[]){if(obs.length<5)throw new Error("Need at least 5 calibration observations.");const s=standardize(obs.map(o=>baseVector(o.features)));this.mean=s.mean;this.sd=s.sd;const x=s.rows.map(r=>this.expand(r));this.bx=ridgeFit(x,obs.map(o=>o.targetX),this.lambda);this.by=ridgeFit(x,obs.map(o=>o.targetY),this.lambda);}
  private expand(r:number[]){if(!this.quadratic)return[1,...r];const [x=0,y=0,dx=0,dy=0]=r;return[1,x,y,dx,dy,x*x,y*y,x*y,x*dx,y*dy];}
  predict(f:EyeHeadFeatures){if(!this.bx||!this.by)return null;const x=this.expand(applyStandardize(baseVector(f),this.mean,this.sd));return{x:dot(this.bx,x),y:dot(this.by,x),confidence:1,support:1,extrapolating:false};}
  get calibrated(){return this.bx!==null;}
  serialize(){return{quadratic:this.quadratic,lambda:this.lambda,bx:this.bx,by:this.by,mean:this.mean,sd:this.sd};}
  restore(s:any){if(!s||!Array.isArray(s.bx)||!Array.isArray(s.by)||!Array.isArray(s.mean)||!Array.isArray(s.sd))throw new Error("Invalid saved ridge model.");this.bx=s.bx;this.by=s.by;this.mean=s.mean;this.sd=s.sd;}
}

/** Linear global mapping plus local RBF correction. Weak RBF support fades to the linear baseline instead of (0,0). */
class RbfKernelEstimator implements GazeEstimator {
  readonly name="rbf";private train:number[][]=[];private ax:number[]|null=null;private ay:number[]|null=null;private mean:number[]=[];private sd:number[]=[];private baseline:FeatureRidgeEstimator;
  constructor(private gamma:number,private lambda:number){this.baseline=new FeatureRidgeEstimator(false,lambda);}
  private kernel(a:number[],b:number[]){let d=0;for(let i=0;i<a.length;i++)d+=(a[i]-b[i])**2;return Math.exp(-this.gamma*d);}
  fit(obs:CalibrationObservation[]){
    if(obs.length<5)throw new Error("Need at least 5 calibration observations.");
    this.baseline.fit(obs);const s=standardize(obs.map(o=>baseVector(o.features)));this.mean=s.mean;this.sd=s.sd;this.train=s.rows.map(weightRbfDistance);
    const residualX=obs.map(o=>o.targetX-(this.baseline.predict(o.features)?.x??o.targetX)),residualY=obs.map(o=>o.targetY-(this.baseline.predict(o.features)?.y??o.targetY));
    const k=this.train.map((a,i)=>this.train.map((b,j)=>this.kernel(a,b)+(i===j?this.lambda:0)));this.ax=solve(k,residualX);this.ay=solve(k,residualY);
  }
  predict(f:EyeHeadFeatures){
    if(!this.ax||!this.ay)return null;const base=this.baseline.predict(f);if(!base)return null;
    const z=weightRbfDistance(applyStandardize(baseVector(f),this.mean,this.sd)),k=this.train.map(t=>this.kernel(z,t)),support=Math.max(...k,0);
    // Support is the similarity to the nearest calibration observation. Smoothly suppress local correction outside calibrated feature space.
    const correctionWeight=Math.max(0,Math.min(1,(support-.05)/.20));
    return{x:base.x+correctionWeight*dot(this.ax,k),y:base.y+correctionWeight*dot(this.ay,k),confidence:support,support,extrapolating:support<.25};
  }
  get calibrated(){return this.ax!==null&&this.baseline.calibrated;}
}
class KnnEstimator implements GazeEstimator {
  readonly name="knn";private train:{x:number[];tx:number;ty:number}[]=[];private mean:number[]=[];private sd:number[]=[];constructor(private k:number){}
  fit(obs:CalibrationObservation[]){if(!obs.length)throw new Error("No calibration observations.");const s=standardize(obs.map(o=>baseVector(o.features)));this.mean=s.mean;this.sd=s.sd;this.train=s.rows.map((x,i)=>({x,tx:obs[i].targetX,ty:obs[i].targetY}));}
  predict(f:EyeHeadFeatures){if(!this.train.length)return null;const z=applyStandardize(baseVector(f),this.mean,this.sd),near=this.train.map(t=>({t,d:Math.sqrt(t.x.reduce((s,v,i)=>s+(v-z[i])**2,0))})).sort((a,b)=>a.d-b.d).slice(0,Math.min(this.k,this.train.length));let sw=0,sx=0,sy=0;for(const n of near){const w=1/(n.d+1e-3);sw+=w;sx+=w*n.t.tx;sy+=w*n.t.ty;}const nearest=near[0]?.d??Infinity,confidence=Math.exp(-nearest);return{x:sx/sw,y:sy/sw,confidence,support:confidence,extrapolating:confidence<.25};}
  get calibrated(){return this.train.length>0;}
}
export function serializeGazeEstimator(model:GazeEstimator,c:GazeModelConfig):SerializedGazeModel|null {const x=model as GazeEstimator&{serialize?:()=>unknown};return x.serialize?{version:1,type:c.type,state:x.serialize()}:null;}
export function restoreGazeEstimator(c:GazeModelConfig,s:SerializedGazeModel):GazeEstimator {if(s.version!==1||s.type!==c.type)throw new Error("Saved calibration is incompatible.");const model=createGazeEstimator(c) as GazeEstimator&{restore?:(x:unknown)=>void};if(!model.restore)throw new Error("This gaze model cannot currently be restored.");model.restore(s.state);return model;}
export function createGazeEstimator(c:GazeModelConfig):GazeEstimator {
  if(c.type==="linear")return new FeatureRidgeEstimator(false,c.ridge);
  if(c.type==="polynomial")return new FeatureRidgeEstimator(true,c.ridge);
  if(c.type==="rbf")return new RbfKernelEstimator(c.rbfGamma,c.ridge);
  return new KnnEstimator(c.knnK);
}
