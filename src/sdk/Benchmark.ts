import type { EyeTrackingSample } from "../types/Sample";

export interface OpenEyeTrackRecordingBenchmark {
  samples: number;
  durationMs: number | null;
  effectiveHz: number | null;
  medianIntervalMs: number | null;
  p95IntervalMs: number | null;
  validGazeSamples: number;
  validGazePercent: number | null;
}

export function summarizeRecordingBenchmark(
  samples: EyeTrackingSample[]
): OpenEyeTrackRecordingBenchmark {
  const timestamps = samples
    .map(sample => sample.timestamp)
    .filter((value): value is number => Number.isFinite(value))
    .sort((a, b) => a - b);

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const interval = timestamps[i] - timestamps[i - 1];
    if (interval > 0 && Number.isFinite(interval)) intervals.push(interval);
  }

  const durationMs = timestamps.length >= 2
    ? timestamps[timestamps.length - 1] - timestamps[0]
    : null;
  const effectiveHz = durationMs && durationMs > 0
    ? ((timestamps.length - 1) * 1000) / durationMs
    : null;
  const validGazeSamples = samples.filter(
    sample => Number.isFinite(sample.gazeX) && Number.isFinite(sample.gazeY)
  ).length;

  return {
    samples: samples.length,
    durationMs,
    effectiveHz,
    medianIntervalMs: percentile(intervals, .5),
    p95IntervalMs: percentile(intervals, .95),
    validGazeSamples,
    validGazePercent: samples.length ? validGazeSamples * 100 / samples.length : null
  };
}

function percentile(values: number[], proportion: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * proportion;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
