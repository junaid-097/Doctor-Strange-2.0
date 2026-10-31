import * as THREE from 'three';
import commonGlsl from './shaders/common.glsl?raw';
import quadVert from './shaders/mandala.vert.glsl?raw';
import portalFrag from './shaders/portal.frag.glsl?raw';
import shieldFrag from './shaders/shield.frag.glsl?raw';
import { Ribbon } from './ribbon';
import { CONFIG } from './config';
import type { Particles } from './particles';
import type { Sfx } from './audio';
import type { Stage } from './stage';
import type { Shape } from './shapes';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** পোর্টাল বা ঢালের গোল চেহারা (পুল থেকে নেওয়া, শেষ হলে লুকিয়ে যায়) */
class Disc {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  active = false;
  age = 0;
  life = 0;
  cx = 0;
  cy = 0;
  R = 100;
  rot = 0;
  private margin = 1.3;

  constructor(scene: THREE.Scene, frag: string) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: commonGlsl + frag,
      uniforms: {
        uTime: { value: 0 },
        uPower: { value: 0 },
        uSeed: { value: Math.random() },
        uMargin: { value: this.margin },
        uRot: { value: 0 },
      },
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  start(cx: number, cy: number, R: number, life: number, rot: number) {
    this.active = true;
    this.age = 0;
    this.life = life;
    this.cx = cx;
    this.cy = cy;
    this.R = R;
    this.rot = rot;
    this.mat.uniforms['uSeed'].value = Math.random();
    this.mat.uniforms['uRot'].value = rot;
    this.mesh.visible = true;
  }

  stop() {
    this.active = false;
    this.mesh.visible = false;
  }

  /** খোলা (০→১) ও বন্ধ হওয়া (শেষ ০.৮ সেকেন্ডে ১→০) মিলিয়ে ক্ষমতা */
  get fade() {
    return clamp((this.life - this.age) / 0.8, 0, 1);
  }

  get power() {
    return easeOutBack(Math.min(this.age / 0.5, 1)) * this.fade;
  }

  render(now: number) {
    const s = this.R * 2 * this.margin;
    this.mesh.position.set(this.cx, this.cy, 0);
    this.mesh.scale.set(s, s, 1);
    this.mat.uniforms['uTime'].value = now;
    this.mat.uniforms['uPower'].value = this.power;
  }
}

/** আগুনের চাবুক: মাথা এগিয়ে যায়, পেছনে শিখার রেখা (Ribbon) থেকে যায়, শেষে ফটাস */
class Whip {
  readonly ribbon: Ribbon;
  active = false;
  age = 0;
  private ox = 0;
  private oy = 0;
  private dx = 1;
  private dy = 0;
  private len = 300;
  private amp = 30;
  private phase = 0;
  private prog = 0;
  private cracked = false;
  private k = 1;
  static readonly TRAVEL = 0.5;

  constructor(scene: THREE.Scene) {
    this.ribbon = new Ribbon(scene);
  }

  start(ox: number, oy: number, ang: number, len: number, k: number) {
    this.active = true;
    this.age = 0;
    this.prog = 0;
    this.cracked = false;
    this.ox = ox;
    this.oy = oy;
    this.dx = Math.cos(ang);
    this.dy = Math.sin(ang);
    this.len = len;
    this.amp = len * 0.11;
    this.phase = rnd(0, Math.PI * 2);
    this.k = k;
    this.ribbon.clear();
  }

  /** চাবুকের ওপর ০..১ অবস্থানের বিন্দু (পাশে দুলুনিসহ) */
  private at(pg: number) {
    const along = this.len * pg;
    const lat = this.amp * Math.sin(pg * Math.PI * 3 + this.phase + this.age * 9) * Math.sin(Math.min(pg, 1) * Math.PI) ** 0.6;
    return { x: this.ox + this.dx * along - this.dy * lat, y: this.oy + this.dy * along + this.dx * lat };
  }

