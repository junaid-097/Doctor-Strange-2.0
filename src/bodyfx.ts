import * as THREE from 'three';
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import commonGlsl from './shaders/common.glsl?raw';
import ghostVert from './shaders/ghost.vert.glsl?raw';
import fireFrag from './shaders/fire.frag.glsl?raw';
import type { Stage } from './stage';
import type { Hand, HandSystem } from './hands';
import type { Sfx } from './audio';
import type { Particles } from './particles';

const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const abs = (p: string) => new URL(p, document.baseURI).href;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/**
 * দুই আঙুলে V (পিস) দেখালে শরীরে আগুন ধরে:
 * V-হাত থেকে শুরু হয়ে শিখা শরীরের ওপর দিয়ে ছড়ায়, কিনারা থেকে ওপরে শিখা ওঠে আর স্ফুলিঙ্গ উড়ে যায়।
 * V সরালে আগুন হাতের দিকে গুটিয়ে নিভে যায়।
 */
export class BodyFx {
  quality = 1;
  private seg?: ImageSegmenter;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private ghost: THREE.Mesh;
  private ghostMat: THREE.ShaderMaterial;
  private maskTex: THREE.DataTexture;
  private maskData = new Uint8Array(1);
  private list = new Uint32Array(1);
  private mw = 1;
  private mh = 1;
  private n = 0;
  private hasMask = false;
  private maxR = 0.5;
  private edge = new Uint32Array(1);
  private ne = 0;
  private active = false;
  private hold = 0;
  private prog = 0;
  private frame = 0;
  private lastTs = 0;
  private ox = 0.5;
  private oy = 0.5;
  private owx = 0;
  private owy = 0;

