import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { CalibrationConfig, CalibrationHeadPose, ValidationResult } from "../calibration/CalibrationController";
import type { EyeHeadFeatures } from "../features/EyeHeadFeatures";
import {
  drawPoseAlignmentGuide,
  evaluateNeutralHeadPosition,
  evaluatePoseAlignment
} from "./HeadPositioning";

export class OpenEyeTrackSetupCancelledError extends Error {
  constructor() {
    super("OpenEyeTrack setup was cancelled.");
    this.name = "OpenEyeTrackSetupCancelledError";
  }
}

/**
 * Self-contained, host-agnostic setup overlay for experiment integrations.
 *
 * It deliberately uses injected/scoped CSS rather than the demo stylesheet so
 * the SDK can be embedded in arbitrary experiment pages.
 */
export class DefaultSetupUI {
  readonly target: HTMLDivElement;

  private readonly root: HTMLDivElement;
  private readonly preview: HTMLVideoElement;
  private readonly poseCanvas: HTMLCanvasElement;
  private readonly card: HTMLDivElement;
  private readonly eyebrow: HTMLParagraphElement;
  private readonly title: HTMLHeadingElement;
  private readonly message: HTMLParagraphElement;
  private readonly metrics: HTMLDivElement;
  private readonly primary: HTMLButtonElement;
  private readonly secondary: HTMLButtonElement;
  private readonly progress: HTMLDivElement;
  private originalTargetParent: Node | null = null;
  private originalTargetNextSibling: Node | null = null;
  private readonly ownsTarget: boolean;

