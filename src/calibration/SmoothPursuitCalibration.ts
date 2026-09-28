import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";

export interface SmoothPursuitConfig {
  enabled:boolean;
  speedPxPerSec:number;
  rows:number;
  marginNorm:number;
  leadInMs:number;
  fitIntervalMs:number;
  turnExclusionMs:number;
}
export const DEFAULT_SMOOTH_PURSUIT_CONFIG:SmoothPursuitConfig={
  enabled:false,speedPxPerSec:100,rows:5,marginNorm:.08,leadInMs:700,fitIntervalMs:250,turnExclusionMs:220
};

export interface SmoothPursuitSample {
  sampleNumber:number;
  timestampMs:number;
  elapsedMs:number;
  targetX:number;targetY:number;targetXNorm:number;targetYNorm:number;
  segmentIndex:number;segmentType:"horizontal"|"vertical";
  selectedForFit:boolean;
  features:EyeHeadFeatures;
}
export interface SmoothPursuitResult {
  samples:SmoothPursuitSample[];
  fitSamples:SmoothPursuitSample[];
  startedMs:number;
  endedMs:number;
  movementStartedMs:number;
  movementEndedMs:number;
  durationMs:number;
  pathLengthPx:number;
}

type Segment={x0:number;y0:number;x1:number;y1:number;length:number;startDistance:number;endDistance:number;type:"horizontal"|"vertical"};

export async function runSmoothPursuitCalibration(
  target:HTMLElement,
  getFeatures:()=>EyeHeadFeatures|null,
  freshElgOnly:boolean,
  config:SmoothPursuitConfig,
  viewportWidth:number,
  viewportHeight:number
):Promise<SmoothPursuitResult>{
  const c={...DEFAULT_SMOOTH_PURSUIT_CONFIG,...config};
  const segments=buildSegments(viewportWidth,viewportHeight,c);
  const pathLengthPx=segments.at(-1)?.endDistance??0;
  const durationMs=pathLengthPx/Math.max(1,c.speedPxPerSec)*1000;
  const startedMs=performance.now(),movementStartedMs=startedMs+c.leadInMs,movementEndedMs=movementStartedMs+durationMs;
  const samples:SmoothPursuitSample[]=[];
  const seenElg=new Set<number>();
  let lastNonElgSampleMs=-Infinity,lastFitMs=-Infinity,raf=0,finished=false;

  const start=positionAtDistance(segments,0,viewportWidth,viewportHeight);
  place(target,start.xNorm,start.yNorm);target.hidden=false;

  const animate=()=>{
    const now=performance.now();
    const elapsed=Math.max(0,now-movementStartedMs);
    const distance=Math.min(pathLengthPx,elapsed/1000*c.speedPxPerSec);
    const p=positionAtDistance(segments,distance,viewportWidth,viewportHeight);
    place(target,p.xNorm,p.yNorm);
    if(now<movementEndedMs)raf=requestAnimationFrame(animate);else finished=true;
  };
  raf=requestAnimationFrame(animate);

  try{
    while(performance.now()<movementEndedMs||!finished){
      const f=getFeatures();
      if(f){
        let timestampMs:number|null=null;
        if(freshElgOnly){
          if(f.elgTimestampMs!==null&&f.elgAcquisitionTimestampMs!==null&&f.elgAcquisitionTimestampMs>=movementStartedMs&&f.elgAcquisitionTimestampMs<=movementEndedMs&&!seenElg.has(f.elgTimestampMs)){
            seenElg.add(f.elgTimestampMs);timestampMs=f.elgAcquisitionTimestampMs;
          }
        }else{
          const now=performance.now();
          if(now>=movementStartedMs&&now<=movementEndedMs&&now-lastNonElgSampleMs>=33){lastNonElgSampleMs=now;timestampMs=now;}
        }
        if(timestampMs!==null){
          const elapsedMs=timestampMs-movementStartedMs,distance=Math.min(pathLengthPx,Math.max(0,elapsedMs/1000*c.speedPxPerSec));
          const p=positionAtDistance(segments,distance,viewportWidth,viewportHeight);
          const awayFromTurn=distanceFromNearestBoundaryMs(segments,p.segmentIndex,distance,c.speedPxPerSec)>=c.turnExclusionMs;
          const reliable=(f.elgBinocularReliability??1)>=.45;
          const selectedForFit=awayFromTurn&&reliable&&timestampMs-lastFitMs>=c.fitIntervalMs;
          if(selectedForFit)lastFitMs=timestampMs;
          samples.push({sampleNumber:samples.length+1,timestampMs,elapsedMs,targetX:p.x,targetY:p.y,targetXNorm:p.xNorm,targetYNorm:p.yNorm,segmentIndex:p.segmentIndex,segmentType:p.segmentType,selectedForFit,features:{...f}});
        }
      }
      await wait(8);
    }
  }finally{
    if(raf)cancelAnimationFrame(raf);
    target.hidden=true;
  }

  const endedMs=performance.now();
  return{samples,fitSamples:samples.filter(s=>s.selectedForFit),startedMs,endedMs,movementStartedMs,movementEndedMs,durationMs,pathLengthPx};
}

function buildSegments(width:number,height:number,c:SmoothPursuitConfig):Segment[]{
  const margin=Math.max(.04,Math.min(.2,c.marginNorm)),rows=Math.max(2,Math.min(7,Math.round(c.rows)));
  const xs=[margin*width,(1-margin)*width],ys=Array.from({length:rows},(_,i)=>(margin+(1-2*margin)*(i/(rows-1)))*height);
  const points:{x:number;y:number}[]=[];
  for(let r=0;r<rows;r++){
    const leftFirst=r%2===0;
    points.push({x:xs[leftFirst?0:1],y:ys[r]},{x:xs[leftFirst?1:0],y:ys[r]});
    if(r<rows-1)points.push({x:xs[leftFirst?1:0],y:ys[r+1]});
  }
  const segments:Segment[]=[];let cumulative=0;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],length=Math.hypot(b.x-a.x,b.y-a.y);
    if(length<1)continue;
    const type=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y)?"horizontal":"vertical";
    segments.push({x0:a.x,y0:a.y,x1:b.x,y1:b.y,length,startDistance:cumulative,endDistance:cumulative+length,type});
    cumulative+=length;
  }
  return segments;
}
function positionAtDistance(segments:Segment[],distance:number,width:number,height:number){
  const s=segments.find(x=>distance<=x.endDistance)??segments.at(-1);
  if(!s)return{x:width/2,y:height/2,xNorm:.5,yNorm:.5,segmentIndex:0,segmentType:"horizontal" as const};
  const t=Math.max(0,Math.min(1,(distance-s.startDistance)/s.length)),x=s.x0+(s.x1-s.x0)*t,y=s.y0+(s.y1-s.y0)*t;
  return{x,y,xNorm:x/width,yNorm:y/height,segmentIndex:segments.indexOf(s),segmentType:s.type};
}
function distanceFromNearestBoundaryMs(segments:Segment[],segmentIndex:number,distance:number,speed:number){
  const s=segments[segmentIndex];if(!s)return Infinity;
  const d=Math.min(distance-s.startDistance,s.endDistance-distance);
  return d/Math.max(1,speed)*1000;
}
function place(target:HTMLElement,x:number,y:number){target.style.left=`${x*100}%`;target.style.top=`${y*100}%`;}
function wait(ms:number){return new Promise<void>(r=>setTimeout(r,ms));}
