export interface MediaPipeWorkerDiagnostics {
  dispatchToBitmapMs: number | null;
  bitmapToPostMs: number | null;
  workerQueueMs: number | null;
  workerInferenceMs: number | null;
  workerReturnMs: number | null;
  endToEndMs: number | null;
  resultAgeMs: number | null;
  sequenceId: number | null;
}

const diagnostics: MediaPipeWorkerDiagnostics = {
  dispatchToBitmapMs: null, bitmapToPostMs: null, workerQueueMs: null,
  workerInferenceMs: null, workerReturnMs: null, endToEndMs: null,
  resultAgeMs: null, sequenceId: null
};
let lastResultReceivedMs: number | null = null;

export function updateMediaPipeDiagnostics(update: Partial<MediaPipeWorkerDiagnostics>): void {
  Object.assign(diagnostics, update);
  if (update.sequenceId !== undefined && update.sequenceId !== null) lastResultReceivedMs = performance.now();
}

export function getMediaPipeDiagnostics(): MediaPipeWorkerDiagnostics {
  return {
    ...diagnostics,
    resultAgeMs: lastResultReceivedMs === null ? null : Math.max(0, performance.now() - lastResultReceivedMs)
  };
}

export function resetMediaPipeDiagnostics(): void {
  diagnostics.dispatchToBitmapMs = null; diagnostics.bitmapToPostMs = null;
  diagnostics.workerQueueMs = null; diagnostics.workerInferenceMs = null;
  diagnostics.workerReturnMs = null; diagnostics.endToEndMs = null;
  diagnostics.resultAgeMs = null; diagnostics.sequenceId = null;
  lastResultReceivedMs = null;
}
