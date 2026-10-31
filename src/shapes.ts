/**
 * আঙুলে আঁকা এক-টানা দাগ থেকে আকৃতি চেনা (বৃত্ত / ত্রিভুজ / সোজা দাগ)।
 * শুধু গণিত — ক্যামেরা বা WebGL লাগে না, তাই আলাদাভাবে পরীক্ষা করা যায়।
 *
 * পদ্ধতি:
 *  - সোজা দাগ: শুরু-শেষের দূরত্ব ≈ পুরো পথ, আর পথ সোজা রেখা থেকে বেশি সরে না।
 *  - বন্ধ আকৃতি (শুরু ≈ শেষ, একপাক ঘোরা): কেন্দ্র থেকে দূরত্বকে কোণের ফাংশন ধরে
 *    ২য়/৩য়/৪র্থ হারমোনিক মাপা। ৩য় হারমোনিক প্রবল = ত্রিভুজ, সব দুর্বল = বৃত্ত।
 */

export type ShapeKind = 'circle' | 'triangle' | 'line';

export interface Pt {
  x: number;
  y: number;
}

export interface Shape {
  kind: ShapeKind;
  /** ০..১, কতটা নিশ্চিত */
  score: number;
  /** কেন্দ্র */
  cx: number;
  cy: number;
  /** বৃত্তের ব্যাসার্ধ / ত্রিভুজের পরিব্যাসার্ধ / সোজা দাগের অর্ধ-দৈর্ঘ্য */
  r: number;
  /** সোজা দাগের দিক (শুরু→শেষ, রেডিয়ান); ত্রিভুজের একটি শীর্ষের কোণ */
  angle: number;
  /** আঁকার শুরু ও শেষ বিন্দু */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** পুরো পথের দৈর্ঘ্য */
  len: number;
}

export interface Recognition {
  shape: Shape | null;
  /** ডিবাগ লাইন: কেন এই সিদ্ধান্ত */
  info: string;
}

export interface ShapeOptions {
  /** এর চেয়ে ছোট দাগ উপেক্ষা (পিক্সেল) */
  minLen: number;
}

export const SHAPE_TUNING = {
  lineStraight: 0.8, // শুরু-শেষ দূরত্ব ÷ পথ
  lineDev: 0.12, // সর্বোচ্চ বাঁক ÷ জ্যা
  closeMax: 0.3, // বন্ধ ধরার সীমা (শুরু-শেষ দূরত্ব ÷ পথ)
  sweepMin: 0.82, // কমপক্ষে এতটা পাক (২π এর ভগ্নাংশ)
  aspectMin: 0.5, // বাউন্ডিং বক্সের সর্বনিম্ন প্রস্থ/উচ্চতা অনুপাত
  triA3: 0.12,
  triMax: 0.45, // এর চেয়ে বেশি হলে এলোমেলো আঁকিবুকি
  turnsMax: 1.35, // এক পাকের কত বেশি ঘুরলে আঁকিবুকি ধরব // ত্রিভুজের জন্য ৩য় হারমোনিক কমপক্ষে
  triOver: 1.15, // ৩য় হারমোনিক অন্যগুলোর কত গুণ বেশি হতে হবে
  circMax: 0.12, // বৃত্তের জন্য ৩য়/৪র্থ হারমোনিক সর্বোচ্চ
  circA2: 0.3, // বৃত্তের জন্য ২য় হারমোনিক (উপবৃত্ত) সর্বোচ্চ
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function dedupe(pts: Pt[], minD: number): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (dist(pts[i], out[out.length - 1]) >= minD) out.push(pts[i]);
  }
  return out;
}

/** আঙুলের কাঁপুনি কমাতে হালকা গড় (শুরু ও শেষ বিন্দু অপরিবর্তিত) */
function smooth(p: Pt[], w: number): Pt[] {
  const out = p.map((_, i) => {
    let x = 0;
    let y = 0;
    let c = 0;
    for (let k = -w; k <= w; k++) {
      const j = i + k;
      if (j >= 0 && j < p.length) {
        x += p[j].x;
        y += p[j].y;
        c++;
      }
    }
    return { x: x / c, y: y / c };
  });
  out[0] = p[0];
  out[out.length - 1] = p[p.length - 1];
  return out;
}

