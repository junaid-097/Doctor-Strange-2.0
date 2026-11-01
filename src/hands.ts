import * as THREE from 'three';
import type { DetectResult, P3 } from './tracker';
import { OneEuro } from './oneEuro';
import type { Stage } from './stage';
import { CONFIG } from './config';
import { recognizeShape, type Shape } from './shapes';
import { FlickDetector, PushDetector, SpreadDetector, GESTURE_TUNING, nextPinch } from './gestures';

export type Mode = 'none' | 'open' | 'fist' | 'point' | 'peace' | 'pinch' | 'other';

interface PathPt {
  x: number;
  y: number;
  t: number;
}

interface Feat {
  cx: number;
  cy: number;
  size: number;
  tx: number;
  ty: number;
  fx: number;
  fy: number;
  n: THREE.Vector3;
  a: THREE.Vector3;
  /** প্রতিটি আঙুল (তর্জনী→কনিষ্ঠা) কতটা সোজা: ~১ = সোজা, ~০.৫ = মুড়ানো */
  ratio: number[];
  label: string;
  score: number;
  /** pinch point (thumb tip + index tip midpoint) and tip distance / hand size */
  px: number;
  py: number;
  pd: number;
}

export interface HandCallbacks {
  onOpen(h: Hand): void;
  onFist(h: Hand): void;
  onLoop(x: number, y: number, r: number): void;
  /** আঙুলে আঁকা দাগ চেনা গেলে */
  onShape(s: Shape): void;
}

const Z = new THREE.Vector3(0, 0, 1);

// আঙুল সোজা/মুড়ানো ঠিক করার সীমা (দুই সীমার মাঝে আগের অবস্থাই থাকে, তাই কাঁপে না)
const EXT_ON = 0.86;
const EXT_OFF = 0.74;
const LABEL_MODE: Record<string, Mode> = {
  Open_Palm: 'open',
  Closed_Fist: 'fist',
  Pointing_Up: 'point',
  Victory: 'peace',
};

export class Hand {
  present = false;
  lastSeen = -100;
  mode: Mode = 'none';
  cand: Mode = 'none';
  candN = 0;
  // চার আঙুলের স্থির অবস্থা (সোজা = true) ও মডেলের লেবেল
  ext = [false, false, false, false];
  extInit = false;
  label = '';
  score = 0;

  target = 0;

  center = new THREE.Vector2();
  size = 100;
  tip = new THREE.Vector2();
  normal = new THREE.Vector3(0, 0, 1);
  xAxis = new THREE.Vector3(1, 0, 0);

  rCenter = new THREE.Vector2();
  rSize = 100;
  rTip = new THREE.Vector2();
  prevTip = new THREE.Vector2();
  // চার আঙুলের ডগার গড় বিন্দু (দুই হাতের আঙুল মুখোমুখি হলে ইফেক্টের জন্য)
  fing = new THREE.Vector2();
  rFing = new THREE.Vector2();
  quat = new THREE.Quaternion();
  tipSpeed = 0;
  snap = false;

  path: PathPt[] = [];
  loopCooldown = 0;
  lastMoveT = 0;
  /** সর্বশেষ দাগের ফল (ডিবাগের জন্য) */
  lastShape = { kind: 'none', score: 0, info: '', t: -100 };

  // pinch (thumb + index) drawing
  pinch = false;
  pinchN = 0;
  pinchT = 0;
  pd = 1;
  pt = new THREE.Vector2();
  rPt = new THREE.Vector2();
  openBlock = 0;
  flick = new FlickDetector();
  push = new PushDetector();

