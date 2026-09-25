import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { resetMediaPipeDiagnostics, updateMediaPipeDiagnostics } from "./MediaPipeDiagnostics";

export interface FaceFeatures {
  landmarks: NormalizedLandmark[];
  timestamp: number;
}

interface CachedFaceResult {
  faceLandmarks: NormalizedLandmark[][];
  facialTransformationMatrixes: Array<{ rows: number; columns: number; data: number[] }>;
}

type WorkerResponse =
  | { type: "initialized" }
  | {
      type: "result";
      sequenceId: number;
      dispatchStartedMs: number;
      postedAtMs: number;
      workerReceivedMs: number;
      workerStartedMs: number;
      workerEndedMs: number;
      workerSentMs: number;
      inferenceMs: number;
      faceLandmarks: NormalizedLandmark[][];
      facialTransformationMatrixes: CachedFaceResult["facialTransformationMatrixes"];
    }
  | { type: "error"; message: string };

export class FaceFeatureTracker {
  private worker: Worker | null = null;
  private initialized = false;
  private initializePromise: Promise<void> | null = null;
  private resolveInitialize: (() => void) | null = null;
  private rejectInitialize: ((reason?: unknown) => void) | null = null;
  private latestResult: CachedFaceResult | null = null;
  private detectionInFlight = false;
  private lastDispatchMs = -Infinity;
  private lastVideoTime = -1;
  private readonly mediaPipeIntervalMs = 1000 / 15;
  private lastInferenceMs: number | null = null;
  private sequenceId = 0;
  private bitmapReadyBySequence = new Map<number, number>();

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;
    resetMediaPipeDiagnostics();
    this.worker = new Worker(new URL("./FaceLandmarker.worker.ts", import.meta.url), { type: "module" });
    this.initializePromise = new Promise<void>((resolve, reject) => {
      this.resolveInitialize = resolve;
      this.rejectInitialize = reject;
    });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "initialized") {
        this.initialized = true;
        this.resolveInitialize?.();
        this.resolveInitialize = null;
        this.rejectInitialize = null;
        return;
      }
      if (message.type === "result") {
        const receivedAtMs = performance.now();
        this.latestResult = { faceLandmarks: message.faceLandmarks, facialTransformationMatrixes: message.facialTransformationMatrixes };
        this.lastInferenceMs = message.inferenceMs;
        const bitmapReadyMs = this.bitmapReadyBySequence.get(message.sequenceId) ?? message.postedAtMs;
        this.bitmapReadyBySequence.delete(message.sequenceId);
        updateMediaPipeDiagnostics({
          dispatchToBitmapMs: bitmapReadyMs - message.dispatchStartedMs,
          bitmapToPostMs: message.postedAtMs - bitmapReadyMs,
          workerQueueMs: message.workerStartedMs - message.postedAtMs,
          workerInferenceMs: message.inferenceMs,
          workerReturnMs: receivedAtMs - message.workerSentMs,
          endToEndMs: receivedAtMs - message.dispatchStartedMs,
          resultAgeMs: 0,
          sequenceId: message.sequenceId
        });
        this.detectionInFlight = false;
        return;
      }
      console.warn("[OpenEyeTrack MediaPipe worker]", message.message);
      this.detectionInFlight = false;
      if (!this.initialized) {
        this.rejectInitialize?.(new Error(message.message));
        this.resolveInitialize = null;
        this.rejectInitialize = null;
        this.initializePromise = null;
      }
    };
    this.worker.onerror = event => {
      this.detectionInFlight = false;
      const error = new Error(event.message || "MediaPipe worker failed.");
      if (!this.initialized) {
        this.rejectInitialize?.(error);
        this.resolveInitialize = null;
        this.rejectInitialize = null;
        this.initializePromise = null;
      } else console.error("[OpenEyeTrack MediaPipe worker]", error);
    };
    this.worker.postMessage({ type: "initialize" });
    return this.initializePromise;
  }

  detect(video: HTMLVideoElement, _timestampMs: number): CachedFaceResult | null {
    if (!this.worker || !this.initialized || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return this.latestResult;
    const videoTime = video.currentTime;
    if (videoTime !== this.lastVideoTime) {
      this.lastVideoTime = videoTime;
      const now = performance.now();
      if (!this.detectionInFlight && now - this.lastDispatchMs >= this.mediaPipeIntervalMs) {
        this.detectionInFlight = true;
        this.lastDispatchMs = now;
        const sequenceId = ++this.sequenceId;
        const dispatchStartedMs = performance.now();
        void createImageBitmap(video)
          .then(bitmap => {
            const bitmapReadyMs = performance.now();
            this.bitmapReadyBySequence.set(sequenceId, bitmapReadyMs);
            if (!this.worker || !this.initialized) {
              bitmap.close(); this.detectionInFlight = false; return;
            }
            const postedAtMs = performance.now();
            this.worker.postMessage({ type: "detect", bitmap, timestampMs: now, sequenceId, postedAtMs, dispatchStartedMs }, [bitmap]);
          })
          .catch(error => {
            this.detectionInFlight = false;
            console.warn("[OpenEyeTrack MediaPipe] Could not acquire worker frame", error);
          });
      }
    }
    return this.latestResult;
  }

  getLastInferenceMs(): number | null { return this.lastInferenceMs; }

  close(): void {
    this.worker?.terminate();
    this.worker = null; this.initialized = false; this.initializePromise = null;
    this.resolveInitialize = null; this.rejectInitialize = null; this.latestResult = null;
    this.detectionInFlight = false; this.lastDispatchMs = -Infinity; this.lastVideoTime = -1;
    this.lastInferenceMs = null; this.sequenceId = 0; this.bitmapReadyBySequence.clear();
    resetMediaPipeDiagnostics();
  }
}