  constructor(
    private stage: Stage,
    private hands: HandSystem,
    private sfx: Sfx,
    private particles: Particles,
  ) {
    this.maskTex = this.makeTex(1, 1);
    this.ghostMat = new THREE.ShaderMaterial({
      vertexShader: ghostVert,
      fragmentShader: commonGlsl + fireFrag,
      uniforms: {
        uMask: { value: this.maskTex },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uOrigin: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uFront: { value: 0 },
        uProg: { value: 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.ghost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ghostMat);
    this.ghost.renderOrder = -9;
    this.ghost.frustumCulled = false;
    this.ghost.visible = false;
    stage.scene.add(this.ghost);
  }

  get ready() {
    return !!this.seg;
  }

  private makeTex(w: number, h: number) {
    const t = new THREE.DataTexture(new Uint8Array(w * h), w, h, THREE.RedFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }

  async init() {
    const base = import.meta.env.BASE_URL;
    const wasms = [abs(base + 'wasm'), CDN_WASM];
    const models = [abs(base + 'models/selfie_segmenter.tflite'), CDN_MODEL];
    let lastErr: unknown;
    for (const w of wasms) {
      const fileset = await FilesetResolver.forVisionTasks(w);
      for (const m of models) {
        for (const d of ['CPU', 'GPU'] as const) {
          try {
            this.seg = await ImageSegmenter.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: m, delegate: d },
              runningMode: 'VIDEO',
              outputCategoryMask: true,
              outputConfidenceMasks: false,
            });
            return;
          } catch (e) {
            lastErr = e;
          }
        }
      }
    }
    throw lastErr ?? new Error('Body segmenter init failed');
  }

  private toUv(x: number, y: number) {
    const st = this.stage;
    return { u: st.mirror ? 0.5 - x / st.dispW : 0.5 + x / st.dispW, v: y / st.dispH + 0.5 };
  }

  private start(h: Hand) {
    this.active = true;
    this.owx = h.rCenter.x;
    this.owy = h.rCenter.y;
    const o = this.toUv(this.owx, this.owy);
    this.ox = o.u;
    this.oy = o.v;
    this.hasMask = false;
    this.n = 0;
    this.ne = 0;
    this.maskData.fill(0);
    this.maskTex.needsUpdate = true;
    this.sfx.whoosh(1.6);
    navigator.vibrate?.([30, 20, 30]);
    this.stage.shake = Math.max(this.stage.shake, 0.5);
  }

  update(dt: number, now: number, video: HTMLVideoElement) {
    const st = this.stage;
    const peace = this.hands.hands.find((h) => h.present && h.mode === 'peace');
    if (peace && this.seg) {
      this.hold = 0.6;
      if (!this.active) this.start(peace);
    } else {
      this.hold -= dt;
    }
    if (this.active && this.hold <= 0) this.active = false;

    this.prog = clamp(this.prog + dt * (this.active ? 0.8 : -1.8), 0, 1);
    if (this.prog <= 0) {
      this.ghost.visible = false;
      return;
    }

    this.frame++;
    if (this.active && this.seg && this.frame % 3 === 0 && video.readyState >= 2) this.segment(video);

    const pe = this.prog * this.prog * (3 - 2 * this.prog);
    const front = pe * this.maxR * 1.08;
    const u = this.ghostMat.uniforms;
    u['uProg'].value = pe;
    u['uFront'].value = front;
    u['uAspect'].value = st.dispW / st.dispH;
    u['uTime'].value = now;
    (u['uOrigin'].value as THREE.Vector2).set(this.ox, this.oy);
    this.ghost.scale.set(st.mirror ? -st.dispW : st.dispW, st.dispH, 1);
    this.ghost.visible = this.hasMask;

    if (this.active && this.hasMask && this.ne > 0) this.emitEmbers(dt, front, Math.min(1, this.prog * 2));
    this.sfx.fire(dt, 26 * pe);
  }

  private maskXY(x: number, y: number, w: number, h: number) {
    const { u, v } = this.toUv(x, y);
    return {
      c: clamp(Math.floor(u * w), 0, w - 1),
      r: clamp(Math.floor((1 - v) * h), 0, h - 1),
    };
  }

  private segment(video: HTMLVideoElement) {
    const seg = this.seg;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!seg || !vw || !vh) return;
    const cw = 192;
    const ch = Math.max(8, Math.round((cw * vh) / vw));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.ctx.drawImage(video, 0, 0, cw, ch);
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;

    let res;
    try {
      res = seg.segmentForVideo(this.canvas, ts);
    } catch {
      return;
    }
    try {
      const cm = res.categoryMask;
      if (!cm) return;
      const w = cm.width;
      const h = cm.height;
      const data = cm.getAsUint8Array();

      // কোন সংখ্যাটা "মানুষ"? — হাতগুলো মানুষেরই অংশ, তাই হাতের জায়গার মানের ভোট
      const votes = new Map<number, number>();
      for (const hd of this.hands.hands) {
        if (!hd.present) continue;
        for (const p of [hd.rCenter, hd.rFing]) {
          const { c, r } = this.maskXY(p.x, p.y, w, h);
          const val = data[r * w + c];
          votes.set(val, (votes.get(val) ?? 0) + 1);
        }
      }
      if (!votes.size) return;
      let label = 0;
      let best = -1;
      votes.forEach((cnt, val) => {
        if (cnt > best) {
          best = cnt;
          label = val;
        }
      });

      if (w !== this.mw || h !== this.mh || this.maskData.length !== w * h) {
        this.mw = w;
        this.mh = h;
        this.maskData = new Uint8Array(w * h);
        this.list = new Uint32Array(w * h);
        this.edge = new Uint32Array(w * h);
        this.maskTex.dispose();
        this.maskTex = new THREE.DataTexture(this.maskData, w, h, THREE.RedFormat, THREE.UnsignedByteType);
        this.maskTex.minFilter = THREE.LinearFilter;
        this.maskTex.magFilter = THREE.LinearFilter;
        this.maskTex.generateMipmaps = false;
        this.ghostMat.uniforms['uMask'].value = this.maskTex;
        (this.ghostMat.uniforms['uTexel'].value as THREE.Vector2).set(1 / w, 1 / h);
      }

      const aspect = this.stage.dispW / this.stage.dispH;
      let n = 0;
      let ne = 0;
      let maxR = 0.05;
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const person = data[r * w + c] === label;
          this.maskData[(h - 1 - r) * w + c] = person ? 255 : 0;
          if (person) {
            this.list[n++] = r * w + c;
            const i = r * w + c;
            if (
              c === 0 ||
              c === w - 1 ||
              r === 0 ||
              r === h - 1 ||
              data[i - 1] !== label ||
              data[i + 1] !== label ||
              data[i - w] !== label ||
              data[i + w] !== label
            ) {
              this.edge[ne++] = i;
            }
            const du = ((c + 0.5) / w - this.ox) * aspect;
            const dv = 1 - (r + 0.5) / h - this.oy;
            const d = Math.hypot(du, dv);
            if (d > maxR) maxR = d;
          }
        }
      }
      this.n = n;
      this.ne = ne;
      this.maxR = maxR;
      this.hasMask = n > 0;
      this.maskTex.needsUpdate = true;
    } finally {
      res.close();
    }
  }

  /** শরীরের কিনারা থেকে ওপরে ওড়া জ্বলন্ত স্ফুলিঙ্গ (আগুন যতটা ছড়িয়েছে শুধু সেই অংশ থেকে) */
  private emitEmbers(dt: number, front: number, gate: number) {
    const st = this.stage;
    const w = this.mw;
    const h = this.mh;
    const sc = clamp(st.H / 700, 0.7, 2);
    const aspect = st.dispW / st.dispH;
    const want = Math.round(dt * 240 * this.quality * gate + Math.random());
    for (let k = 0; k < want; k++) {
      for (let tries = 0; tries < 4; tries++) {
        const idx = this.edge[(Math.random() * this.ne) | 0];
        const c = idx % w;
        const r = (idx / w) | 0;
        const u = (c + 0.5) / w;
        const v = 1 - (r + 0.5) / h;
        if (Math.hypot((u - this.ox) * aspect, v - this.oy) > front) continue;
        const x = (st.mirror ? 0.5 - u : u - 0.5) * st.dispW + rnd(-3, 3);
        const y = (v - 0.5) * st.dispH + rnd(-3, 3);
        const big = Math.random() < 0.2;
        this.particles.emit(
          x,
          y,
          2,
          rnd(-35, 35) * sc,
          rnd(70, 220) * sc,
          big ? rnd(0.9, 1.6) : rnd(0.5, 1.1),
          (big ? rnd(2.6, 4.0) : rnd(1.4, 2.6)) * sc,
          big ? 0.5 : 0.9,
          rnd(90, 220) * sc,
          rnd(0.6, 1.1),
        );
        break;
      }
    }
  }
}
