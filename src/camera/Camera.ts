export interface CameraConfig {
  width?: number;
  height?: number;
  frameRate?: number;
  facingMode?: "user" | "environment";
}

export class Camera {
  private stream: MediaStream | null = null;

  constructor(private readonly video: HTMLVideoElement) {}

  async start(config: CameraConfig = {}): Promise<MediaTrackSettings> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support webcam access via getUserMedia().");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: config.width ?? 1280 },
        height: { ideal: config.height ?? 720 },
        frameRate: { ideal: config.frameRate ?? 60 },
        facingMode: config.facingMode ?? "user"
      }
    });

    this.video.srcObject = this.stream;
    await this.video.play();
    return this.getSettings();
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  cloneVideoTrack(): MediaStreamTrack {
    const track=this.stream?.getVideoTracks()[0];
    if(!track) throw new Error("Camera has not been started.");
    return track.clone();
  }

  getSettings(): MediaTrackSettings {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) throw new Error("Camera has not been started.");
    return track.getSettings();
  }

  isRunning(): boolean {
    return this.stream !== null;
  }
}