  update(dt: number, now: number, particles: Particles, onCrack: (x: number, y: number) => void, quality: number) {
    if (!this.active) return;
    this.age += dt;
    const k = this.k;
    if (this.age < Whip.TRAVEL) {
      const u = this.age / Whip.TRAVEL;
      const pg = 1 - Math.pow(1 - u, 2.2);
      const step = Math.max(12, this.len / 45);
      const n = Math.max(1, Math.ceil(((pg - this.prog) * this.len) / step));
      for (let i = 1; i <= n; i++) {
        const q = this.at(this.prog + ((pg - this.prog) * i) / n);
        this.ribbon.add(q.x, q.y, now, 6.5 * k);
      }
      this.prog = pg;
      const head = this.at(pg);
      particles.emit(head.x, head.y, 3, 0, 0, 0.06, 14 * k, 0, 0, 0);
      const ns = Math.round(3 * quality + Math.random());
      for (let i = 0; i < ns; i++) {
        particles.emit(head.x, head.y, 2.5, rnd(-90, 90) * k, rnd(-90, 90) * k, rnd(0.2, 0.5), rnd(1.5, 3.2) * k, 1.2, -200 * k, 1.5);
      }
    } else if (!this.cracked) {
      this.cracked = true;
      const head = this.at(1);
      onCrack(head.x, head.y);
    }
    this.ribbon.update(now);
    if (this.age > Whip.TRAVEL + CONFIG.trail.life + 0.1) {
      this.active = false;
      this.ribbon.clear();
      this.ribbon.update(now);
    }
  }
}

export class Spells {
  onCast?: (name: string) => void;
  quality = 1;
  /** আশপাশে আলো/রঙের বিকৃতি বাড়াতে */
  heat = 0;
  private portals: Disc[];
  private shields: Disc[];
  private whips: Whip[];

  constructor(
    private stage: Stage,
    private particles: Particles,
    private sfx: Sfx,
  ) {
    this.portals = [new Disc(stage.scene, portalFrag), new Disc(stage.scene, portalFrag)];
    this.shields = [new Disc(stage.scene, shieldFrag), new Disc(stage.scene, shieldFrag)];
    this.whips = [new Whip(stage.scene), new Whip(stage.scene), new Whip(stage.scene)];
    this.warm();
  }

  /** প্রথমবার ব্যবহারের সময় শেডার কম্পাইলের থমকে যাওয়া এড়াতে আগেই কম্পাইল */
  private warm() {
    try {
      const all: THREE.Object3D[] = [...this.portals.map((d) => d.mesh), ...this.shields.map((d) => d.mesh), ...this.whips.map((w) => w.ribbon.mesh)];
      const prev = all.map((o) => o.visible);
      all.forEach((o) => (o.visible = true));
      this.stage.renderer.compile(this.stage.scene, this.stage.camera);
      all.forEach((o, i) => (o.visible = prev[i]));
    } catch {
      /* কম্পাইল আগেভাগে না হলেও চলবে */
    }
  }

  private pick<T extends { active: boolean; age?: number }>(pool: T[]): T {
    const free = pool.find((p) => !p.active);
    if (free) return free;
    return pool.reduce((a, b) => ((a.age ?? 0) > (b.age ?? 0) ? a : b));
  }

  cast(s: Shape) {
    const st = this.stage;
    const minD = Math.min(st.W, st.H);
    const k = clamp(minD / 450, 0.8, 2.2);
    if (s.kind === 'circle') this.castPortal(s, minD, k);
    else if (s.kind === 'triangle') this.castShield(s, minD, k);
    else this.castWhip(s, minD, k);
  }