function pathLength(p: Pt[]): number {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]);
  return L;
}

/** সমান দূরত্বের n টি বিন্দুতে নতুন করে সাজানো */
function resample(p: Pt[], n: number): Pt[] {
  const L = pathLength(p);
  const step = L / (n - 1);
  const out: Pt[] = [{ x: p[0].x, y: p[0].y }];
  let prev = p[0];
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const cur = p[i];
    let d = dist(prev, cur);
    while (d > 0 && acc + d >= step) {
      const t = (step - acc) / d;
      const q = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
      out.push(q);
      prev = q;
      d = dist(prev, cur);
      acc = 0;
    }
    acc += d;
    prev = cur;
  }
  while (out.length < n) out.push({ x: p[p.length - 1].x, y: p[p.length - 1].y });
  return out.slice(0, n);
}

/** কোণ-ভিত্তিক ব্যাসার্ধ-প্রোফাইলের k-তম হারমোনিক (c0 এর অনুপাতে) */
function harmonics(r: number[], th: number[], ks: number[]) {
  const n = r.length;
  const span = th[n - 1] - th[0];
  let c0 = 0;
  for (let i = 0; i < n - 1; i++) c0 += ((r[i] + r[i + 1]) / 2) * (th[i + 1] - th[i]);
  c0 /= span;
  const res: Record<number, { a: number; phase: number }> = {};
  for (const k of ks) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n - 1; i++) {
      const rm = (r[i] + r[i + 1]) / 2;
      const tm = (th[i] + th[i + 1]) / 2;
      const dt = th[i + 1] - th[i];
      re += rm * Math.cos(k * tm) * dt;
      im -= rm * Math.sin(k * tm) * dt;
    }
    re /= span;
    im /= span;
    res[k] = { a: (2 * Math.hypot(re, im)) / c0, phase: Math.atan2(im, re) };
  }
  return { c0, h: res };
}