  constructor(
    private readonly sourceVideo: HTMLVideoElement,
    target?: HTMLElement
  ) {
    this.ownsTarget = !target;
    this.root = document.createElement("div");
    this.root.className = "oet-sdk-setup-root";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.innerHTML = `
      <style>
        .oet-sdk-setup-root{position:fixed;inset:0;z-index:2147483000;background:#f4f6f8;color:#172033;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-sizing:border-box}
        .oet-sdk-setup-root *{box-sizing:border-box}
        .oet-sdk-setup-shell{position:absolute;inset:0;display:grid;place-items:center;padding:24px}
        .oet-sdk-setup-card{width:min(760px,100%);max-height:calc(100vh - 48px);overflow:auto;background:white;border:1px solid #dbe2ea;border-radius:22px;padding:30px;box-shadow:0 24px 70px rgba(15,23,42,.16)}
        .oet-sdk-eyebrow{margin:0 0 8px;color:#596579;font-weight:800;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase}
        .oet-sdk-title{margin:0 0 10px;font-size:clamp(1.7rem,4vw,2.6rem);line-height:1.1}
        .oet-sdk-message{margin:0;color:#46546a;font-size:1.02rem;line-height:1.55}
        .oet-sdk-preview-wrap{margin:22px auto 0;width:min(560px,100%);aspect-ratio:16/9;border-radius:16px;background:#111827;overflow:hidden;position:relative}
        .oet-sdk-preview{width:100%;height:100%;object-fit:contain;transform:scaleX(-1)}
        .oet-sdk-pose-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
        .oet-sdk-readiness{position:absolute;left:12px;right:12px;bottom:12px;padding:8px 11px;border-radius:10px;background:rgba(15,23,42,.86);color:white;font-weight:750;font-size:.85rem;text-align:center}
        .oet-sdk-readiness.ready{background:rgba(4,120,87,.92)}
        .oet-sdk-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:24px}
        .oet-sdk-button{appearance:none;border:1px solid #cbd5e1;background:white;color:#172033;padding:.75rem 1rem;border-radius:10px;font:inherit;font-weight:800;cursor:pointer}
        .oet-sdk-button-primary{background:#172033;color:white;border-color:#172033}
        .oet-sdk-button:disabled{opacity:.45;cursor:not-allowed}
        .oet-sdk-progress{position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:2147483200;max-width:calc(100vw - 32px);padding:10px 15px;border-radius:999px;background:rgba(15,23,42,.9);color:white;font-size:.9rem;font-weight:800;text-align:center;box-shadow:0 8px 30px rgba(15,23,42,.18)}
        .oet-sdk-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:22px}
        .oet-sdk-metric{border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#f8fafc}
        .oet-sdk-metric span{display:block;color:#64748b;font-size:.78rem;font-weight:700}
        .oet-sdk-metric strong{display:block;margin-top:4px;font-size:1.15rem}
        .oet-sdk-target{--target-size:34px;--target-color:#172033;position:fixed;z-index:2147483300;width:var(--target-size);height:var(--target-size);margin-left:calc(var(--target-size)/-2);margin-top:calc(var(--target-size)/-2);box-sizing:border-box}
        .oet-sdk-target[data-shape="bullseye"],.oet-sdk-target[data-shape="circle"]{border:3px solid var(--target-color);border-radius:50%;background:white}
        .oet-sdk-target[data-shape="bullseye"] span{position:absolute;width:22%;height:22%;left:39%;top:39%;border-radius:50%;background:var(--target-color)}
        .oet-sdk-target[data-shape="circle"] span{display:none}
        .oet-sdk-target[data-shape="dot"]{border-radius:50%;background:var(--target-color);transform:scale(.45)}
        .oet-sdk-target[data-shape="dot"] span{display:none}
        .oet-sdk-target[data-shape="cross"]::before,.oet-sdk-target[data-shape="cross"]::after{content:"";position:absolute;background:var(--target-color)}
        .oet-sdk-target[data-shape="cross"]::before{left:45%;top:0;width:10%;height:100%}
        .oet-sdk-target[data-shape="cross"]::after{left:0;top:45%;width:100%;height:10%}
        .oet-sdk-target[data-shape="cross"] span{display:none}
        .oet-sdk-setup-root[hidden]{display:none!important}
        @media(max-width:600px){.oet-sdk-setup-card{padding:22px}.oet-sdk-metrics{grid-template-columns:1fr}}
      </style>
      <div class="oet-sdk-setup-shell">
        <div class="oet-sdk-setup-card">
          <p class="oet-sdk-eyebrow"></p>
          <h1 class="oet-sdk-title"></h1>
          <p class="oet-sdk-message"></p>
          <div class="oet-sdk-preview-wrap">
            <video class="oet-sdk-preview" autoplay muted playsinline></video>
            <canvas class="oet-sdk-pose-canvas" hidden></canvas>
            <div class="oet-sdk-readiness">Checking camera…</div>
          </div>
          <div class="oet-sdk-metrics" hidden></div>
          <div class="oet-sdk-actions">
            <button class="oet-sdk-button oet-sdk-secondary" type="button">Cancel</button>
            <button class="oet-sdk-button oet-sdk-button-primary oet-sdk-primary" type="button">Continue</button>
          </div>
        </div>
      </div>
      <div class="oet-sdk-progress" hidden></div>
    `;

    this.preview = this.root.querySelector<HTMLVideoElement>(".oet-sdk-preview")!;
    this.poseCanvas = this.root.querySelector<HTMLCanvasElement>(".oet-sdk-pose-canvas")!;
    this.card = this.root.querySelector<HTMLDivElement>(".oet-sdk-setup-card")!;
    this.eyebrow = this.root.querySelector<HTMLParagraphElement>(".oet-sdk-eyebrow")!;
    this.title = this.root.querySelector<HTMLHeadingElement>(".oet-sdk-title")!;
    this.message = this.root.querySelector<HTMLParagraphElement>(".oet-sdk-message")!;
    this.metrics = this.root.querySelector<HTMLDivElement>(".oet-sdk-metrics")!;
    this.primary = this.root.querySelector<HTMLButtonElement>(".oet-sdk-primary")!;
    this.secondary = this.root.querySelector<HTMLButtonElement>(".oet-sdk-secondary")!;
    this.progress = this.root.querySelector<HTMLDivElement>(".oet-sdk-progress")!;

    if (target) {
      this.target = target as HTMLDivElement;
    } else {
      this.target = document.createElement("div");
      this.target.innerHTML = "<span></span>";
      this.target.hidden = true;
    }
    this.target.classList.add("oet-sdk-target");
  }

