const DEFAULT_FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const DEFAULT_ORT_WASM_BASE_URL =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

export interface OpenEyeTrackAssetConfig {
  /** Directory containing the OpenEyeTrack asset folders. Defaults to the hosting page directory. */
  baseUrl?: string;
  /** Optional override for the models directory. */
  modelsBaseUrl?: string;
  /** Optional override for the MediaPipe Tasks Vision WASM directory. */
  mediapipeWasmBaseUrl?: string;
  /** Optional override for the ONNX Runtime WASM directory. */
  ortWasmBaseUrl?: string;
  /** Optional override for the ELG model. */
  elgModelUrl?: string;
  /** Optional override for the MobileGaze MobileOne S0 model. */
  mobileOneModelUrl?: string;
  /** Optional override for the MobileGaze ResNet-34 model. */
  resnet34ModelUrl?: string;
  /** Optional override for the MediaPipe face-landmarker model. */
  faceLandmarkerModelUrl?: string;
}

export interface ResolvedOpenEyeTrackAssets {
  baseUrl: string;
  modelsBaseUrl: string;
  mediapipeWasmBaseUrl: string;
  ortWasmBaseUrl: string;
  elgModelUrl: string;
  mobileOneModelUrl: string;
  resnet34ModelUrl: string;
  faceLandmarkerModelUrl: string;
}

export function resolveOpenEyeTrackAssets(
  config: OpenEyeTrackAssetConfig = {}
): ResolvedOpenEyeTrackAssets {
  const pageBase = defaultPageDirectory();
  const baseUrl = directoryUrl(config.baseUrl ?? pageBase, pageBase);
  const modelsBaseUrl = directoryUrl(config.modelsBaseUrl ?? "models/", baseUrl);
  const mediapipeWasmBaseUrl = directoryUrl(
    config.mediapipeWasmBaseUrl ?? "mediapipe/wasm/",
    baseUrl
  );
  const ortWasmBaseUrl = directoryUrl(
    config.ortWasmBaseUrl ?? DEFAULT_ORT_WASM_BASE_URL,
    baseUrl
  );

  return {
    baseUrl,
    modelsBaseUrl,
    mediapipeWasmBaseUrl,
    ortWasmBaseUrl,
    elgModelUrl: assetUrl(
      config.elgModelUrl ?? "gazeml_elg_i60x36_n32.onnx",
      modelsBaseUrl
    ),
    mobileOneModelUrl: assetUrl(
      config.mobileOneModelUrl ?? "mobileone_s0_gaze.onnx",
      modelsBaseUrl
    ),
    resnet34ModelUrl: assetUrl(
      config.resnet34ModelUrl ?? "resnet34_gaze.onnx",
      modelsBaseUrl
    ),
    faceLandmarkerModelUrl: assetUrl(
      config.faceLandmarkerModelUrl ?? DEFAULT_FACE_LANDMARKER_MODEL_URL,
      baseUrl
    )
  };
}

function defaultPageDirectory(): string {
  if (typeof document !== "undefined" && document.baseURI) {
    return new URL("./", document.baseURI).href;
  }
  return new URL("./", import.meta.url).href;
}

function directoryUrl(value: string, base: string): string {
  const url = new URL(value, base);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

function assetUrl(value: string, base: string): string {
  return new URL(value, base).href;
}
