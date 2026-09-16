export interface EyeTrackingSample {
  timestamp: number;
  frameId: number;
  gazeX: number | null;
  gazeY: number | null;
  gazeConfidence: number | null;
  pupilLeft: number | null;
  pupilRight: number | null;
  pupilLeftConfidence: number | null;
  pupilRightConfidence: number | null;
  headX: number | null;
  headY: number | null;
  headZ: number | null;
  headYaw: number | null;
  headPitch: number | null;
  headRoll: number | null;
  faceConfidence: number | null;
  eyeConfidence: number | null;
  trial: string | null;
  event: string | null;
}
