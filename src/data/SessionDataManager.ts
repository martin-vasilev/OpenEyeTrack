import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";

type Cell=string|number|boolean|null;
type Row=Record<string,Cell>;

export interface CalibrationPointRecord {
  run:number; round:number; point:number;
  targetX:number; targetY:number; targetXNorm:number; targetYNorm:number;
  targetOnsetMs:number; samplingStartMs:number; samplingEndMs:number;
}
export interface ValidationPointRecord {
  validationRun:number; calibrationRun:number|null; eventType:"validation"|"drift_check"; point:number;
  targetX:number; targetY:number; targetXNorm:number; targetYNorm:number;
  targetOnsetMs:number; samplingStartMs:number; samplingEndMs:number;
}

export class SessionDataManager {
  private calibrationRows:Row[]=[];
  private validationRows:Row[]=[];
  private calibrationCounter=0;
  private validationCounter=0;
  currentCalibrationRun:number|null=null;
  currentValidationRun:number|null=null;

  get hasCalibrationData(){return this.calibrationRows.length>0;}
  get hasValidationData(){return this.validationRows.length>0;}

  beginCalibration(config:unknown,mode:"full"|"targeted"):number{
    const run=++this.calibrationCounter;this.currentCalibrationRun=run;
    this.calibrationRows.push({
      row_type:"run_start",calibration_run:run,calibration_mode:mode,event_timestamp_ms:performance.now(),
      timestamp_basis:"performance.now_ms_since_navigation",screen_width_px:innerWidth,screen_height_px:innerHeight,
      config_json:safeJson(config)
    });
    return run;
  }
  recordCalibrationSample(p:CalibrationPointRecord,sampleNumber:number,timestampMs:number,features:EyeHeadFeatures):void{
    this.calibrationRows.push({...calBase(p),row_type:"sample",sample_number:sampleNumber,sample_timestamp_ms:timestampMs,selected_for_fit:false,...featureColumns(features)});
  }
  recordCalibrationFitObservation(p:CalibrationPointRecord,observationNumber:number,features:EyeHeadFeatures):void{
    this.calibrationRows.push({...calBase(p),row_type:"fit_observation",fit_observation_number:observationNumber,selected_for_fit:true,...featureColumns(features)});
  }
  recordCalibrationPointSummary(p:CalibrationPointRecord,samplesCollected:number,fitObservations:number):void{
    this.calibrationRows.push({...calBase(p),row_type:"point_summary",samples_collected:samplesCollected,fit_observations:fitObservations});
  }
  finishCalibration(run:number,summary:unknown):void{
    this.calibrationRows.push({row_type:"run_summary",calibration_run:run,event_timestamp_ms:performance.now(),summary_json:safeJson(summary)});
  }

  beginValidation(calibrationRun:number|null,eventType:"validation"|"drift_check"="validation"):number{
    const run=++this.validationCounter;this.currentValidationRun=run;
    this.validationRows.push({
      row_type:"run_start",validation_run:run,calibration_run:calibrationRun,event_type:eventType,event_timestamp_ms:performance.now(),
      timestamp_basis:"performance.now_ms_since_navigation",screen_width_px:innerWidth,screen_height_px:innerHeight
    });
    return run;
  }
  recordValidationSample(p:ValidationPointRecord,sampleNumber:number,timestampMs:number,features:EyeHeadFeatures,prediction:{x:number;y:number}|null):void{
    const dx=prediction?prediction.x-p.targetX:null,dy=prediction?prediction.y-p.targetY:null;
    this.validationRows.push({
      ...valBase(p),row_type:"sample",sample_number:sampleNumber,sample_timestamp_ms:timestampMs,
      gaze_x_px:prediction?.x??null,gaze_y_px:prediction?.y??null,offset_x_px:dx,offset_y_px:dy,
      error_px:dx===null||dy===null?null:Math.hypot(dx,dy),error_deg:null,...featureColumns(features)
    });
  }
  recordValidationPointSummary(p:ValidationPointRecord,values:{
    samplesExpected:number;samplesValid:number;observedX:number|null;observedY:number|null;
    accuracyPx:number|null;precisionRmsS2SPx:number|null;precisionSdPx:number|null;
  }):void{
    const dx=values.observedX===null?null:values.observedX-p.targetX,dy=values.observedY===null?null:values.observedY-p.targetY;
    this.validationRows.push({
      ...valBase(p),row_type:"point_summary",samples_expected:values.samplesExpected,samples_valid:values.samplesValid,
      gaze_x_px:values.observedX,gaze_y_px:values.observedY,offset_x_px:dx,offset_y_px:dy,
      error_px:values.accuracyPx,error_deg:null,precision_rms_s2s_px:values.precisionRmsS2SPx,precision_sd_px:values.precisionSdPx
    });
  }
  finishValidation(run:number,result:unknown):void{
    this.validationRows.push({
      row_type:"run_summary",validation_run:run,calibration_run:this.currentCalibrationRun,event_type:"validation",
      event_timestamp_ms:performance.now(),summary_json:safeJson(result)
    });
  }

  calibrationCsv():string{return rowsToCsv(this.calibrationRows);}
  validationCsv():string{return rowsToCsv(this.validationRows);}
  downloadCalibration():void{if(this.hasCalibrationData)downloadText("calibration.csv",this.calibrationCsv(),"text/csv;charset=utf-8");}
  downloadValidation():void{if(this.hasValidationData)downloadText("validation.csv",this.validationCsv(),"text/csv;charset=utf-8");}
}

function calBase(p:CalibrationPointRecord):Row{return{
  calibration_run:p.run,round:p.round,point:p.point,target_x_px:p.targetX,target_y_px:p.targetY,
  target_x_norm:p.targetXNorm,target_y_norm:p.targetYNorm,target_onset_ms:p.targetOnsetMs,
  sampling_start_ms:p.samplingStartMs,sampling_end_ms:p.samplingEndMs
};}
function valBase(p:ValidationPointRecord):Row{return{
  validation_run:p.validationRun,calibration_run:p.calibrationRun,event_type:p.eventType,point:p.point,
  target_x_px:p.targetX,target_y_px:p.targetY,target_x_norm:p.targetXNorm,target_y_norm:p.targetYNorm,
  target_onset_ms:p.targetOnsetMs,sampling_start_ms:p.samplingStartMs,sampling_end_ms:p.samplingEndMs
};}
function featureColumns(features:EyeHeadFeatures):Row{
  const out:Row={};for(const [key,value] of Object.entries(features))out["feature_"+toSnake(key)]=value as Cell;return out;
}
function toSnake(v:string){return v.replace(/([a-z0-9])([A-Z])/g,"$1_$2").toLowerCase();}
function safeJson(v:unknown){try{return JSON.stringify(v);}catch{return "";}}
function csvCell(value:Cell|undefined){if(value===null||value===undefined)return "";const s=String(value);return /[,"\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}
function rowsToCsv(rows:Row[]):string{
  if(!rows.length)return "";
  const columns:string[]=[];const seen=new Set<string>();for(const row of rows)for(const key of Object.keys(row))if(!seen.has(key)){seen.add(key);columns.push(key);}
  return [columns.join(","),...rows.map(row=>columns.map(key=>csvCell(row[key])).join(","))].join("\n");
}
function downloadText(filename:string,text:string,type:string){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