  private castPortal(s: Shape, minD: number, k: number) {
    const d = this.pick(this.portals);
    const R = clamp(s.r * 1.05, minD * 0.09, minD * CONFIG.maxRadiusFrac);
    d.start(s.cx, s.cy, R, 5, 0);
    this.sfx.portal();
    navigator.vibrate?.([20, 40, 20]);
    this.stage.shake = Math.max(this.stage.shake, 0.45);
    const n = Math.round(130 * this.quality);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const sp = rnd(150, 620) * k;
      this.particles.emit(s.cx + c * R, s.cy + sn * R, 2, -sn * sp + c * rnd(0, 140) * k, c * sp + sn * rnd(0, 140) * k, rnd(0.5, 1.2), rnd(1.6, 3.6) * k, 1.3, -rnd(500, 900) * k, rnd(0.5, 1.0));
    }
    this.onCast?.('পোর্টাল');
  }

  private castShield(s: Shape, minD: number, k: number) {
    const d = this.pick(this.shields);
    const R = clamp(s.r * 1.25, minD * 0.1, minD * 0.4);
    d.start(s.cx, s.cy, R, 6, s.angle);
    this.sfx.shield();
    navigator.vibrate?.(40);
    this.stage.shake = Math.max(this.stage.shake, 0.35);
    const n = Math.round(90 * this.quality);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const sp = rnd(60, 260) * k;
      this.particles.emit(s.cx + c * R * 0.96, s.cy + sn * R * 0.96, 2, c * sp, sn * sp, rnd(0.5, 1.1), rnd(1.4, 3.0) * k, 1.1, rnd(0, 80) * k, 1.4);
    }
    this.onCast?.('ঢাল');
  }

  private castWhip(s: Shape, minD: number, k: number) {
    const w = this.pick(this.whips);
    const W = this.stage.W;
    const H = this.stage.H;
    const len = clamp(Math.max(s.len * 1.6, minD * 0.55), 0, Math.max(W, H) * 0.9);
    w.start(s.x0, s.y0, s.angle, len, k);
    this.sfx.whip();
    navigator.vibrate?.([10, 20, 60]);
    this.onCast?.('আগুনের চাবুক');
  }

  update(dt: number, now: number) {
    const k = clamp(Math.min(this.stage.W, this.stage.H) / 450, 0.8, 2.2);
    let heat = 0;

    for (const d of this.portals) {
      if (!d.active) continue;
      d.age += dt;
      if (d.age >= d.life) {
        d.stop();
        continue;
      }
      d.render(now);
      heat = Math.max(heat, 0.5 * d.fade);
      // সুইলিং রিং: কিনারা থেকে স্পর্শক বরাবর ছিটকে পড়া স্ফুলিঙ্গ
      const rate = (140 + d.R * 0.6) * d.fade;
      const n = Math.round(dt * rate * this.quality + Math.random());
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const sp = rnd(150, 520) * k;
        this.particles.emit(
          d.cx + c * d.R,
          d.cy + sn * d.R,
          2,
          -sn * sp + c * rnd(20, 120) * k,
          c * sp + sn * rnd(20, 120) * k,
          rnd(0.5, 1.2),
          rnd(1.5, 3.4) * k,
          1.3,
          -rnd(500, 900) * k,
          rnd(0.5, 1.0),
        );
      }
      this.sfx.fire(dt, 10 * d.fade);
    }

    for (const d of this.shields) {
      if (!d.active) continue;
      d.age += dt;
      if (d.age >= d.life) {
        d.stop();
        continue;
      }
      d.render(now);
      heat = Math.max(heat, 0.4 * d.fade);
      const rate = 70 * d.fade;
      const n = Math.round(dt * rate * this.quality + Math.random());
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const sp = rnd(30, 120) * k;
        this.particles.emit(d.cx + c * d.R * 0.97, d.cy + sn * d.R * 0.97, 2, c * sp, sn * sp, rnd(0.6, 1.2), rnd(1.4, 2.8) * k, 0.8, rnd(20, 90) * k, 1.2);
      }
    }

    for (const w of this.whips) {
      if (!w.active) continue;
      heat = Math.max(heat, 0.7);
      w.update(dt, now, this.particles, (x, y) => this.crack(x, y, k), this.quality);
    }
    this.heat = heat;
  }

  /** চাবুকের প্রান্তে ফটাস: স্ফুলিঙ্গের বিস্ফোরণ ও ঝাঁকুনি */
  private crack(x: number, y: number, k: number) {
    this.stage.shake = Math.max(this.stage.shake, 0.8);
    this.particles.emit(x, y, 3.4, 0, 0, 0.12, 42 * k, 0, 0, 0);
    const n = Math.round(80 * this.quality);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(200, 800) * k;
      this.particles.emit(x, y, 2, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.35, 0.9), rnd(1.6, 3.6) * k, 1.4, -400 * k, 1.8);
    }
  }
}