  async intro(
    config: CalibrationConfig,
    getFeatures: () => EyeHeadFeatures | null,
    detectedFaces: () => number
  ): Promise<void> {
    this.mount();
    this.root.hidden = false;
    this.card.hidden = false;
    this.progress.hidden = true;
    this.metrics.hidden = true;
    this.preview.parentElement!.hidden = false;
    this.poseCanvas.hidden = true;
    this.eyebrow.textContent = "OpenEyeTrack setup";
    this.title.textContent = "Position yourself for eye tracking";
    this.message.textContent =
      `Keep your face centred in the camera, remain at a comfortable distance, and keep this browser window in the same position. Setup will use ${config.points} calibration targets across ${config.repetitions} run${config.repetitions === 1 ? "" : "s"}.`;
    this.primary.textContent = "Begin setup";
    this.secondary.textContent = "Cancel";
    this.secondary.hidden = false;
    this.primary.disabled = true;
    this.syncPreview();

    const readiness = this.root.querySelector<HTMLDivElement>(".oet-sdk-readiness")!;
    let readySince: number | null = null;
    let latched = false;

    const refresh = () => {
      const faces = detectedFaces();
      const position = evaluateNeutralHeadPosition(getFeatures(), latched);
      const acceptable = faces === 1 && position.ready;

      if (acceptable) {
        if (readySince === null) readySince = performance.now();
        if (performance.now() - readySince >= 500) latched = true;
      } else if (!position.nearReady) {
        readySince = null;
        latched = false;
      }

      const ready = faces === 1 && latched;
      this.primary.disabled = !ready;
      readiness.classList.toggle("ready", ready || acceptable);

      if (faces > 1) readiness.textContent = "Please keep only one face in view";
      else if (faces === 0) readiness.textContent = "Position your face inside the guide";
      else if (ready) readiness.textContent = "Good position — continue when ready";
      else if (acceptable) readiness.textContent = "Good position — hold…";
      else readiness.textContent = position.message;
    };

    refresh();
    const timer = window.setInterval(refresh, 100);

    try {
      await this.waitForPrimaryOrCancel();
    } finally {
      clearInterval(timer);
    }
  }

  showProgress(message: string): void {
    this.mount();
    this.root.hidden = false;
    this.card.hidden = true;
    this.progress.hidden = false;
    this.progress.textContent = message;
  }

  showCalibration(round: number, total: number, pose: CalibrationHeadPose): void {
    this.mount();
    this.primary.hidden = false;
    this.poseCanvas.hidden = true;
    this.root.hidden = false;
    this.card.hidden = true;
    this.progress.hidden = false;
    this.progress.textContent = `Calibration run ${round + 1} of ${total} · ${poseLabel(pose)}`;
  }

