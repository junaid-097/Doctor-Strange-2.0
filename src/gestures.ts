/**
 * Pure gesture helpers (no camera / WebGL needed, so they can be unit-tested):
 *  - pinch hysteresis (thumb tip + index tip)
 *  - flick detector: a fast, straight fingertip swipe  -> fire whip
 *  - push detector: open palm moving toward the camera -> shield
 */
import type { Shape } from './shapes';

export const GESTURE_TUNING = {
  /** thumb-index tip distance / palm length (3D): below = pinched, above = released */
  pinchOn: 0.34,
  pinchOff: 0.55,
  /** frames the pinch must hold before a stroke starts (release is instant) */
  pinchFrames: 2,
  /** points recorded this close to pinch start / release are dropped (closing/opening motion) */
  pinchTrimStart: 0.06,
  pinchTrimEnd: 0.1,
  /** flick: window (s), min distance and speed as fractions of the short screen side, straightness */
  flickWin: 0.25,
  flickDist: 0.14,
  flickSpeed: 1.1,
  flickStraight: 1.3,
  flickCool: 0.7,
  /** push: window (s), size growth ratio, cooldown (s) */
  pushWin: 0.4,
  pushRatio: 1.28,
  pushCool: 1.2,
};

export function nextPinch(prev: boolean, d: number): boolean {
  const T = GESTURE_TUNING;
  return prev ? d < T.pinchOff : d < T.pinchOn;
}

interface TP {
  x: number;
  y: number;
  t: number;
}

export class FlickDetector {
  private h: TP[] = [];
  private lastFire = -100;
  info = '';

  reset() {
    this.h.length = 0;
  }

  /** returns a 'line' shape when a flick is detected at time t */
  push(x: number, y: number, t: number, minDim: number): Shape | null {
    const T = GESTURE_TUNING;
    this.h.push({ x, y, t });
    while (this.h.length && t - this.h[0].t > T.flickWin) this.h.shift();
    if (t - this.lastFire < T.flickCool || this.h.length < 3) return null;
    const a = this.h[0];
    const b = this.h[this.h.length - 1];
    const dt = b.t - a.t;
    if (dt < 0.08) return null;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    let path = 0;
    for (let i = 1; i < this.h.length; i++) path += Math.hypot(this.h[i].x - this.h[i - 1].x, this.h[i].y - this.h[i - 1].y);
    const speed = d / dt;
    this.info = `flick d=${(d / minDim).toFixed(2)} v=${(speed / minDim).toFixed(2)} str=${(path / Math.max(d, 1)).toFixed(2)}`;
    if (d < T.flickDist * minDim || speed < T.flickSpeed * minDim || path / d > T.flickStraight) return null;
    this.lastFire = t;
    this.h.length = 0;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    return {
      kind: 'line',
      score: 1,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      r: d / 2,
      angle: ang,
      x0: b.x,
      y0: b.y,
      x1: b.x + Math.cos(ang) * d,
      y1: b.y + Math.sin(ang) * d,
      len: d,
    };
  }
}

export class PushDetector {
  private h: { size: number; t: number }[] = [];
  private lastFire = -100;
  info = '';

  reset() {
    this.h.length = 0;
  }

  /** true when the hand grew fast enough (moved toward the camera) */
  push(size: number, t: number): boolean {
    const T = GESTURE_TUNING;
    this.h.push({ size, t });
    while (this.h.length && t - this.h[0].t > T.pushWin) this.h.shift();
    if (t - this.lastFire < T.pushCool || this.h.length < 4) return false;
    const a = this.h[0];
    if (t - a.t < 0.2) return false;
    const ratio = size / Math.max(a.size, 1e-3);
    this.info = `push x${ratio.toFixed(2)}`;
    if (ratio < T.pushRatio) return false;
    this.lastFire = t;
    this.h.length = 0;
    return true;
  }
}

/**
 * Two fists together, then pulled apart -> portal between the hands.
 * Works on the distance between the two hand centres, relative to hand size.
 */
export class SpreadDetector {
  private h: { d: number; t: number }[] = [];
  private lastFire = -100;
  info = '';

  reset() {
    this.h.length = 0;
  }

  /** d = distance between hand centres (px), size = average hand size (px). true when it fires */
  push(d: number, size: number, t: number): boolean {
    const T = SPREAD_TUNING;
    this.h.push({ d, t });
    while (this.h.length && t - this.h[0].t > T.win) this.h.shift();
    if (t - this.lastFire < T.cool || this.h.length < 4) return false;
    let dmin = Infinity;
    for (const p of this.h) dmin = Math.min(dmin, p.d);
    const gain = (d - dmin) / size;
    this.info = `spread start=${(dmin / size).toFixed(1)} now=${(d / size).toFixed(1)} gain=${gain.toFixed(1)}`;
    if (dmin > T.startMax * size || d < T.endMin * size || gain < T.gain) return false;
    this.lastFire = t;
    this.h.length = 0;
    return true;
  }
}

export const SPREAD_TUNING = {
  win: 0.9, // seconds to look back
  startMax: 2.0, // hands were at most this many hand-sizes apart
  endMin: 3.0, // and are now at least this many apart
  gain: 1.2, // and moved apart by at least this many hand-sizes
  cool: 1.5,
};
