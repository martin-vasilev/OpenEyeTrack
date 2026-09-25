import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type NormalizedLandmark
} from "@mediapipe/tasks-vision";

export interface FaceFeatures {
  landmarks: NormalizedLandmark[];
  timestamp: number;
}

export class FaceFeatureTracker {
  private landmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;
  private cameraFrameCount = 0;
  private lastResult: FaceLandmarkerResult | null = null;
  private readonly mediaPipeFrameStride = 2;

  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
    );

    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.lastVideoTime = -1;
    this.cameraFrameCount = 0;
    this.lastResult = null;
  }

  detect(video: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult | null {
    if (!this.landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
    if (video.currentTime === this.lastVideoTime) return null;

    this.lastVideoTime = video.currentTime;
    const frameIndex = this.cameraFrameCount++;

    // Experimental half-rate MediaPipe mode:
    // run the expensive face-landmarker inference on every second unique camera
    // frame (~15 Hz for a 30-Hz webcam). On the intervening frame, reuse the
    // most recent face landmarks so the downstream ELG/gaze pipeline can still
    // acquire/process that camera frame rather than being throttled to 15 Hz.
    const shouldRunMediaPipe =
      this.lastResult === null || frameIndex % this.mediaPipeFrameStride === 0;

    if (!shouldRunMediaPipe) return this.lastResult;

    this.lastResult = this.landmarker.detectForVideo(video, timestampMs);
    return this.lastResult;
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.lastVideoTime = -1;
    this.cameraFrameCount = 0;
    this.lastResult = null;
  }
}
