import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { CalibrationHeadPose } from "../calibration/CalibrationController";
import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";

export interface HeadPositionStatus {
  ready: boolean;
  nearReady: boolean;
  message: string;
}

export interface FaceBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PoseAlignmentStatus {
  ready: boolean;
  centreErrorX: number;
  centreErrorY: number;
  widthError: number;
  heightError: number;
}

/**
 * Initial neutral-position quality check used before calibration.
 *
 * Thresholds are inherited from the working OpenEyeTrack demo so moving this
 * logic into the SDK does not change the current positioning criterion.
 */
export function evaluateNeutralHeadPosition(
  features: EyeHeadFeatures | null,
  relaxed = false
): HeadPositionStatus {
  if (!features) {
    return { ready: false, nearReady: false, message: "Position your face inside the guide" };
  }

  const dx = features.headX - .5;
  const dy = features.headY - .49;
  const size = features.headZ;
  const xyLimit = relaxed ? .16 : .14;
  const distanceMin = relaxed ? .12 : .13;
  const distanceMax = relaxed ? .54 : .52;
  const yawLimit = relaxed ? 18 : 15;
  const pitchLimit = relaxed ? 18 : 14;
  const rollLimit = relaxed ? 18 : 15;

  const centered = Math.abs(dx) <= xyLimit && Math.abs(dy) <= xyLimit;
  const distanceOk = size >= distanceMin && size <= distanceMax;
  const yawOk = features.headYaw === null || Math.abs(features.headYaw) <= yawLimit;
  const pitchOk = features.headPitch === null || Math.abs(features.headPitch) <= pitchLimit;
  const rollOk = features.headRoll === null || Math.abs(features.headRoll) <= rollLimit;

  const ready = centered && distanceOk && yawOk && pitchOk && rollOk;
  const nearReady =
    Math.abs(dx) <= .19 &&
    Math.abs(dy) <= .19 &&
    size >= .10 &&
    size <= .58 &&
    (features.headYaw === null || Math.abs(features.headYaw) <= 22) &&
    (features.headPitch === null || Math.abs(features.headPitch) <= 22) &&
    (features.headRoll === null || Math.abs(features.headRoll) <= 22);

  if (!centered) {
    const horizontal = dx < -.10 ? "Move slightly to your right" : dx > .10 ? "Move slightly to your left" : "";
    const vertical = dy < -.10 ? "Move slightly down" : dy > .10 ? "Move slightly up" : "";
    return {
      ready,
      nearReady,
      message: [horizontal, vertical].filter(Boolean).join(" · ") || "Centre your face"
    };
  }
  if (!distanceOk) {
    return { ready, nearReady, message: size < distanceMin ? "Move a little closer" : "Move a little farther away" };
  }
  if (!pitchOk) {
    return {
      ready,
      nearReady,
      message: (features.headPitch ?? 0) > 0 ? "Lower your chin slightly" : "Raise your chin slightly"
    };
  }
  if (!yawOk) {
    return {
      ready,
      nearReady,
      message: (features.headYaw ?? 0) > 0 ? "Turn your face slightly left" : "Turn your face slightly right"
    };
  }
  if (!rollOk) return { ready, nearReady, message: "Keep your head level" };
  return { ready, nearReady, message: "Good position — hold briefly" };
}

export function faceBounds(points: NormalizedLandmark[]): FaceBounds {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys)
  };
}

/**
 * Compare the current face with a translated target derived from the baseline
 * neutral face. The translation and tolerances match the current demo.
 */
export function evaluatePoseAlignment(
  baseline: NormalizedLandmark[] | null,
  current: NormalizedLandmark[] | null,
  pose: CalibrationHeadPose
): PoseAlignmentStatus {
  if (!baseline || !current) {
    return {
      ready: false,
      centreErrorX: Infinity,
      centreErrorY: Infinity,
      widthError: Infinity,
      heightError: Infinity
    };
  }

  const base = faceBounds(baseline);
  const live = faceBounds(current);
  const delta = .075;
  const targetX = base.x + (pose === "left" ? -delta : pose === "right" ? delta : 0);
  const targetY = base.y + (pose === "up" ? -delta : pose === "down" ? delta : 0);

  const centreErrorX = Math.abs(live.x - targetX);
  const centreErrorY = Math.abs(live.y - targetY);
  const widthError = Math.abs(live.w - base.w);
  const heightError = Math.abs(live.h - base.h);

  return {
    ready:
      centreErrorX < .025 &&
      centreErrorY < .025 &&
      widthError < .045 &&
      heightError < .055,
    centreErrorX,
    centreErrorY,
    widthError,
    heightError
  };
}

export function drawPoseAlignmentGuide(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  baseline: NormalizedLandmark[] | null,
  current: NormalizedLandmark[] | null,
  pose: CalibrationHeadPose
): void {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 360;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);

  const delta = .075;
  const dx = pose === "left" ? -delta : pose === "right" ? delta : 0;
  const dy = pose === "up" ? -delta : pose === "down" ? delta : 0;

  const draw = (
    points: NormalizedLandmark[] | null,
    fill: string,
    radius: number,
    shiftX = 0,
    shiftY = 0
  ) => {
    if (!points) return;
    context.fillStyle = fill;
    context.strokeStyle = "rgba(15,23,42,.35)";
    context.lineWidth = .65;
    for (const point of points) {
      context.beginPath();
      context.arc(
        (1 - (point.x + shiftX)) * width,
        (point.y + shiftY) * height,
        radius,
        0,
        Math.PI * 2
      );
      context.fill();
      context.stroke();
    }
  };

  draw(baseline, "rgba(245,158,11,.82)", 2.15, dx, dy);
  draw(current, "rgba(14,165,233,.92)", 1.75);
}

export function cloneLandmarks(
  points: NormalizedLandmark[] | null
): NormalizedLandmark[] | null {
  return points ? points.map(point => ({ ...point })) : null;
}
