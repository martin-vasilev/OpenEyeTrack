import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let landmarker: FaceLandmarker | null = null;

type WorkerRequest =
  | { type: "initialize" }
  | { type: "detect"; bitmap: ImageBitmap; timestampMs: number; sequenceId: number; postedAtMs: number; dispatchStartedMs: number };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === "initialize") {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
      );
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
          delegate: "CPU"
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      self.postMessage({ type: "initialized" });
      return;
    }

    if (!landmarker) throw new Error("Face landmarker worker is not initialized.");

    const workerReceivedMs = performance.now();
    const started = performance.now();
    const result = landmarker.detectForVideo(message.bitmap, message.timestampMs);
    const inferenceEndedMs = performance.now();
    const inferenceMs = inferenceEndedMs - started;
    message.bitmap.close();
    const workerSentMs = performance.now();

    self.postMessage({
      type: "result",
      sequenceId: message.sequenceId,
      dispatchStartedMs: message.dispatchStartedMs,
      postedAtMs: message.postedAtMs,
      workerReceivedMs,
      workerStartedMs: started,
      workerEndedMs: inferenceEndedMs,
      workerSentMs,
      inferenceMs,
      faceLandmarks: result.faceLandmarks,
      facialTransformationMatrixes: result.facialTransformationMatrixes?.map(matrix => ({
        rows: matrix.rows,
        columns: matrix.columns,
        data: Array.from(matrix.data)
      })) ?? []
    });
  } catch (error) {
    if (message.type === "detect") message.bitmap.close();
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
};
