export interface EyeTrackingSample {
  timestamp: number;
  frameId: number;

  // Core gaze / eye / head data
  gazeXRaw: number | null; gazeYRaw: number | null; gazeX: number | null; gazeY: number | null;
  gazeConfidence: number | null; gazeOutlier: boolean | null; gazeRawDeviationPx: number | null;
  pupilLeft: number | null; pupilRight: number | null;
  headX: number | null; headY: number | null; headZ: number | null; headYaw: number | null; headPitch: number | null; headRoll: number | null;
  headPoseDistanceFromCalibration: number | null;
  eyeConfidence: number | null;
  elgLeftRelX: number | null; elgLeftRelY: number | null; elgRightRelX: number | null; elgRightRelY: number | null;
  elgLeftConfidence: number | null; elgRightConfidence: number | null;
  elgLeftRelXRaw: number | null; elgLeftRelYRaw: number | null; elgRightRelXRaw: number | null; elgRightRelYRaw: number | null;
  elgBinocularReliability: number | null;
  trial: string | null; event: string | null; calibrationId: string | null; calibrationPoints: number | null;
  calibrationRepetitions: number | null; calibrationSettleMs: number | null; calibrationSampleMs: number | null;
  calibrationRandomized: boolean | null; calibrationObservations: number | null;
  validationMeanPx: number | null; validationMedianPx: number | null; validationRmsePx: number | null;
  validationPrecisionRmsS2SPx: number | null; validationPrecisionSdPx: number | null; validationDataLoss: number | null;
  validationValidPoints: number | null;
  calibrationHeadReferenceSamples: number | null;
  calibrationHeadX: number | null; calibrationHeadXSd: number | null; calibrationHeadY: number | null; calibrationHeadYSd: number | null;
  calibrationHeadZ: number | null; calibrationHeadZSd: number | null; calibrationHeadYaw: number | null; calibrationHeadYawSd: number | null;
  calibrationHeadPitch: number | null; calibrationHeadPitchSd: number | null; calibrationHeadRoll: number | null; calibrationHeadRollSd: number | null;

  // Optional developer diagnostics. These keys are omitted entirely from normal recordings.
  cameraTrackFps?: number | null; videoCallbackIntervalMs?: number | null; videoPresentedFrameDelta?: number | null; videoMissedPresentedFramesTotal?: number;
  pipelineTotalMs?: number | null; mediaPipeDispatchToBitmapMs?: number | null; mediaPipeBitmapToPostMs?: number | null; mediaPipeWorkerQueueMs?: number | null;
  mediaPipeWorkerInferenceMs?: number | null; mediaPipeWorkerReturnMs?: number | null; mediaPipeEndToEndMs?: number | null; mediaPipeResultAgeMs?: number | null; mediaPipeSequenceId?: number | null;
  elgEnqueueMs?: number | null; featureExtractionMs?: number | null; gazePredictionMs?: number | null; overlayRenderMs?: number | null; elgAcquisitionMode?: string | null;
  elgInferenceMs?: number | null; elgAgeMs?: number | null; elgSequenceId?: number | null; elgAcquisitionTimestampMs?: number | null; elgProcessedTimestampMs?: number | null;
  elgLatencyMs?: number | null; elgQueueDepth?: number | null; elgCropPreprocessMs?: number | null; elgQueueWaitMs?: number | null; elgTensorSetupMs?: number | null; elgOnnxInferenceMs?: number | null; elgDecodeMs?: number | null;
  elgLeftCropTotalMs?: number | null; elgRightCropTotalMs?: number | null;
  elgLeftGeometryMs?: number | null; elgRightGeometryMs?: number | null;
  elgLeftCanvasDrawMs?: number | null; elgRightCanvasDrawMs?: number | null;
  elgLeftPixelReadMs?: number | null; elgRightPixelReadMs?: number | null;
  elgLeftGrayHistogramMs?: number | null; elgRightGrayHistogramMs?: number | null;
  elgLeftCdfMs?: number | null; elgRightCdfMs?: number | null;
  elgLeftEqualizeNormalizeMs?: number | null; elgRightEqualizeNormalizeMs?: number | null;
  elgInputBufferAcquireMs?: number | null;
}
