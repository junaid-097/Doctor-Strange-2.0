varying vec2 vUv;
uniform float uTime;
uniform float uPower;
uniform float uSeed;
uniform float uMargin;
uniform float uRot;

vec3 ramp(float x) {
  vec3 c = vec3(1.0, 0.20, 0.025) * smoothstep(0.0, 0.7, x) * 1.0;
  c += vec3(0.98, 0.58, 0.08) * smoothstep(0.3, 1.2, x) * 1.2;
  c += vec3(1.0, 0.88, 0.55) * smoothstep(0.9, 2.2, x) * 1.5;
  return c;
}

float hexDist(vec2 p) {
  p = abs(p);
  return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
}

vec4 hexCoords(vec2 uv) {
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return vec4(gv, uv - gv);
}

float triEdge(vec2 p, float R, float rotA) {
  float a = atan(p.y, p.x) + rotA;
  float s = TAU / 3.0;
  float q = cos(floor(0.5 + a / s) * s - a) * length(p);
  return abs(q - R * cos(PI / 3.0));
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0 * uMargin;
  float t = uTime;
  float P = clamp(uPower, 0.0, 1.2);
  float r = length(p);

  // ষড়ভুজ-জালি, ধীরে ঘোরে
  vec4 hc = hexCoords(rot(uRot + t * 0.10) * p * 4.4);
  float e = 0.5 - hexDist(hc.xy);
  float rnd = hash21(hc.zw + uSeed * 13.0);
  float grid = smoothstep(0.07, 0.0, e);
  float cell = pow(0.5 + 0.5 * sin(t * 2.2 + rnd * 6.2832 + r * 5.0), 4.0) * smoothstep(0.0, 0.25, e);

  // কেন্দ্র থেকে ছড়ানো শক্তির ঢেউ
  float rip = exp(-pow((fract(r * 0.9 - t * 0.45) - 0.5) / 0.12, 2.0));

  // কিনারা
  float rim = exp(-pow((r - 0.96) / 0.028, 2.0)) * 1.7 + exp(-pow((r - 0.96) / 0.12, 2.0)) * 0.4;
  float inner = exp(-pow((r - 0.86) / 0.012, 2.0)) * 0.7;

  // মাঝে উল্টোদিকে ঘোরা দুটি ত্রিভুজ
  float tri = (exp(-pow(triEdge(rot(uRot - t * 0.5) * p, 0.55, 0.0) / 0.012, 2.0)) + exp(-pow(triEdge(rot(uRot + t * 0.35) * p, 0.3, PI / 3.0) / 0.012, 2.0))) * 0.9;

  float mask = smoothstep(1.03, 0.98, r);
  float n = fbm(p * 5.0 + vec2(0.0, -t * 0.8));
  float inten = (grid * 0.75 * (0.55 + 0.7 * n) + cell * 0.3 + rip * 0.35 * smoothstep(0.9, 0.2, r) + inner + tri) * mask + rim;

  float reveal = smoothstep(P * 1.4 + 0.02, P * 1.4 - 0.25, r);
  inten *= reveal * smoothstep(0.0, 0.1, P);
  float fill = mask * reveal * min(P, 1.0) * 0.14;
  gl_FragColor = vec4(ramp(inten * 0.85) + vec3(1.0, 0.55, 0.12) * fill * 0.35, fill * 0.6);
}