  async guidePose(
    round: number,
    total: number,
    pose: CalibrationHeadPose,
    baseline: NormalizedLandmark[] | null,
    getCurrentFace: () => NormalizedLandmark[] | null
  ): Promise<void> {
    if (!baseline) {
      await this.promptPose(round, total, pose);
      return;
    }

    this.mount();
    this.root.hidden = false;
    this.card.hidden = false;
    this.progress.hidden = true;
    this.metrics.hidden = true;
    this.preview.parentElement!.hidden = false;
    this.poseCanvas.hidden = false;
    this.eyebrow.textContent = `Calibration run ${round + 1} of ${total}`;
    this.title.textContent = poseTitle(pose);
    this.message.textContent =
      `${poseInstruction(pose)} Align the blue live mesh with the amber target mesh, then hold still.`;
    this.primary.hidden = true;
    this.secondary.hidden = true;
    this.syncPreview();

    const readiness = this.root.querySelector<HTMLDivElement>(".oet-sdk-readiness")!;
    readiness.classList.remove("ready");
    readiness.textContent = "Align your face with the amber target mesh";

    await new Promise<void>(resolve => {
      let readySince: number | null = null;
      let animationId = 0;

      const tick = () => {
        const current = getCurrentFace();
        drawPoseAlignmentGuide(this.poseCanvas, this.preview, baseline, current, pose);
        const alignment = evaluatePoseAlignment(baseline, current, pose);

        if (alignment.ready) {
          if (readySince === null) readySince = performance.now();
          readiness.classList.add("ready");
          readiness.textContent = "Good position — hold…";
          if (performance.now() - readySince >= 650) {
            cancelAnimationFrame(animationId);
            this.poseCanvas.hidden = true;
            this.primary.hidden = false;
            this.showCalibration(round, total, pose);
            resolve();
            return;
          }
        } else {
          readySince = null;
          readiness.classList.remove("ready");
          readiness.textContent = current
            ? "Align your face with the amber target mesh"
            : "Keep your face visible to the camera";
        }

        animationId = requestAnimationFrame(tick);
      };

      tick();
    });
  }

  async promptPose(round: number, total: number, pose: CalibrationHeadPose): Promise<void> {
    this.mount();
    this.root.hidden = false;
    this.card.hidden = false;
    this.progress.hidden = true;
    this.metrics.hidden = true;
    this.preview.parentElement!.hidden = false;
    this.poseCanvas.hidden = true;
    this.eyebrow.textContent = `Calibration run ${round + 1} of ${total}`;
    this.title.textContent = poseTitle(pose);
    this.message.textContent = poseInstruction(pose);
    this.primary.hidden = false;
    this.primary.textContent = "Continue";
    this.secondary.hidden = true;
    this.primary.disabled = false;
    this.syncPreview();
    await this.waitForPrimaryOrCancel(false);
    this.showCalibration(round, total, pose);
  }

  async promptPursuit(): Promise<void> {
    this.mount();
    this.primary.hidden = false;
    this.poseCanvas.hidden = true;
    this.root.hidden = false;
    this.card.hidden = false;
    this.progress.hidden = true;
    this.metrics.hidden = true;
    this.preview.parentElement!.hidden = true;
    this.eyebrow.textContent = "Calibration";
    this.title.textContent = "Follow the moving target";
    this.message.textContent =
      "Keep your head still and follow the target smoothly with your eyes until it finishes moving.";
    this.primary.textContent = "Start";
    this.secondary.hidden = true;
    this.primary.disabled = false;
    await this.waitForPrimaryOrCancel(false);
    this.card.hidden = true;
    this.progress.hidden = false;
    this.progress.textContent = "Smooth-pursuit calibration · follow the target";
  }

  showValidation(): void {
    this.mount();
    this.primary.hidden = false;
    this.poseCanvas.hidden = true;
    this.root.hidden = false;
    this.card.hidden = true;
    this.progress.hidden = false;
    this.progress.textContent = "Validation · keep looking at each target";
  }

  async results(validation: ValidationResult | null): Promise<void> {
    this.mount();
    this.primary.hidden = false;
    this.poseCanvas.hidden = true;
    this.root.hidden = false;
    this.card.hidden = false;
    this.progress.hidden = true;
    this.preview.parentElement!.hidden = true;
    this.eyebrow.textContent = "OpenEyeTrack setup";
    this.title.textContent = validation ? "Validation complete" : "Calibration complete";
    this.message.textContent = validation
      ? "Eye tracking is ready. The measurements below summarise this validation run."
      : "Calibration is complete and eye tracking is ready.";
    this.secondary.hidden = true;
    this.primary.textContent = "Continue to experiment";
    this.primary.disabled = false;

    if (validation) {
      this.metrics.hidden = false;
      this.metrics.innerHTML = [
        metric("Mean error", `${validation.meanPx.toFixed(0)} px`),
        metric("Median error", `${validation.medianPx.toFixed(0)} px`),
        metric("Precision (RMS-S2S)", `${validation.precisionRmsS2SPx.toFixed(1)} px`),
        metric("Valid samples", `${((1 - validation.dataLoss) * 100).toFixed(0)}%`)
      ].join("");
    } else this.metrics.hidden = true;

    await this.waitForPrimaryOrCancel(false);
    this.hide();
  }

