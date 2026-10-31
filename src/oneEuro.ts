
class LowPass {
  y = 0;
  init = false;
  filter(x: number, a: number) {
    if (!this.init) {
      this.init = true;
      this.y = x;
      return x;
    }
    this.y = a * x + (1 - a) * this.y;
    return this.y;
  }
}

export class OneEuro {
  private x = new LowPass();
  private dx = new LowPass();
  private last = 0;
  private prev = 0;

  constructor(
    public minCutoff = 1.2,
    public beta = 0.02,
    public dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(v: number, t: number) {
    if (!this.x.init) {
      this.last = t;
      this.prev = v;
      this.dx.filter(0, 1);
      return this.x.filter(v, 1);
    }
    const dt = Math.max(1e-3, t - this.last);
    this.last = t;
    const dv = (v - this.prev) / dt;
    this.prev = v;
    const edv = this.dx.filter(dv, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edv);
    return this.x.filter(v, this.alpha(cutoff, dt));
  }

  reset() {
    this.x.init = false;
    this.dx.init = false;
  }
}
