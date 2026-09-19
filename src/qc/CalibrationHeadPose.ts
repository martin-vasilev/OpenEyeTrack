import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";

export interface HeadPoseAxisReference {
  median: number;
  robustSd: number;
}

export interface HeadPoseReference {
  sampleCount: number;
  headX: HeadPoseAxisReference;
  headY: HeadPoseAxisReference;
  headZ: HeadPoseAxisReference;
  headYaw: HeadPoseAxisReference | null;
  headPitch: HeadPoseAxisReference | null;
  headRoll: HeadPoseAxisReference | null;
}

type PoseKey = "headX" | "headY" | "headZ" | "headYaw" | "headPitch" | "headRoll";
const POSE_KEYS: PoseKey[] = ["headX", "headY", "headZ", "headYaw", "headPitch", "headRoll"];

export function buildHeadPoseReference(samples: EyeHeadFeatures[]): HeadPoseReference | null {
  if (!samples.length) return null;
  const refs = Object.fromEntries(POSE_KEYS.map((key) => [key, summarize(samples, key)])) as Record<PoseKey, HeadPoseAxisReference | null>;
  if (!refs.headX || !refs.headY || !refs.headZ) return null;
  return {
    sampleCount: samples.length,
    headX: refs.headX,
    headY: refs.headY,
    headZ: refs.headZ,
    headYaw: refs.headYaw,
    headPitch: refs.headPitch,
    headRoll: refs.headRoll
  };
}

/**
 * Robust multivariate distance from the head-pose distribution observed during calibration.
 * Values are in robust-SD units; ~1 means typical calibration variation, while larger values
 * indicate increasingly out-of-distribution head pose.
 */
export function headPoseDistance(features: EyeHeadFeatures | null, reference: HeadPoseReference | null): number | null {
  if (!features || !reference) return null;
  const z: number[] = [];
  for (const key of POSE_KEYS) {
    const ref = reference[key];
    const value = features[key];
    if (!ref || typeof value !== "number" || !Number.isFinite(value)) continue;
    z.push((value - ref.median) / ref.robustSd);
  }
  if (!z.length) return null;
  return Math.sqrt(z.reduce((sum, value) => sum + value * value, 0) / z.length);
}

function summarize(samples: EyeHeadFeatures[], key: PoseKey): HeadPoseAxisReference | null {
  const values = samples.map((sample) => sample[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  // 1.4826*MAD estimates SD for a normal distribution. A small floor prevents a nearly
  // motionless calibration from making tiny numerical changes look infinitely distant.
  const scaleFloor = key === "headZ" ? 0.002 : key === "headX" || key === "headY" ? 0.005 : 1;
  return { median: center, robustSd: Math.max(1.4826 * mad, scaleFloor) };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