  async error(error: unknown): Promise<void> {
    this.mount();
    this.primary.hidden = false;
    this.poseCanvas.hidden = true;
    this.root.hidden = false;
    this.card.hidden = false;
    this.progress.hidden = true;
    this.preview.parentElement!.hidden = true;
    this.metrics.hidden = true;
    this.eyebrow.textContent = "OpenEyeTrack setup";
    this.title.textContent = "Setup could not be completed";
    this.message.textContent = error instanceof Error ? error.message : String(error);
    this.secondary.hidden = true;
    this.primary.textContent = "Close";
    this.primary.disabled = false;
    await this.waitForPrimaryOrCancel(false);
    this.hide();
  }

  hide(): void {
    this.target.hidden = true;
    this.poseCanvas.hidden = true;
    this.root.querySelector<HTMLDivElement>(".oet-sdk-readiness")?.classList.remove("ready");
    this.root.hidden = true;
    try {
      this.preview.pause();
      this.preview.srcObject = null;
    } catch {
      // The preview is cosmetic; failure to stop it must not affect tracking.
    }
    this.restoreExternalTarget();
  }

  dispose(): void {
    this.hide();
    if (this.ownsTarget) this.target.remove();
    this.root.remove();
  }

  private mount(): void {
    if (!this.root.isConnected) document.body.appendChild(this.root);
    if (!this.target.isConnected || this.target.parentNode !== this.root) {
      if (!this.ownsTarget && this.target.parentNode !== this.root) {
        this.originalTargetParent = this.target.parentNode;
        this.originalTargetNextSibling = this.target.nextSibling;
      }
      this.root.appendChild(this.target);
    }
  }

  private restoreExternalTarget(): void {
    if (this.ownsTarget || !this.originalTargetParent) return;
    if (this.originalTargetNextSibling && this.originalTargetNextSibling.parentNode === this.originalTargetParent) {
      this.originalTargetParent.insertBefore(this.target, this.originalTargetNextSibling);
    } else this.originalTargetParent.appendChild(this.target);
    this.originalTargetParent = null;
    this.originalTargetNextSibling = null;
  }

  private syncPreview(): void {
    const stream = this.sourceVideo.srcObject;
    if (stream && this.preview.srcObject !== stream) {
      this.preview.srcObject = stream;
      void this.preview.play().catch(() => undefined);
    }
  }

  private waitForPrimaryOrCancel(allowCancel = true): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.primary.onclick = null;
        this.secondary.onclick = null;
      };
      this.primary.onclick = () => {
        cleanup();
        resolve();
      };
      this.secondary.onclick = () => {
        if (!allowCancel) return;
        cleanup();
        reject(new OpenEyeTrackSetupCancelledError());
      };
    });
  }
}

function metric(label: string, value: string): string {
  return `<div class="oet-sdk-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function poseLabel(pose: CalibrationHeadPose): string {
  return pose === "centre" ? "centre head position" : `${pose} head position`;
}

function poseTitle(pose: CalibrationHeadPose): string {
  if (pose === "centre") return "Centre your head";
  if (pose === "up" || pose === "down") return `Tilt your head ${pose}`;
  return `Move your head ${pose}`;
}

function poseInstruction(pose: CalibrationHeadPose): string {
  if (pose === "centre") return "Return to a comfortable centred head position, keep the screen still, then continue.";
  if (pose === "up" || pose === "down") return `Gently tilt your head ${pose} while keeping your eyes on the screen, then continue.`;
  return `Move your head slightly to the ${pose} while keeping your eyes on the screen, then continue.`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char] ?? char);
}
