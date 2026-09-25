export interface ElgDiagnostics {
  cropPreprocessMs: number | null;
  queueWaitMs: number | null;
  tensorSetupMs: number | null;
  onnxInferenceMs: number | null;
  decodeMs: number | null;
  totalLatencyMs: number | null;
  sequenceId: number | null;
}

const empty = (): ElgDiagnostics => ({
  cropPreprocessMs: null,
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
