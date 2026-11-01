import { FilesetResolver, GestureRecognizer, HandLandmarker } from '@mediapipe/tasks-vision';

const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const CDN_GESTURE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const CDN_HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const abs = (p: string) => new URL(p, document.baseURI).href;

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** দুই ধরনের মডেলের ফলাফল একই চেহারায় */
export interface DetectResult {
  /** স্ক্রিন-নরমালাইজড ল্যান্ডমার্ক (প্রতি হাতে ২১টি) */
  landmarks: P3[][];
  /** মিটার-স্কেলের ৩D ল্যান্ডমার্ক (হাতের কেন্দ্র মূলবিন্দু) — হাত যেদিকেই ঘোরানো থাকুক আঙুলের ভাঁজ মাপা যায় */
  worldLandmarks: P3[][];
  /** GestureRecognizer এর লেবেল (Open_Palm, Closed_Fist, Pointing_Up, Victory …); না থাকলে '' */
  gestures: string[];
  scores: number[];
}

export class Tracker {
  private gr?: GestureRecognizer;
  private lm?: HandLandmarker;
  private lastTs = 0;
  delegate: 'GPU' | 'CPU' = 'GPU';
  source = 'local';
  /** কোন মডেল চলছে */
  kind: 'gesture' | 'landmarker' = 'gesture';

  get ready() {
    return !!this.gr || !!this.lm;
  }

  async init() {
    const base = import.meta.env.BASE_URL;
    const wasms = [abs(base + 'wasm'), CDN_WASM];
    const gestureModels = [abs(base + 'models/gesture_recognizer.task'), CDN_GESTURE_MODEL];
    const handModels = [abs(base + 'models/hand_landmarker.task'), CDN_HAND_MODEL];
    const opts = {
      runningMode: 'VIDEO' as const,
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    let lastErr: unknown;

    // ১) আগে GestureRecognizer (ল্যান্ডমার্ক + জেসচার লেবেল একসাথে)
    for (const w of wasms) {
      let fileset;
      try {
        fileset = await FilesetResolver.forVisionTasks(w);
      } catch (e) {
        lastErr = e;
        continue;
      }
      for (const m of gestureModels) {
        for (const d of ['GPU', 'CPU'] as const) {
          try {
            this.gr = await GestureRecognizer.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: m, delegate: d },
              ...opts,
            });
            this.kind = 'gesture';
            this.delegate = d;
            this.source = w === wasms[0] && m === gestureModels[0] ? 'local' : 'cdn';
            return;
          } catch (e) {
            lastErr = e;
          }
        }
      }
    }

    // ২) না পারলে আগের HandLandmarker (শুধু জ্যামিতি দিয়ে জেসচার)
    for (const w of wasms) {
      let fileset;
      try {
        fileset = await FilesetResolver.forVisionTasks(w);
      } catch (e) {
        lastErr = e;
        continue;
      }
      for (const m of handModels) {
        for (const d of ['GPU', 'CPU'] as const) {
          try {
            this.lm = await HandLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: m, delegate: d },
              ...opts,
            });
            this.kind = 'landmarker';
            this.delegate = d;
            this.source = w === wasms[0] && m === handModels[0] ? 'local' : 'cdn';
            return;
          } catch (e) {
            lastErr = e;
          }
        }
      }
    }
    throw lastErr ?? new Error('Hand tracker init failed');
  }

  detect(video: HTMLVideoElement): DetectResult | null {
    if (!this.gr && !this.lm) return null;
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    try {
      if (this.gr) {
        const r = this.gr.recognizeForVideo(video, ts);
        return {
          landmarks: r.landmarks,
          worldLandmarks: r.worldLandmarks ?? [],
          gestures: (r.gestures ?? []).map((g) => g[0]?.categoryName ?? ''),
          scores: (r.gestures ?? []).map((g) => g[0]?.score ?? 0),
        };
      }
      const r = this.lm!.detectForVideo(video, ts);
      return { landmarks: r.landmarks, worldLandmarks: r.worldLandmarks ?? [], gestures: [], scores: [] };
    } catch {
      return null;
    }
  }
}
