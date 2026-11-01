import * as THREE from 'three';
import { Mandala } from './mandala';
import { Particles } from './particles';
import { Ribbon } from './ribbon';
import type { Stage } from './stage';
import type { Hand, HandCallbacks, HandSystem } from './hands';
import type { Sfx } from './audio';
import { CONFIG } from './config';
import { Spells } from './spells';
import type { Shape } from './shapes';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Director implements HandCallbacks {
  readonly mandalas: Mandala[];
  readonly particles: Particles;
  readonly spells: Spells;
  /** মন্ত্রের নাম দেখানোর জন্য (UI বসায়) */
  onCast?: (name: string) => void;
  private ribbons: Ribbon[];
  private rimAcc = [0, 0, 0];
  private conjT = 0;
  private bPrev = -1;
  private bSpd = 0;
  private bPeak = 0;
  private clapCd = 0;
  private barK = 0;
  private barOn = false;
  private barHold = 0;
  private barWant = 0;
  private barPhase = 0;
  quality = 1;

  private v = new THREE.Vector3();
  private t = new THREE.Vector3();
  private ident = new THREE.Quaternion();

  constructor(
    private stage: Stage,
    private hands: HandSystem,
    private sfx: Sfx,
  ) {
    this.mandalas = [0, 1, 2].map((i) => new Mandala(stage.scene, stage.shared, 0.13 + i * 0.31));
    this.particles = new Particles(stage.scene, CONFIG.particles.max);
    this.ribbons = [new Ribbon(stage.scene), new Ribbon(stage.scene)];
    this.spells = new Spells(stage, this.particles, sfx);
    this.spells.onCast = (n) => this.onCast?.(n);
    hands.cb = this;
  }

  private radiusFor(h: Hand) {
    return Math.min(h.rSize * CONFIG.mandalaRadiusPerPalm, Math.min(this.stage.W, this.stage.H) * CONFIG.maxRadiusFrac);
  }

  onOpen(h: Hand) {
    const m = this.mandalas[h.slot];
    this.sfx.whoosh(1);
    navigator.vibrate?.(14);
    this.stage.shake = Math.max(this.stage.shake, 0.25);
    const R = this.radiusFor(h);
    this.ringBurst(h.rCenter.x, h.rCenter.y, 0, R, Math.round(110 * this.quality), m.quat);
  }

  onFist(h: Hand) {
    const m = this.mandalas[h.slot];
    if (m.power < 0.3) return;
    this.sfx.boom();
    navigator.vibrate?.([20, 30, 40]);
    this.stage.shake = Math.max(this.stage.shake, 0.8);
    const s = Math.max(0.6, Math.min(h.rSize / 90, 2.2));
    const n = Math.round(150 * this.quality);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(120, 900) * s;
      this.particles.emit(
        h.rCenter.x + Math.cos(a) * 10 * s,
        h.rCenter.y + Math.sin(a) * 10 * s,
        2,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        rnd(0.45, 1.2),
        rnd(1.6, 4.2) * s,
        rnd(0.8, 1.6),
        -520 * s,
        1.7,
      );
    }
  }

  /** আঙুলে আঁকা আকৃতি চেনা গেলে: বৃত্ত=পোর্টাল, ত্রিভুজ=ঢাল, সোজা দাগ=চাবুক */
  onShape(s: Shape) {
    this.spells.cast(s);
  }

  onLoop(x: number, y: number, r: number) {
    const m = this.mandalas[2];
    const rr = Math.min(r * 1.12, Math.min(this.stage.W, this.stage.H) * CONFIG.maxRadiusFrac);
    m.set(x, y, 0, rr, this.ident);
    m.target = 1;
    this.conjT = CONFIG.loop.life;
    this.sfx.whoosh(1.3);
    navigator.vibrate?.(22);
    this.stage.shake = Math.max(this.stage.shake, 0.55);
    this.ringBurst(x, y, 0, rr, Math.round(180 * this.quality), this.ident);
  }

  private ringBurst(cx: number, cy: number, cz: number, R: number, n: number, q: THREE.Quaternion) {
    const s = Math.max(0.6, Math.min(R / 160, 2.2));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.v.set(Math.cos(a) * R, Math.sin(a) * R, 0).applyQuaternion(q);
      const sp = R * rnd(1.0, 3.2);
      this.particles.emit(
        cx + this.v.x,
        cy + this.v.y,
        cz + 2,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        rnd(0.5, 1.15),
        rnd(1.6, 4.4) * s,
        rnd(0.8, 1.5),
        -R * 1.4,
        1.8,
      );
    }
  }


  // ===== দুই হাত: আঙুল মুখোমুখি স্পার্ক-বার + Clap =====
  private bridgeFx(a: Hand, b: Hand, dt: number, now: number) {
    const ax = a.rCenter.x;
    const ay = a.rCenter.y;
    const dx = b.rCenter.x - ax;
    const dy = b.rCenter.y - ay;
    const dist = Math.hypot(dx, dy);
    const palm = a.rSize + b.rSize;
    const mx = ax + dx / 2;
    const my = ay + dy / 2;
    this.clapCd -= dt;

    // কাছে আসার গতি (palm সাইজের তুলনায়, তাই ছোট ফোনেও চলবে)
    if (this.bPrev >= 0) {
      const v = (this.bPrev - dist) / Math.max(dt, 1e-3);
      this.bSpd += (v - this.bSpd) * 0.6;
    }
    this.bPrev = dist;
    this.bPeak = Math.max(this.bSpd, this.bPeak * Math.exp(-dt * 5));

    // তালি
    if (this.clapCd <= 0 && this.bPeak > palm * 1.8 && dist < palm * 1.5) {
      this.clapCd = 1.2;
      this.bPeak = 0;
      this.sfx.boom();
      navigator.vibrate?.([20, 30, 40]);
      this.stage.shake = Math.max(this.stage.shake, 1);
      this.onLoop(mx, my, palm * 1.1);
      return;
    }
    if (dist < palm * 0.3 || dist < 1) return;

    // ===== আঙুল মুখোমুখি হলে: সোনালি আলোর দণ্ড + নিচে ঝরে পড়া স্ফুলিঙ্গের পর্দা =====
    const s = Math.max(0.8, Math.min(palm / 200, 2.2));
    const ux = dx / dist;
    const uy = dy / dist;
    const fa = a.rFing;
    const fb = b.rFing;

    // দুই হাতের আঙুল কি একে অপরের দিকে তাক করা? (১ = সরাসরি মুখোমুখি)
    const aLx = fa.x - ax;
    const aLy = fa.y - ay;
    const bLx = fb.x - b.rCenter.x;
    const bLy = fb.y - b.rCenter.y;
    const aLen = Math.hypot(aLx, aLy);
    const bLen = Math.hypot(bLx, bLy);
    let face = 0;
    if (aLen > a.rSize * 0.5 && bLen > b.rSize * 0.5) {
      const faceA = (aLx * ux + aLy * uy) / aLen;
      const faceB = -(bLx * ux + bLy * uy) / bLen;
      face = smooth(0.1, 0.55, Math.min(faceA, faceB));
    }

    // আঙুলের ডগার মাঝের ফাঁক যত কম, ইফেক্ট তত জোরালো
    const gap = Math.hypot(fb.x - fa.x, fb.y - fa.y);
    const reach = 1 - smooth(palm * 1.6, palm * 3.4, gap);

    // কাঁপাকাঁপি ঠেকাতে: মান মসৃণ করা + চালু হওয়া সহজ, বন্ধ হওয়া ধীরে (hysteresis)
    this.barWant += (face * reach - this.barWant) * Math.min(1, dt * 8);
    if (!this.barOn && this.barWant > 0.3) {
      this.barOn = true;
      this.barHold = 0.6;
    }
    if (this.barOn) {
      if (this.barWant > 0.12) this.barHold = 0.6;
      else this.barHold -= dt;
      if (this.barHold <= 0) this.barOn = false;
    }
    this.barK += ((this.barOn ? 1 : 0) - this.barK) * Math.min(1, dt * 10);
    const k = this.barK;
    if (k < 0.03) return;

    const mx2 = (fa.x + fb.x) / 2;
    const my2 = (fa.y + fb.y) / 2;
    const half = Math.max(gap * 0.525, palm * 0.35);
    const L = half * 2;

    // সোনালি দণ্ড: মাঝখানে সোজা উজ্জ্বল কোর + দুটি পাকানো (helix) আলোর সুতো, যেখানে সুতো দুটি পার হয় সেখানে ঝলক
    const flip = ux < 0 ? -1 : 1; // দণ্ডের লম্ব দিক (সবসময় ওপরমুখী)
    const px = -uy * flip;
    const py = ux * flip;
    const steps = Math.max(8, Math.ceil(L / 3));
    const wave = 46 * s;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const w = 0.55 + 0.45 * Math.sqrt(Math.sin(t * Math.PI));
      const off = (t - 0.5) * L;
      const x = mx2 + ux * off;
      const y = my2 + uy * off;
      this.particles.emit(x, y + rnd(-0.6, 0.6), 3, 0, 0, rnd(0.04, 0.07), rnd(3.0, 4.0) * s * w * (0.5 + 0.5 * k), 0, 0, 0);
      if (i % 2 === 0) {
        const sn = Math.sin((off * Math.PI * 2) / wave + now * 9);
        const amp = 8 * s * w * sn;
        const sz = rnd(2.0, 2.8) * s * w * k;
        this.particles.emit(x + px * amp, y + py * amp, 3, 0, 0, rnd(0.04, 0.07), sz, 0, 0, 0);
        this.particles.emit(x - px * amp, y - py * amp, 3, 0, 0, rnd(0.04, 0.07), sz, 0, 0, 0);
        if (Math.abs(sn) < 0.3) this.particles.emit(x, y, 2.5, 0, 0, 0.06, 9 * s * w * k, 0, 0, 0);
      }
    }
    // মাঝের আলোর বিন্দু ও দুই প্রান্তের ঝলক
    this.particles.emit(mx2, my2, 3, 0, 0, 0.06, (16 + 14 * k) * s * k, 0, 0, 0);
    this.particles.emit(mx2 - ux * half, my2 - uy * half, 3, 0, 0, 0.06, 11 * s * k, 0, 0, 0);
    this.particles.emit(mx2 + ux * half, my2 + uy * half, 3, 0, 0, 0.06, 11 * s * k, 0, 0, 0);

    // দুই প্রান্ত থেকে আলোর ধূমকেতু মাঝখানে এসে মিলে যায়, মিললেই ছোট বিস্ফোরণ
    const cyc = (now * 1.1) % 1;
    if (cyc < this.barPhase) this.meetBurst(mx2, my2, s, k);
    this.barPhase = cyc;
    for (const sg of [-1, 1]) {
      for (let j = 0; j < 6; j++) {
        const tj = Math.max(0, cyc * 0.5 - j * 0.012);
        const off = sg * (0.5 - tj) * L;
        this.particles.emit(mx2 + ux * off, my2 + uy * off, 3.2, 0, 0, 0.06, (14 - j * 2) * s * k, 0, 0, 0);
      }
    }

    // দণ্ড থেকে নিচে ঝরে পড়া অসংখ্য ঘন স্ফুলিঙ্গের দাগ; ঢেউয়ের মতো একপাশ থেকে আরেক পাশে ঘনত্ব দোলে
    const rate = Math.min(4200, Math.max(1300, L * 9.5)) * k;
    const nSp = Math.round(dt * rate * this.quality + Math.random());
    for (let i = 0; i < nSp; i++) {
      const tt = Math.random() + Math.random() - 1;
      const off = tt * half;
      const wv = 0.6 + 0.4 * Math.sin((off / (140 * s)) * Math.PI * 2 - now * 6);
      if (Math.random() > wv) continue;
      const big = Math.random() < 0.35;
      const up = Math.random() < 0.06;
      this.particles.emit(
        mx2 + ux * off + rnd(-2, 2),
        my2 + uy * off + rnd(-4, 4),
        2,
        tt * half * rnd(0.3, 0.9) + rnd(-25, 25) * s,
        up ? rnd(40, 160) * s : -rnd(60, 260) * s,
        big ? rnd(0.8, 1.4) : rnd(0.5, 1.0),
        (big ? rnd(3.0, 4.6) : rnd(1.6, 2.6)) * s,
        big ? 1.8 : 1.3,
        -rnd(600, 1100) * s,
        rnd(0.5, 1.0),
      );
    }
  }

  private meetBurst(x: number, y: number, s: number, k: number) {
    this.particles.emit(x, y, 3.4, 0, 0, 0.12, 40 * s * k, 0, 0, 0);
    const n = Math.round(36 * this.quality);
    for (let i = 0; i < n; i++) {
      const an = Math.random() * Math.PI * 2;
      const sp = rnd(180, 520) * s;
      this.particles.emit(x, y, 2, Math.cos(an) * sp, Math.sin(an) * sp, rnd(0.35, 0.8), rnd(1.6, 3.2) * s, 1.3, -300 * s, 1.8);
    }
  }

  private rim(idx: number, m: Mandala, rate: number, dt: number) {
    this.rimAcc[idx] += rate * 0.35 * dt;
    const n = Math.floor(this.rimAcc[idx]);
    this.rimAcc[idx] -= n;
    const R = m.R;
    const s = Math.max(0.6, Math.min(R / 160, 2.2));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      this.v.set(c * R, sn * R, 0).applyQuaternion(m.quat).add(m.center);
      this.t.set(-sn, c, 0).applyQuaternion(m.quat);
      const sp = R * rnd(0.15, 0.7);
      const tang = rnd(-0.5, 0.5) * sp;
      const spark = Math.random() < 0.3;
      this.particles.emit(
        this.v.x,
        this.v.y,
        m.center.z + 2,
        c * sp * 0.5 + this.t.x * tang + rnd(-20, 20),
        sn * sp * 0.5 + this.t.y * tang + R * 0.25,
        spark ? rnd(0.45, 0.9) : rnd(0.7, 1.5),
        (spark ? rnd(1.4, 3.0) : rnd(1.8, 4.2)) * s,
        spark ? rnd(1.0, 1.6) : 0.2,
        spark ? -R * 1.1 : R * 0.45,
        spark ? 1.4 : 1.1,
      );
    }
  }

  private tipFx(h: Hand, dt: number, x = h.rTip.x, y = h.rTip.y) {
    const s = Math.max(0.6, Math.min(h.rSize / 90, 2.2));
    this.particles.emit(x, y, 3, 0, 0, 0.06, 15 * s, 0, 0, 0);
    const nEmb = Math.max(1, Math.round(dt * 420 * this.quality));
    for (let i = 0; i < nEmb; i++) {
      this.particles.emit(
        x + rnd(-3, 3),
        y + rnd(-3, 3),
        2,
        rnd(-35, 35),
        rnd(10, 70),
        rnd(0.35, 0.85),
        rnd(1.4, 3.4) * s,
        0.2,
        90,
        1.4,
      );
    }
    const nSp = Math.round(dt * 110 * this.quality + Math.random());
    for (let i = 0; i < nSp; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(120, 420) * s;
      this.particles.emit(x, y, 2, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.4, 0.95), rnd(1.4, 3.0) * s, 1.3, -480 * s, 1.9);
    }
  }

  update(dt: number, now: number) {
    let heat = 0;
    let draw = 0;

    for (const h of this.hands.hands) {
      const m = this.mandalas[h.slot];
      m.target = this.barOn ? 0 : h.target;
      if (h.target > 0 || m.visible) {
        const R = this.radiusFor(h);
        const off = h.rSize * 0.35;
        m.set(h.rCenter.x + h.normal.x * off, h.rCenter.y + h.normal.y * off, h.normal.z * off, R, h.quat);
      }
      m.update(dt, now);
      if (m.power > 0.05) {
        this.rim(h.slot, m, 125 * Math.min(m.power, 1) * this.quality, dt);
        heat = Math.max(heat, Math.min(m.power, 1));
      }

      const rb = this.ribbons[h.slot];
      if (h.present && h.mode === 'point') {
        rb.add(h.rTip.x, h.rTip.y, now, Math.max(3.5, h.rSize * 0.055));
        this.tipFx(h, dt);
        draw = Math.max(draw, h.tipSpeed);
        heat = Math.max(heat, 0.35);
      } else if (h.present && h.pinch) {
        // pinch drawing: bright dot + trail so you can see the stroke being drawn
        rb.add(h.rPt.x, h.rPt.y, now, Math.max(4, h.rSize * 0.06));
        this.tipFx(h, dt, h.rPt.x, h.rPt.y);
        heat = Math.max(heat, 0.4);
      }
      rb.update(now);
    }

    const [h0, h1] = this.hands.hands;
    const live = (h: Hand) => h.present && h.mode !== 'fist' && h.mode !== 'point' && h.mode !== 'peace' && h.mode !== 'pinch';
    if (live(h0) && live(h1)) {
      this.bridgeFx(h0, h1, dt, now);
      heat = Math.max(heat, 0.6);
    } else {
      this.bPrev = -1;
      this.bSpd = 0;
      this.bPeak = 0;
      // হাত এক-দুই ফ্রেম হারালে/মোড বদলালেও সাথে সাথে বন্ধ নয়, একটু অপেক্ষা
      this.barHold -= dt;
      if (this.barHold <= 0) {
        this.barOn = false;
        this.barWant = 0;
      }
      this.barK += (0 - this.barK) * Math.min(1, dt * 10);
      this.clapCd -= dt;
    }

    const c = this.mandalas[2];
    if (this.conjT > 0) {
      this.conjT -= dt;
      if (this.conjT < 0.9) c.target = 0;
    }
    c.update(dt, now);
    if (c.power > 0.05) {
      this.rim(2, c, 125 * Math.min(c.power, 1) * this.quality, dt);
      heat = Math.max(heat, Math.min(c.power, 1));
    }

    this.spells.quality = this.quality;
    this.spells.update(dt, now);
    heat = Math.max(heat, this.spells.heat);

    this.particles.update(dt, now);
    this.stage.heat += (heat - this.stage.heat) * Math.min(1, dt * 6);
    const maxP = Math.max(...this.mandalas.map((m) => m.power));
    this.sfx.update(dt, maxP, draw);
  }
}
