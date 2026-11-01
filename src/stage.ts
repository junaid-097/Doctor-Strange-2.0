import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import passVert from './shaders/pass.vert.glsl?raw';
import gradeFrag from './shaders/grade.frag.glsl?raw';
import { CONFIG } from './config';

export interface SharedUniforms {
  uVideo: { value: THREE.Texture };
  uDisp: { value: THREE.Vector2 };
  uMirror: { value: number };
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(28, 1, 1, 20000);
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private videoMesh: THREE.Mesh;
  private videoTex: THREE.VideoTexture;
  readonly shared: SharedUniforms;

  W = 1;
  H = 1;
  pixelRatio = 1;
  dispW = 1;
  dispH = 1;
  mirror = true;
  shake = 0;
  heat = 0;
  private vw = 0;
  private vh = 0;
  private maxPR: number;

  constructor(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
    this.maxPR = Math.min(window.devicePixelRatio || 1, mobile ? CONFIG.mobileMaxPixelRatio : CONFIG.maxPixelRatio);
    this.pixelRatio = this.maxPR;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.videoTex = new THREE.VideoTexture(video);
    this.videoTex.colorSpace = THREE.SRGBColorSpace;
    this.videoTex.minFilter = THREE.LinearFilter;
    this.videoTex.magFilter = THREE.LinearFilter;
    this.videoTex.generateMipmaps = false;

    this.shared = {
      uVideo: { value: this.videoTex },
      uDisp: { value: new THREE.Vector2(1, 1) },
      uMirror: { value: 1 },
    };

    const vmat = new THREE.MeshBasicMaterial({
      map: this.videoTex,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    vmat.color.setScalar(CONFIG.videoBrightness);
    this.videoMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), vmat);
    this.videoMesh.renderOrder = -10;
    this.videoMesh.frustumCulled = false;
    this.scene.add(this.videoMesh);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(256, 256),
      CONFIG.bloom.strength,
      CONFIG.bloom.radius,
      CONFIG.bloom.threshold,
    );
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uAberr: { value: 0.002 },
        uVig: { value: CONFIG.vignette },
        uGrain: { value: CONFIG.grain },
        uShake: { value: 0 },
      },
      vertexShader: passVert,
      fragmentShader: gradeFrag,
    });
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
  }

  setMirror(m: boolean) {
    this.mirror = m;
    this.layoutVideo();
  }

  setPixelRatio(pr: number) {
    this.pixelRatio = Math.max(0.6, Math.min(pr, this.maxPR));
    this.resize();
  }

  resize() {
    this.W = Math.max(1, window.innerWidth);
    this.H = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.W, this.H, false);
    const c = this.renderer.domElement;
    c.style.width = this.W + 'px';
    c.style.height = this.H + 'px';
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.W, this.H);
    this.camera.aspect = this.W / this.H;
    this.camera.position.set(0, 0, this.H / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    (this.grade.uniforms['uRes'].value as THREE.Vector2).set(this.W * this.pixelRatio, this.H * this.pixelRatio);
    this.layoutVideo();
  }

  
  syncVideo(vw: number, vh: number) {
    if (!vw || !vh || (vw === this.vw && vh === this.vh)) return;
    this.vw = vw;
    this.vh = vh;
    this.layoutVideo();
  }

  private layoutVideo() {
    if (!this.vw) {
      this.dispW = this.W;
      this.dispH = this.H;
    } else {
      const s = Math.max(this.W / this.vw, this.H / this.vh);
      this.dispW = this.vw * s;
      this.dispH = this.vh * s;
    }
    this.videoMesh.scale.set(this.mirror ? -this.dispW : this.dispW, this.dispH, 1);
    this.shared.uDisp.value.set(this.dispW, this.dispH);
    this.shared.uMirror.value = this.mirror ? 1 : 0;
  }

  
  lmToWorld(l: { x: number; y: number; z: number }, out: THREE.Vector3): THREE.Vector3 {
    const x = (this.mirror ? 0.5 - l.x : l.x - 0.5) * this.dispW;
    const y = (0.5 - l.y) * this.dispH;
    const z = -l.z * this.dispW;
    return out.set(x, y, z);
  }

  render(dt: number, now: number) {
    this.shake *= Math.exp(-dt * 6);
    const u = this.grade.uniforms;
    u['uTime'].value = now;
    u['uShake'].value = this.shake;
    u['uAberr'].value = 0.0016 + this.heat * 0.0028 + this.shake * 0.004;
    this.composer.render(dt);
  }
}
