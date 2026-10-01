export const TIMESTAMP_BASIS="unix_epoch_ms_derived_from_performance_time_origin" as const;
export function unixNowMs():number{return performance.timeOrigin+performance.now();}
export function monotonicToUnixMs(monotonicMs:number):number{return performance.timeOrigin+monotonicMs;}
