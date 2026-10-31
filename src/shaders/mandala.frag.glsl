varying vec2 vUv;
uniform float uTime;
uniform float uPower;
uniform float uSeed;
uniform float uMargin;

float reveal(float p, float start, float len) { return smoothstep(start, start + len, p); }

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / (dot(ba, ba) + 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

float polyEdge(vec2 p, float n, float R, float rotA) {
  float a = atan(p.y, p.x) + rotA;
  float s = TAU / n;
  float q = cos(floor(0.5 + a / s) * s - a) * length(p);
  return abs(q - R * cos(PI / n));
}

float layer(float d, float w) {
  return smoothstep(w, w * 0.25, d) + 0.08 * exp(-d / (w * 2.5));
}

float rune(vec2 q, float id) {
  float d = 1e3;
  for (int k = 0; k < 3; k++) {
    float s = id * 7.13 + float(k) * 3.71;
    vec2 a = vec2(floor(hash11(s) * 3.0) - 1.0, floor(hash11(s + 1.7) * 4.0) - 1.5) * 0.030;
    vec2 b = vec2(floor(hash11(s + 2.9) * 3.0) - 1.0, floor(hash11(s + 4.3) * 4.0) - 1.5) * 0.030;
    d = min(d, sdSeg(q, a, b));
  }
  if (hash11(id * 3.17 + 0.5) > 0.35) d = min(d, sdSeg(q, vec2(0.0, -0.045), vec2(0.0, 0.045)));
  return d;
}

vec3 ramp(float x) {
  vec3 c = vec3(1.0, 0.20, 0.025) * smoothstep(0.0, 0.7, x) * 1.15;
  c += vec3(0.95, 0.48, 0.05) * smoothstep(0.35, 1.3, x) * 1.1;
  c += vec3(0.95, 0.78, 0.45) * smoothstep(1.0, 2.4, x) * 1.5;
  return c;
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0 * uMargin;
  float t = uTime;
  float P = uPower;
  float r0 = length(p);

  vec2 w = vec2(fbm(p * 4.0 + vec2(t * 0.9, 0.0) + uSeed * 10.0),
                fbm(p * 4.0 + vec2(5.2, -t * 0.9) + uSeed * 10.0)) - 0.5;
  p += w * 0.03;
  float r = length(p);
  float a = atan(p.y, p.x);
  float sr = uSeed * TAU;
  float acc = 0.0;

  float v1 = reveal(P, 0.00, 0.40);
  acc += (layer(abs(r - 0.985), 0.012) + layer(abs(r - 0.925), 0.0065)) * v1;
  float tk = fract((a + t * 0.16 + sr) / TAU * 120.0);
  float tickM = smoothstep(0.935, 0.94, r) * smoothstep(0.975, 0.97, r);
  acc += smoothstep(0.10, 0.03, abs(tk - 0.5)) * tickM * 0.9 * v1;

  // বাইরের রিং ধরে ঘুরন্ত তিনটি আলোর বিন্দু, পেছনে লেজসহ
  float ringL = layer(abs(r - 0.985), 0.012);
  for (int k = 0; k < 3; k++) {
    float ang = t * 0.8 + float(k) * TAU / 3.0 + sr;
    float da = mod(a - ang + PI, TAU) - PI;
    float tail = da < 0.0 ? exp(da * 4.5) : 0.0;
    acc += ringL * tail * 1.6 * v1;
    acc += exp(-length(p - 0.985 * vec2(cos(ang), sin(ang))) * 55.0) * 1.4 * v1;
  }

  float v2 = reveal(P, 0.10, 0.45);
  const float N = 28.0;
  float ang2 = a - t * 0.10 + sr * 0.7;
  float cid = floor(ang2 / TAU * N);
  float cf = fract(ang2 / TAU * N) - 0.5;
  float lx = cf * TAU * r / N;
  float ly = r - 0.81;
  float bandM = smoothstep(0.738, 0.745, r) * smoothstep(0.882, 0.875, r);
  float rd = rune(vec2(lx, ly), cid + floor(uSeed * 97.0));
  acc += layer(rd, 0.0048) * bandM * v2 * 0.95;
  acc += (layer(abs(r - 0.74), 0.006) + layer(abs(r - 0.88), 0.006)) * v2;

  float v3 = reveal(P, 0.25, 0.45);
  acc += layer(abs(r - 0.705), 0.006) * v3;
  vec2 pa = rot(t * 0.20 + sr) * p;
  vec2 pb = rot(-t * 0.26 + sr) * p;
  acc += (layer(polyEdge(pa, 4.0, 0.705, 0.0), 0.0055) + layer(polyEdge(pb, 4.0, 0.705, PI / 4.0), 0.0055)) * v3;

  // ছোট বিন্দুর রিং
  float dn = 48.0;
  float dang = (a - t * 0.2 + sr) / TAU * dn;
  vec2 dq = vec2((fract(dang) - 0.5) * TAU * r / dn, r - 0.605);
  acc += layer(length(dq), 0.011) * 1.2 * v3;

  float v4 = reveal(P, 0.40, 0.40);
  vec2 pc = rot(-t * 0.35) * p;
  vec2 pd = rot(t * 0.31 + sr) * p;
  acc += (layer(polyEdge(pc, 3.0, 0.50, 0.0), 0.005) + layer(polyEdge(pd, 3.0, 0.50, PI / 3.0), 0.005)) * v4;
  float dk = fract((a + t * 0.3) / TAU * 36.0);
  acc += layer(abs(r - 0.50), 0.0045) * v4 * (0.55 + 0.45 * smoothstep(0.30, 0.5, dk) * smoothstep(0.9, 0.7, dk));

  // ১২ পাপড়ির ঢেউ-রিং
  float petal = 0.405 + 0.05 * cos(12.0 * (a + t * 0.25) + sr);
  acc += layer(abs(r - petal), 0.0045) * v4 * 0.6;

  float v5 = reveal(P, 0.55, 0.40);
  acc += (layer(abs(r - 0.30), 0.0055) + layer(abs(r - 0.215), 0.005)) * v5;
  float sp = fract((a - t * 0.5) / TAU * 12.0);
  acc += smoothstep(0.06, 0.015, abs(sp - 0.5)) * smoothstep(0.215, 0.22, r) * smoothstep(0.30, 0.295, r) * v5 * 0.9;

  float v6 = reveal(P, 0.70, 0.30);
  float fr = 0.12 + 0.035 * cos(8.0 * (a + t * 0.9));
  acc += layer(abs(r - fr), 0.005) * v6;
  acc += layer(abs(r - 0.07), 0.005) * v6 + exp(-r * r * 400.0) * 0.8 * v6;

  float heat = fbm(p * 3.0 + vec2(0.0, -t * 1.3) + uSeed * 7.0);
  float flick = 0.7 + 0.8 * heat;
  float nn = fbm(p * 4.5 - normalize(p + 1e-5) * t * 1.4 + uSeed * 3.0);
  float flame = pow(nn, 2.6) * smoothstep(1.33, 1.0, r0) * smoothstep(0.88, 1.0, r0) * 0.10 * reveal(P, 0.0, 0.4);
  float fill = 0.05 * smoothstep(1.0, 0.0, r0) + 0.07 * exp(-r0 * r0 * 7.0);

  float intensity = acc * flick + flame + fill * reveal(P, 0.0, 0.5);
  float mask = smoothstep(P * 1.35 + 0.02, P * 1.35 - 0.2, r0);
  float edge = smoothstep(1.34, 1.15, r0);
  intensity *= mask * edge * smoothstep(0.0, 0.12, P);
  intensity *= 1.0 + max(P - 1.0, 0.0) * 0.6;
  intensity *= 0.6;
  intensity = min(intensity, 1.5);
  gl_FragColor = vec4(ramp(intensity), 1.0);
}
