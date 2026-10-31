import * as THREE from 'three';
import commonGlsl from './shaders/common.glsl?raw';
import vert from './shaders/ribbon.vert.glsl?raw';
import frag from './shaders/ribbon.frag.glsl?raw';
import { CONFIG } from './config';

interface Pt {
  x: number;
  y: number;
  t: number;
  w: number;
}

export class Ribbon {
  private pts: Pt[] = [];
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private info: Float32Array;
  private mat: THREE.ShaderMaterial;
  readonly mesh: THREE.Mesh;
  private max = CONFIG.trail.points;

  constructor(scene: THREE.Scene) {
    const m = this.max;
    this.pos = new Float32Array(m * 2 * 3);
    this.info = new Float32Array(m * 2 * 2);
    const idx = new Uint16Array((m - 1) * 6);
    for (let i = 0; i < m - 1; i++) {
      const a = i * 2;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aInfo', new THREE.BufferAttribute(this.info, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: commonGlsl + frag,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  add(x: number, y: number, t: number, w: number) {
    const last = this.pts[this.pts.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < 2.5) return;
    this.pts.push({ x, y, t, w });
    if (this.pts.length > this.max) this.pts.shift();
  }

  clear() {
    this.pts.length = 0;
  }

  update(now: number) {
    const life = CONFIG.trail.life;
    while (this.pts.length && now - this.pts[0].t > life) this.pts.shift();
    const n = this.pts.length;
    if (n < 2) {
      this.mesh.visible = false;
      this.geo.setDrawRange(0, 0);
      return;
    }
    this.mesh.visible = true;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const a = this.pts[Math.max(i - 1, 0)];
      const b = this.pts[Math.min(i + 1, n - 1)];
      let tx = b.x - a.x;
      let ty = b.y - a.y;
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      const nx = -ty;
      const ny = tx;
      const u = i / (n - 1);
      const age = Math.min((now - p.t) / life, 1);
      const w = p.w * Math.pow(u, 0.7) * (1 - age * 0.4);
      const k = i * 6;
      this.pos[k] = p.x + nx * w;
      this.pos[k + 1] = p.y + ny * w;
      this.pos[k + 2] = 1;
      this.pos[k + 3] = p.x - nx * w;
      this.pos[k + 4] = p.y - ny * w;
      this.pos[k + 5] = 1;
      const j = i * 4;
      const inten = u * (1 - age * 0.8);
      this.info[j] = inten;
      this.info[j + 1] = 1;
      this.info[j + 2] = inten;
      this.info[j + 3] = -1;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aInfo') as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.mat.uniforms['uTime'].value = now;
  }
}
