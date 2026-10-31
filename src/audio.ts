
export class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private humGain?: GainNode;
  private muted = false;
  private crackleAcc = 0;
  private fireAcc = 0;

  
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260;
    bp.Q.value = 0.8;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    src.connect(bp).connect(this.humGain).connect(this.master);
    src.start();
    void ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
  }

  
  update(dt: number, power: number, draw: number) {
    const ctx = this.ctx;
    if (!ctx || !this.humGain) return;
    const target = Math.min(power, 1) * 0.16 + Math.min(draw / 900, 1) * 0.09;
    this.humGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    this.crackleAcc += dt * (power * 16 + Math.min(draw / 120, 8));
    while (this.crackleAcc >= 1) {
      this.crackleAcc -= 1;
      this.crackle(0.08 + Math.random() * 0.1);
    }
  }

  /** আগুনের ফটফট শব্দ: rate = প্রতি সেকেন্ডে প্রায় কতবার */
  fire(dt: number, rate: number) {
    if (!this.ctx || rate <= 0) return;
    this.fireAcc += dt * rate;
    while (this.fireAcc >= 1) {
      this.fireAcc -= 1;
      this.crackle(0.1 + Math.random() * 0.14);
    }
  }

  private crackle(vol: number) {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800 + Math.random() * 3000;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const dur = 0.015 + Math.random() * 0.04;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(hp).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5, dur + 0.02);
  }

  whoosh(intensity = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * intensity, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    s.connect(bp).connect(g).connect(this.master);
    s.start(t, Math.random(), 0.9);
    for (let i = 0; i < 6; i++) setTimeout(() => this.crackle(0.18), 40 + i * 55);
  }

  /** পোর্টাল খোলার শব্দ: হুইশ + ওপরে ওঠা গভীর সুর */
  portal() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.whoosh(1.2);
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.95);
  }

  /** ঢালের শব্দ: ঝনঝনে তিন সুরের মিশ্রণ + ফটফট */
  shield() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    for (const [f, v] of [
      [330, 0.16],
      [495, 0.12],
      [660.5, 0.08],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 1.15);
    }
    for (let i = 0; i < 8; i++) setTimeout(() => this.crackle(0.14), i * 45);
  }

  /** চাবুকের শব্দ: সাঁই করে ছুটে যাওয়া, তারপর ০.৪২ সেকেন্ডে ফটাস */
  whip() {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.0;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(4200, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    s.connect(bp).connect(g).connect(this.master);
    s.start(t, Math.random(), 0.5);

    const tc = t + 0.42;
    const c = ctx.createBufferSource();
    c.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.9, tc);
    cg.gain.exponentialRampToValueAtTime(0.0001, tc + 0.1);
    c.connect(hp).connect(cg).connect(this.master);
    c.start(tc, Math.random() * 1.5, 0.12);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, tc);
    o.frequency.exponentialRampToValueAtTime(50, tc + 0.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5, tc);
    og.gain.exponentialRampToValueAtTime(0.0001, tc + 0.25);
    o.connect(og).connect(this.master);
    o.start(tc);
    o.stop(tc + 0.3);
  }

  boom() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.55);
    for (let i = 0; i < 12; i++) setTimeout(() => this.crackle(0.22), i * 28);
  }
}
