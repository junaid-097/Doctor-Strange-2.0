/**
 * Pure gesture helpers (no camera / WebGL needed, so they can be unit-tested):
 *  - pinch hysteresis (thumb tip + index tip)
 *  - flick detector: a fast, straight fingertip swipe  -> fire whip
 *  - push detector: open palm moving toward the camera -> shield
 */
import type { Shape } from './shapes';

export const GESTURE_TUNING = {
  /** thumb-index tip distance / hand size: below = pinched, above = released */
  pinchOn: 0.26,
  pinchOff: 0.42,
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
