export type Facing = 'user' | 'environment';

export class Camera {
  private stream?: MediaStream;
  facing: Facing = 'user';

  constructor(readonly video: HTMLVideoElement) {}

  get mirrored() {
    return this.facing === 'user';
  }

  private async open(facing: Facing, w: number, h: number) {
    this.stop();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: w },
        height: { ideal: h },
        aspectRatio: { ideal: window.innerWidth / window.innerHeight },
        frameRate: { ideal: 30, max: 60 },
      },
    });
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();
    if (!this.video.videoWidth) {
      await new Promise<void>((res) => {
        this.video.onloadedmetadata = () => res();
      });
    }
  }

  async start(facing: Facing = this.facing) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('INSECURE');
    }
    this.facing = facing;
    const portrait = window.innerHeight > window.innerWidth;
    await this.open(facing, portrait ? 720 : 1280, portrait ? 1280 : 720);
    const gotPortrait = this.video.videoHeight > this.video.videoWidth;
    if (gotPortrait !== portrait) {
      try {
        await this.open(facing, portrait ? 1280 : 720, portrait ? 720 : 1280);
      } catch {
        await this.open(facing, portrait ? 720 : 1280, portrait ? 1280 : 720);
      }
    }
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
  }
}
