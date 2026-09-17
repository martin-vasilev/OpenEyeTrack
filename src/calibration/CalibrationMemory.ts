import type { GazeModelType } from "./GazeModels";
import type { ValidationPointResult } from "./CalibrationController";

interface StoredValidation { model:GazeModelType; width:number; height:number; points:{x:number;y:number;error:number}[]; timestamp:number; }
const KEY="openeyetrack.calibration-memory.v1";

export class CalibrationMemory {
  save(model:GazeModelType, results:ValidationPointResult[]){
    const entry:StoredValidation={model,width:innerWidth,height:innerHeight,timestamp:Date.now(),points:results.map(r=>({x:r.targetX/innerWidth,y:r.targetY/innerHeight,error:r.accuracyPx/Math.hypot(innerWidth,innerHeight)}))};
    const all=this.loadAll().filter(x=>x.model!==model).concat(entry);
    try{localStorage.setItem(KEY,JSON.stringify(all));}catch{/* memory is optional */}
  }
  adaptivePoints(model:GazeModelType, count:number):readonly (readonly [number,number])[]|null {
    const previous=this.loadAll().find(x=>x.model===model);if(!previous||count<13)return null;
    const base:(readonly[number,number])[]=[[.12,.12],[.5,.12],[.88,.12],[.12,.5],[.5,.5],[.88,.5],[.12,.88],[.5,.88],[.88,.88]];
    const worst=[...previous.points].sort((a,b)=>b.error-a.error).slice(0,4);
    const adaptive:([number,number])[]=worst.map((p,i)=>{const dx=i%2===0?.07:-.07,dy=i<2?.07:-.07;return[clip(p.x+dx),clip(p.y+dy)];});
    return [...base,...adaptive];
  }
  has(model:GazeModelType){return this.loadAll().some(x=>x.model===model);}
  clear(){try{localStorage.removeItem(KEY);}catch{/* optional */}}
  private loadAll():StoredValidation[]{try{const raw=localStorage.getItem(KEY);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[];}catch{return[];}}
}
function clip(v:number){return Math.max(.08,Math.min(.92,v));}