export function recognizeShape(raw: Pt[], opts: ShapeOptions): Recognition {
  const T = SHAPE_TUNING;
  if (raw.length < 8) return { shape: null, info: `few pts ${raw.length}` };
  const D = dedupe(raw, 2);
  if (D.length < 6) return { shape: null, info: 'few pts after dedupe' };
  const P = smooth(D, 2);
  const L = pathLength(P);
  if (L < opts.minLen) return { shape: null, info: `short L=${L.toFixed(0)}<${opts.minLen.toFixed(0)}` };

  const first = P[0];
  const last = P[P.length - 1];
  const gap = dist(first, last);
  const S = gap / L;

  // ---------- সোজা দাগ ----------
  if (S > T.lineStraight) {
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    let maxDev = 0;
    let flips = 0;
    let lastSign = 0;
    for (const p of P) {
      const sd = ((p.x - first.x) * dy - (p.y - first.y) * dx) / gap;
      const dev = Math.abs(sd);
      if (dev > maxDev) maxDev = dev;
      // দাগ চেনার রেখার দুই পাশে বারবার গেলে (আঁকাবাঁকা) সেটা সোজা দাগ নয়
      if (dev > gap * 0.05) {
        const sg = sd > 0 ? 1 : -1;
        if (lastSign !== 0 && sg !== lastSign) flips++;
        lastSign = sg;
      }
    }
    const devR = maxDev / gap;
    const info = `S=${S.toFixed(2)} dev=${devR.toFixed(2)} flips=${flips}`;
    if (flips >= 2 || (flips >= 1 && devR > 0.07)) return { shape: null, info: 'wavy ' + info };
    if (devR <= T.lineDev) {
      const sc = 0.6 + 0.4 * Math.min(clamp01((S - T.lineStraight) / 0.1), clamp01(1 - devR / T.lineDev));
      return {
        shape: {
          kind: 'line',
          score: sc,
          cx: (first.x + last.x) / 2,
          cy: (first.y + last.y) / 2,
          r: gap / 2,
          angle: Math.atan2(dy, dx),
          x0: first.x,
          y0: first.y,
          x1: last.x,
          y1: last.y,
          len: L,
        },
        info: 'line ' + info,
      };
    }
    return { shape: null, info: 'bent line ' + info };
  }

  // ---------- বন্ধ আকৃতি ----------
  if (S > T.closeMax) return { shape: null, info: `open S=${S.toFixed(2)}` };

  const R = resample(P, 64);
  let mx = 0;
  let my = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of R) {
    mx += p.x;
    my += p.y;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  mx /= R.length;
  my /= R.length;
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (Math.min(bw, bh) / Math.max(bw, bh) < T.aspectMin) {
    return { shape: null, info: `flat ${bw.toFixed(0)}x${bh.toFixed(0)}` };
  }

  const th: number[] = [];
  const rr: number[] = [];
  let prev = 0;
  let unwrapped = 0;
  for (let i = 0; i < R.length; i++) {
    const a = Math.atan2(R[i].y - my, R[i].x - mx);
    if (i === 0) unwrapped = a;
    else {
      let d = a - prev;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      unwrapped += d;
    }
    prev = a;
    th.push(unwrapped);
    rr.push(Math.hypot(R[i].x - mx, R[i].y - my));
  }
  const sweep = th[th.length - 1] - th[0];
  const turns = Math.abs(sweep) / (Math.PI * 2);

  // কোণ একই দিকে বাড়ুক (ঘড়ির কাঁটার উল্টোদিকে হলে উল্টে নিই)
  if (sweep < 0) {
    for (let i = 0; i < th.length; i++) th[i] = -th[i];
  }
  const info0 = `S=${S.toFixed(2)} turns=${turns.toFixed(2)}`;
  if (turns < T.sweepMin) return { shape: null, info: `arc ${info0}` };
  if (turns > T.turnsMax) return { shape: null, info: `scribble ${info0}` };

  // এক পাকের বেশি হলে প্রথম এক পাক নিই
  let nUse = th.length;
  const lim = th[0] + Math.PI * 2;
  for (let i = 1; i < th.length; i++) {
    if (th[i] > lim) {
      nUse = i + 1;
      break;
    }
  }
  const { c0, h } = harmonics(rr.slice(0, nUse), th.slice(0, nUse), [2, 3, 4]);
  const a2 = h[2].a;
  const a3 = h[3].a;
  const a4 = h[4].a;
  const info = `${info0} a2=${a2.toFixed(2)} a3=${a3.toFixed(2)} a4=${a4.toFixed(2)}`;

  const base = { cx: mx, cy: my, x0: first.x, y0: first.y, x1: last.x, y1: last.y, len: L };

  if (a3 >= T.triA3 && a3 <= T.triMax && a3 >= T.triOver * a2 && a3 >= T.triOver * a4) {
    const peak = c0 * (1 + a3);
    const ang = h[3].phase / 3;
    return {
      shape: {
        kind: 'triangle',
        score: 0.6 + 0.4 * Math.min(clamp01((a3 - T.triA3) / 0.12), clamp01(1 - S / T.closeMax)),
        r: peak,
        angle: sweep < 0 ? -ang : ang,
        ...base,
      },
      info: 'triangle ' + info,
    };
  }

  if (a3 <= T.circMax && a4 <= T.circMax && a2 <= T.circA2) {
    return {
      shape: {
        kind: 'circle',
        score: 0.6 + 0.4 * Math.min(clamp01(1 - Math.max(a3, a4) / T.circMax), clamp01(1 - S / T.closeMax)),
        r: c0,
        angle: 0,
        ...base,
      },
      info: 'circle ' + info,
    };
  }

  return { shape: null, info: 'closed? ' + info };
}