  private f = {
    cx: new OneEuro(1.2, 0.012),
    cy: new OneEuro(1.2, 0.012),
    s: new OneEuro(0.8, 0.01),
    nx: new OneEuro(1.5, 2.5),
    ny: new OneEuro(1.5, 2.5),
    nz: new OneEuro(1.5, 2.5),
    ax: new OneEuro(1.5, 2.5),
    ay: new OneEuro(1.5, 2.5),
    az: new OneEuro(1.5, 2.5),
    tx: new OneEuro(2.5, 0.06),
    ty: new OneEuro(2.5, 0.06),
    fx: new OneEuro(2.5, 0.06),
    fy: new OneEuro(2.5, 0.06),
    px: new OneEuro(2.5, 0.06),
    py: new OneEuro(2.5, 0.06),
  };

  constructor(readonly slot: number) {}

  feed(ft: Feat, t: number) {
    if (t - this.lastSeen > 0.5) {
      Object.values(this.f).forEach((f) => f.reset());
      this.snap = true;
      this.extInit = false;
    }
    this.lastSeen = t;
    const f = this.f;
    this.center.set(f.cx.filter(ft.cx, t), f.cy.filter(ft.cy, t));
    this.size = f.s.filter(ft.size, t);
    this.tip.set(f.tx.filter(ft.tx, t), f.ty.filter(ft.ty, t));
    this.fing.set(f.fx.filter(ft.fx, t), f.fy.filter(ft.fy, t));
    this.pt.set(f.px.filter(ft.px, t), f.py.filter(ft.py, t));
    this.pd = ft.pd;
    this.normal.set(f.nx.filter(ft.n.x, t), f.ny.filter(ft.n.y, t), f.nz.filter(ft.n.z, t)).normalize();
    this.xAxis.set(f.ax.filter(ft.a.x, t), f.ay.filter(ft.a.y, t), f.az.filter(ft.a.z, t)).normalize();
  }
}

export class HandSystem {
  readonly hands = [new Hand(0), new Hand(1)];
  cb!: HandCallbacks;
  private P = Array.from({ length: 21 }, () => new THREE.Vector3());
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpX = new THREE.Vector3();
  private tmpY = new THREE.Vector3();
  private tmpN = new THREE.Vector3();

  private clock = 0;
  readonly spread = new SpreadDetector();

  constructor(private stage: Stage) {}

  ingest(res: DetectResult, now: number) {
    this.clock = now;
    const feats: Feat[] = [];
    res.landmarks.forEach((lm, i) => {
      feats.push(this.features(lm, res.worldLandmarks[i], res.gestures[i] ?? '', res.scores[i] ?? 0));
    });
    if (!feats.length) return;
    feats.sort((a, b) => a.cx - b.cx);

    const pairs: [Feat, Hand][] = [];
    if (feats.length >= 2) {
      pairs.push([feats[0], this.hands[0]], [feats[1], this.hands[1]]);
    } else {
      const f = feats[0];
      const recent = this.hands.filter((h) => now - h.lastSeen < 0.6);
      let pick: Hand | undefined;
      let best = Infinity;
      for (const h of recent) {
        const d = Math.hypot(h.center.x - f.cx, h.center.y - f.cy);
        if (d < best) {
          best = d;
          pick = h;
        }
      }
      if (!pick || best > Math.max(this.stage.W, this.stage.H) * 0.45) {
        const pref = this.hands[f.cx < 0 ? 0 : 1];
        const other = this.hands[f.cx < 0 ? 1 : 0];
        pick = now - pref.lastSeen >= 0.6 ? pref : other;
      }
      pairs.push([f, pick]);
    }
    for (const [f, h] of pairs) {
      h.feed(f, now);
      h.label = f.label;
      h.score = f.score;
      const cm = this.classify(h, f);
      // pinch on/off with hysteresis; starting needs a couple of frames, releasing is instant
      const want = nextPinch(h.pinch, f.pd);
      if (want === h.pinch) h.pinchN = 0;
      else if (++h.pinchN >= (want ? GESTURE_TUNING.pinchFrames : 1)) {
        h.pinchN = 0;
        this.setPinch(h, want);
      }
      this.setMode(h, h.pinch ? 'pinch' : cm);
    }
  }

