import * as THREE from 'three';
import commonGlsl from './shaders/common.glsl?raw';
import vert from './shaders/mandala.vert.glsl?raw';
import frag from './shaders/mandala.frag.glsl?raw';
import glowVert from './shaders/glow.vert.glsl?raw';
import glowFrag from './shaders/glow.frag.glsl?raw';
import type { SharedUniforms } from './stage';
import { CONFIG } from './config';

export class Mandala {
  power = 0;
  target = 0;
  private vel = 0;
  R = 100;
  readonly center = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  private mesh: THREE.Mesh;
  private glow: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private glowMat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, shared: SharedUniforms, seed: number) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: commonGlsl + frag,
      uniforms: {
        uTime: { value: 0 },
        uPower: { value: 0 },
        uSeed: { value: seed },
        uMargin: { value: CONFIG.mandalaMargin },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;

    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      uniforms: {
        uTime: { value: 0 },
        uPower: { value: 0 },
        uSeed: { value: seed },
        uVideo: shared.uVideo,
        uDisp: shared.uDisp,
        uMirror: shared.uMirror,
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glowMat);
    this.glow.renderOrder = 1;
    this.glow.frustumCulled = false;
    this.glow.visible = false;

    scene.add(this.glow, this.mesh);
  }

  
  set(x: number, y: number, z: number, R: number, q: THREE.Quaternion) {
    this.center.set(x, y, z);
    this.R = R;
    this.quat.copy(q);
  }

  get visible() {
    return this.power > 0.004;
  }

  update(dt: number, now: number) {
    const opening = this.target > this.power;
    const omega = opening ? 13 : 18;
    const zeta = opening ? 0.62 : 1.0;
    const acc = omega * omega * (this.target - this.power) - 2 * zeta * omega * this.vel;
    this.vel += acc * dt;
    this.power += this.vel * dt;
    if (this.power < 0) {
      this.power = 0;
      this.vel = 0;
    }
    const vis = this.visible;
    this.mesh.visible = vis;
    this.glow.visible = vis;
    if (!vis) return;

    const p = Math.max(this.power, 0);
    const s = this.R * 2 * CONFIG.mandalaMargin * (0.6 + 0.4 * Math.min(p, 1.15));
    this.mesh.position.copy(this.center);
    this.mesh.quaternion.copy(this.quat);
    this.mesh.scale.set(s, s, 1);
    this.mat.uniforms['uTime'].value = now;
    this.mat.uniforms['uPower'].value = p;

    const g = this.R * 2 * 2.4;
    this.glow.position.set(this.center.x, this.center.y, -2);
    this.glow.scale.set(g, g, 1);
    this.glowMat.uniforms['uTime'].value = now;
    this.glowMat.uniforms['uPower'].value = p;
  }
}
