import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export interface EyeHeadFeatures {
  leftIrisX: number;
  leftIrisY: number;
  rightIrisX: number;
  rightIrisY: number;
  leftIrisDiameter: number;
  rightIrisDiameter: number;
  headX: number;
  headY: number;
  headZ: number;
  headYaw: number | null;
  headPitch: number | null;
  headRoll: number | null;
}

// MediaPipe Face Landmarker iris indices (478-landmark model).
const LEFT_IRIS = [474, 475, 476, 477];
const RIGHT_IRIS = [469, 470, 471, 472];

function meanPoint(points: NormalizedLandmark[]) {
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
    z: points.reduce((s, p) => s + p.z, 0) / points.length
  };
}

function diameter(points: NormalizedLandmark[]): number {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) / 2;
}

export function extractEyeHeadFeatures(
  landmarks: NormalizedLandmark[],
  matrixData?: number[]
): EyeHeadFeatures | null {
  if (landmarks.length < 478) return null;

  const left = LEFT_IRIS.map((i) => landmarks[i]);
  const right = RIGHT_IRIS.map((i) => landmarks[i]);
  const lc = meanPoint(left);
  const rc = meanPoint(right);

  // Relative face position/depth proxies from normalized landmarks.
  const faceCenter = meanPoint([landmarks[1], landmarks[10], landmarks[152], landmarks[234], landmarks[454]]);
  const faceWidth = Math.hypot(
    landmarks[454].x - landmarks[234].x,
    landmarks[454].y - landmarks[234].y
  );

  let yaw: number | null = null;
  let pitch: number | null = null;
  let roll: number | null = null;

  // MediaPipe can return a 4x4 facial transformation matrix.
  // Convert its rotation block to Euler angles (degrees) for diagnostics.
  if (matrixData && matrixData.length >= 16) {
    const r00 = matrixData[0], r10 = matrixData[4], r20 = matrixData[8];
    const r21 = matrixData[9], r22 = matrixData[10];
    const sy = Math.sqrt(r00 * r00 + r10 * r10);
    const singular = sy < 1e-6;
    const x = singular ? Math.atan2(-matrixData[6], matrixData[5]) : Math.atan2(r21, r22);
    const y = Math.atan2(-r20, sy);
    const z = singular ? 0 : Math.atan2(r10, r00);
    pitch = x * 180 / Math.PI;
    yaw = y * 180 / Math.PI;
    roll = z * 180 / Math.PI;
  }

  return {
    leftIrisX: lc.x,
    leftIrisY: lc.y,
    rightIrisX: rc.x,
    rightIrisY: rc.y,
    leftIrisDiameter: diameter(left),
    rightIrisDiameter: diameter(right),
    headX: faceCenter.x,
    headY: faceCenter.y,
    headZ: faceWidth,
    headYaw: yaw,
    headPitch: pitch,
    headRoll: roll
  };
}