  private features(lm: P3[], wl: P3[] | undefined, label: string, score: number): Feat {
    const P = this.P;
    for (let i = 0; i < 21; i++) this.stage.lmToWorld(lm[i], P[i]);
    const palmLen = P[0].distanceTo(P[9]);
    const palmW = P[5].distanceTo(P[17]);
    const size = 0.6 * palmLen + 0.4 * palmW * 1.15;
    const cx = (P[0].x + P[5].x + P[9].x + P[13].x + P[17].x) / 5;
    const cy = (P[0].y + P[5].y + P[9].y + P[13].y + P[17].y) / 5;

    const ratio = this.fingerRatios(wl);

    const v1 = this.tmpX.copy(P[5]).sub(P[0]);
    const v2 = this.tmpY.copy(P[17]).sub(P[0]);
    const nrm = new THREE.Vector3().crossVectors(v1, v2).normalize();
    if (nrm.z < 0) nrm.negate();
    nrm.lerp(Z, 0.5).normalize();
    const ax = new THREE.Vector3().copy(P[17]).sub(P[5]).normalize();

    const fx = (P[8].x + P[12].x + P[16].x + P[20].x) / 4;
    const fy = (P[8].y + P[12].y + P[16].y + P[20].y) / 4;

    const px = (P[4].x + P[8].x) / 2;
    const py = (P[4].y + P[8].y) / 2;
    // thumb-tip to index-tip distance in real 3D (world landmarks) / palm length: independent of
    // hand tilt and distance. A pinch is ~0.1-0.3, a relaxed hand 0.6+.
    let pd: number;
    if (wl && wl.length >= 21) {
      const d = (i: number, j: number) => Math.hypot(wl[i].x - wl[j].x, wl[i].y - wl[j].y, wl[i].z - wl[j].z);
      pd = d(4, 8) / Math.max(d(0, 9), 1e-4);
    } else pd = P[4].distanceTo(P[8]) / Math.max(size, 1);
    return { cx, cy, size, tx: P[8].x, ty: P[8].y, fx, fy, n: nrm, a: ax, ratio, label, score, px, py, pd };
  }

