import * as THREE from 'three';
import vert from './shaders/particles.vert.glsl?raw';
import frag from './shaders/particles.frag.glsl?raw';

export class Particles {
  readonly mesh: THREE.Mesh;
  private aPos: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  private aInfo: THREE.InstancedBufferAttribute;
  private vx: Float32Array;
  private vy: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private gy: Float32Array;
  private drag: Float32Array;
  private head = 0;
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, readonly max: number) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.aInfo = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aInfo', this.aInfo);
    geo.instanceCount = max;

    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.gy = new Float32Array(max);
    this.drag = new Float32Array(max);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, life: number, size: number, stretch: number, gy: number, drag: number) {
    const i = this.head;
    this.head = (i + 1) % this.max;
    const pos = this.aPos.array as Float32Array;
    const vel = this.aVel.array as Float32Array;
    const info = this.aInfo.array as Float32Array;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    vel[i * 2] = vx;
    vel[i * 2 + 1] = vy;
    info[i * 4] = 0;
    info[i * 4 + 1] = size;
    info[i * 4 + 2] = Math.random();
    info[i * 4 + 3] = stretch;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.age[i] = 0;
    this.life[i] = life;
    this.gy[i] = gy;
    this.drag[i] = drag;
  }

  update(dt: number, now: number) {
    const pos = this.aPos.array as Float32Array;
    const vel = this.aVel.array as Float32Array;
    const info = this.aInfo.array as Float32Array;
    for (let i = 0; i < this.max; i++) {
      const life = this.life[i];
      if (life <= 0) continue;
      const age = this.age[i] + dt;
      if (age >= life) {
        this.life[i] = 0;
        info[i * 4 + 1] = 0;
        continue;
      }
      this.age[i] = age;
      const k = Math.exp(-this.drag[i] * dt);
      const turb = Math.sin(now * 9 + i * 1.7) * 18;
      this.vx[i] = this.vx[i] * k + turb * dt;
      this.vy[i] = this.vy[i] * k + this.gy[i] * dt;
      pos[i * 3] += this.vx[i] * dt;
      pos[i * 3 + 1] += this.vy[i] * dt;
      vel[i * 2] = this.vx[i];
      vel[i * 2 + 1] = this.vy[i];
      info[i * 4] = age / life;
    }
    this.aPos.needsUpdate = true;
    this.aVel.needsUpdate = true;
    this.aInfo.needsUpdate = true;
    this.mat.uniforms['uTime'].value = now;
  }
}
