import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";

export interface HeadMovementGuardConfig {
  enabled: boolean;
  maxXY: number;
  maxZ: number;
  maxAngleDeg: number;
  graceMs: number;
}
export interface HeadMovementViolation { reason: string; durationMs: number; }

export class HeadMovementGuard {
  private baseline: EyeHeadFeatures | null = null;
  private violationStarted: number | null = null;
  constructor(private config: HeadMovementGuardConfig) {}
  setConfig(config: HeadMovementGuardConfig){this.config={...config};}
  reset(){this.baseline=null;this.violationStarted=null;}
  start(features:EyeHeadFeatures|null){this.baseline=features?{...features}:null;this.violationStarted=null;}
  check(features:EyeHeadFeatures|null, now=performance.now()):HeadMovementViolation|null {
    if(!this.config.enabled||!this.baseline||!features){this.violationStarted=null;return null;}
    const b=this.baseline;
    const xy=Math.hypot(features.headX-b.headX,features.headY-b.headY);
    const dz=Math.abs(features.headZ-b.headZ);
    const angle=Math.max(angleDiff(features.headYaw,b.headYaw),angleDiff(features.headPitch,b.headPitch),angleDiff(features.headRoll,b.headRoll));
    let reason:string|null=null;
    if(xy>this.config.maxXY)reason=`head position changed by ${(xy*100).toFixed(1)}% of the camera frame`;
    else if(dz>this.config.maxZ)reason=`head-camera distance proxy changed by ${(dz*100).toFixed(1)}%`;
    else if(angle>this.config.maxAngleDeg)reason=`head angle changed by ${angle.toFixed(1)}°`;
    if(!reason){this.violationStarted=null;return null;}
    if(this.violationStarted===null){this.violationStarted=now;return null;}
    const durationMs=now-this.violationStarted;
    return durationMs>=this.config.graceMs?{reason,durationMs}:null;
  }
}
function angleDiff(a:number|null,b:number|null){return a===null||b===null?0:Math.abs(a-b);}