  /**
   * আঙুলের সোজা-ভাব = (মূল জোড় থেকে ডগার সোজা দূরত্ব) ÷ (তিন হাড়ের মোট দৈর্ঘ্য)।
   * ৩D world ল্যান্ডমার্কে মাপা হয়, তাই হাত ক্যামেরার দিকে হেলে থাকলেও বা ঘোরানো থাকলেও ঠিক থাকে।
   */
  private fingerRatios(wl: P3[] | undefined): number[] {
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];
    const dips = [7, 11, 15, 19];
    const mcps = [5, 9, 13, 17];
    const P = this.P;
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      if (wl && wl.length >= 21) {
        const d = (a: number, b: number) => Math.hypot(wl[a].x - wl[b].x, wl[a].y - wl[b].y, wl[a].z - wl[b].z);
        const path = d(mcps[i], pips[i]) + d(pips[i], dips[i]) + d(dips[i], tips[i]);
        out.push(path > 1e-6 ? d(mcps[i], tips[i]) / path : 0);
      } else {
        // world ল্যান্ডমার্ক না থাকলে পুরনো ২D পদ্ধতি
        out.push(P[tips[i]].distanceTo(P[0]) > P[pips[i]].distanceTo(P[0]) * 1.15 ? 1 : 0);
      }
    }
    return out;
  }

  /** আঙুলের স্থির অবস্থা (hysteresis) থেকে হাতের মোড; অস্পষ্ট হলে মডেলের লেবেল দিয়ে মেটানো */
  private classify(h: Hand, f: Feat): Mode {
    for (let i = 0; i < 4; i++) {
      const r = f.ratio[i];
      if (!h.extInit) h.ext[i] = r > 0.8;
      else if (r > EXT_ON) h.ext[i] = true;
      else if (r < EXT_OFF) h.ext[i] = false;
    }
    h.extInit = true;
    const e = h.ext;
    const n = e.filter(Boolean).length;
    let mode: Mode;
    if (n >= 3) mode = 'open';
    else if (n === 0) mode = 'fist';
    else if (e[0] && e[1] && n === 2) mode = 'peace';
    else if (e[0] && n === 1) mode = 'point';
    else mode = 'other';
    if (mode === 'other' && f.score >= 0.7) {
      const m = LABEL_MODE[f.label];
      if (m) mode = m;
    }
    return mode;
  }

  private setMode(h: Hand, raw: Mode) {
    if (raw === h.cand) h.candN++;
    else {
      h.cand = raw;
      h.candN = 1;
    }
    if (raw === 'open' && this.clock < h.openBlock) raw = 'other';
    if (h.candN < 3 || raw === h.mode) return;
    const prev = h.mode;
    h.mode = raw;
    if (raw === 'open') {
      h.target = 1;
      if (prev !== 'open') this.cb.onOpen(h);
    } else if (raw === 'fist') {
      h.target = 0;
      this.cb.onFist(h);
    } else if (raw === 'point' || raw === 'peace' || raw === 'pinch') {
      h.target = 0;
    }
    if (raw !== 'point') h.flick.reset();
    void prev;
  }

  private setPinch(h: Hand, on: boolean) {
    if (on) {
      h.pinch = true;
      h.path.length = 0;
      h.pinchT = this.clock;
      h.rPt.copy(h.pt);
      h.mode = 'pinch';
      h.cand = 'pinch';
      h.candN = 3;
      h.target = 0;
    } else {
      h.pinch = false;
      h.mode = 'none';
      h.cand = 'none';
      h.candN = 0;
      h.openBlock = this.clock + 0.6; // the opening fingers should not pop the palm circle
      this.finishStroke(h);
    }
  }

  
  update(dt: number, now: number) {
    this.clock = now;
    const k = 1 - Math.exp(-dt * 22);
    const kt = 1 - Math.exp(-dt * 38);
    const kq = 1 - Math.exp(-dt * 16);
    for (const h of this.hands) {
      const was = h.present;
      h.present = now - h.lastSeen < 0.28;
      if (was && !h.present) {
        if (h.pinch) this.setPinch(h, false);
        h.mode = 'none';
        h.cand = 'none';
        h.candN = 0;
        h.target = 0;
        h.path.length = 0;
      }
      if (h.snap) {
        h.rCenter.copy(h.center);
        h.rSize = h.size;
        h.rTip.copy(h.tip);
        h.prevTip.copy(h.tip);
        h.rFing.copy(h.fing);
        this.basis(h, h.quat);
        h.snap = false;
      }
      h.rCenter.lerp(h.center, k);
      h.rSize += (h.size - h.rSize) * k;
      h.prevTip.copy(h.rTip);
      h.rTip.lerp(h.tip, kt);
      h.rFing.lerp(h.fing, kt);
      const sp = h.rTip.distanceTo(h.prevTip) / Math.max(dt, 1e-3);
      h.tipSpeed += (sp - h.tipSpeed) * 0.3;
      this.basis(h, this.tmpQ);
      h.quat.slerp(this.tmpQ, kq);

      h.rPt.lerp(h.pt, kt);
      h.loopCooldown -= dt;
      if (h.present && h.pinch) this.trackPinch(h, now);
      this.motionGestures(h, now);
    }
    this.twoHandGestures(now);
  }

  private basis(h: Hand, out: THREE.Quaternion) {
    const n = this.tmpN.copy(h.normal).normalize();
    const x = this.tmpX.copy(h.xAxis);
    x.addScaledVector(n, -x.dot(n));
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
    x.normalize();
    const y = this.tmpY.crossVectors(n, x);
    this.tmpM.makeBasis(x, y, n);
    out.setFromRotationMatrix(this.tmpM);
  }

  /** pinch point path while thumb and index are held together */
  private trackPinch(h: Hand, now: number) {
    const last = h.path[h.path.length - 1];
    if (!last || Math.hypot(h.rPt.x - last.x, h.rPt.y - last.y) >= 4) {
      h.path.push({ x: h.rPt.x, y: h.rPt.y, t: now });
    }
    while (h.path.length && now - h.path[0].t > 8) h.path.shift();
  }

  /** flick (fire whip) and palm push (shield): no drawing needed */
  private motionGestures(h: Hand, now: number) {
    if (!h.present) return;
    if (h.mode === 'point') {
      const sh = h.flick.push(h.rTip.x, h.rTip.y, now, Math.min(this.stage.W, this.stage.H));
      if (sh) this.cast(h, sh, 'flick');
    }
    if (h.mode === 'open') {
      if (h.push.push(h.size, now)) {
        const sh: Shape = {
          kind: 'triangle',
          score: 1,
          cx: h.rCenter.x,
          cy: h.rCenter.y,
          r: h.rSize * 1.5,
          angle: Math.PI / 2,
          x0: h.rCenter.x,
          y0: h.rCenter.y,
          x1: h.rCenter.x,
          y1: h.rCenter.y,
          len: h.rSize * 4,
        };
        this.cast(h, sh, 'push');
      }
    } else h.push.reset();
  }

  /** two fists pulled apart -> portal between the hands */
  private twoHandGestures(now: number) {
    const [a, b] = this.hands;
    const ok = (h: Hand) => h.present && (h.mode === 'fist' || h.mode === 'other');
    if (!ok(a) || !ok(b)) {
      this.spread.reset();
      return;
    }
    const d = a.rCenter.distanceTo(b.rCenter);
    const size = (a.rSize + b.rSize) / 2;
    if (!this.spread.push(d, size, now)) return;
    const cx = (a.rCenter.x + b.rCenter.x) / 2;
    const cy = (a.rCenter.y + b.rCenter.y) / 2;
    const sh: Shape = { kind: 'circle', score: 1, cx, cy, r: d / 2, angle: 0, x0: a.rCenter.x, y0: a.rCenter.y, x1: b.rCenter.x, y1: b.rCenter.y, len: d };
    a.lastShape = b.lastShape = { kind: 'circle', score: 1, info: 'spread', t: this.clock };
    a.loopCooldown = b.loopCooldown = CONFIG.shape.cooldown;
    this.cb.onShape(sh);
  }

  private cast(h: Hand, sh: Shape, why: string) {
    h.lastShape = { kind: sh.kind, score: sh.score, info: why, t: this.clock };
    h.loopCooldown = CONFIG.shape.cooldown;
    this.cb.onShape(sh);
  }

  private minStrokeLen() {
    return CONFIG.shape.minLen * Math.min(this.stage.W, this.stage.H);
  }

  private finishStroke(h: Hand) {
    const S = CONFIG.shape;
    // drop the closing / opening motion of the fingers at both ends
    const t0 = h.pinchT + GESTURE_TUNING.pinchTrimStart;
    const t1 = this.clock - GESTURE_TUNING.pinchTrimEnd;
    const pts = h.path.filter((p) => p.t >= t0 && p.t <= t1);
    h.path.length = 0;
    if (pts.length < S.minPts) {
      h.lastShape = { kind: 'none', score: 0, info: `stroke too short (${pts.length} pts < ${S.minPts})`, t: this.clock };
      return;
    }
    const res = recognizeShape(pts, { minLen: this.minStrokeLen() });
    const sh = res.shape;
    h.lastShape = { kind: sh ? sh.kind : 'none', score: sh ? sh.score : 0, info: res.info, t: this.clock };
    if (h.loopCooldown > 0 || !sh || sh.score < S.minScore) return;
    h.loopCooldown = S.cooldown;
    this.cb.onShape(sh);
  }
}
