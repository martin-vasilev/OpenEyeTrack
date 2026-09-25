export interface ElgDiagnostics {
  cropPreprocessMs: number | null;
  firstEye: "left" | "right" | null;
  leftCropTotalMs: number | null;
  rightCropTotalMs: number | null;
  leftGeometryMs: number | null;
  rightGeometryMs: number | null;
  leftCanvasDrawMs: number | null;
  rightCanvasDrawMs: number | null;
  leftPixelReadMs: number | null;
  rightPixelReadMs: number | null;
  leftGrayHistogramMs: number | null;
  rightGrayHistogramMs: number | null;
  leftCdfMs: number | null;
  rightCdfMs: number | null;
  leftEqualizeNormalizeMs: number | null;
  rightEqualizeNormalizeMs: number | null;
  inputBufferAcquireMs: number | null;
  queueWaitMs: number | null;
  tensorSetupMs: number | null;
  onnxInferenceMs: number | null;
  decodeMs: number | null;
  totalLatencyMs: number | null;
  sequenceId: number | null;
}

const empty = (): ElgDiagnostics => ({
  cropPreprocessMs: null,
  firstEye: null,
  leftCropTotalMs: null,
  rightCropTotalMs: null,
  leftGeometryMs: null,
  rightGeometryMs: null,
  leftCanvasDrawMs: null,
  rightCanvasDrawMs: null,
  leftPixelReadMs: null,
  rightPixelReadMs: null,
  leftGrayHistogramMs: null,
  rightGrayHistogramMs: null,
  leftCdfMs: null,
  rightCdfMs: null,
  leftEqualizeNormalizeMs: null,
  rightEqualizeNormalizeMs: null,
  inputBufferAcquireMs: null,
  queueWaitMs: null,
  tensorSetupMs: null,
  onnxInferenceMs: null,
  decodeMs: null,
  totalLatencyMs: null,
  sequenceId: null
});

let diagnostics: ElgDiagnostics = empty();

export function updateElgDiagnostics(next: ElgDiagnostics): void {
  diagnostics = { ...next };
}

export function getElgDiagnostics(): ElgDiagnostics {
  return { ...diagnostics };
}

export function resetElgDiagnostics(): void {
  diagnostics = empty();
}
