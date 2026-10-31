varying vec2 vUv;
uniform float uTime;
uniform float uPower;
uniform float uSeed;
uniform float uMargin;

vec3 ramp(float x) {
  vec3 c = vec3(1.0, 0.20, 0.025) * smoothstep(0.0, 0.7, x) * 1.15;
  c += vec3(0.95, 0.48, 0.05) * smoothstep(0.35, 1.3, x) * 1.1;
  c += vec3(0.95, 0.78, 0.45) * smoothstep(1.0, 2.4, x) * 1.5;
  return c;
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0 * uMargin;
  float t = uTime;
  float P = clamp(uPower, 0.0, 1.2);
  float r = length(p);
  float a = atan(p.y, p.x);
  vec2 cd = vec2(cos(a), sin(a));

  // রিংয়ের কিনারা আগুনের মতো দোলে
  float w = fbm(cd * 1.6 + vec2(t * 0.9, t * 0.5) + uSeed * 9.0);
  float rr = 1.0 + (w - 0.5) * 0.08;
  float d = abs(r - rr);
  float ring = exp(-d * d / 0.0012);
  float halo = exp(-d * d / 0.02) * 0.5;

  // রিংয়ের বাইরে শিখার জিভ
  float lk = fbm(cd * 2.4 + vec2(r * 9.0 - t * 3.2, t * 0.6) + uSeed * 5.0);
  float lick = pow(lk, 2.2) * smoothstep(1.34, 1.0, r) * smoothstep(0.97, 1.03, r) * 1.1;

  // ভেতরে ঘুরন্ত সর্পিল বাহু
  float sp = a + log(max(r, 0.03)) * 3.0 - t * 1.5;
  float arms = pow(0.5 + 0.5 * sin(sp * 3.0), 5.0) * smoothstep(0.98, 0.35, r) * smoothstep(0.02, 0.3, r) * 0.55;
  float core = exp(-r * r * 6.0) * 0.45;

  float inten = ring * 1.7 + halo + lick + arms + core;
  float reveal = smoothstep(P * 1.4 + 0.02, P * 1.4 - 0.25, r);
  inten *= reveal * smoothstep(0.0, 0.12, P);

  // ভেতরটা ভিডিওর ওপর গাঢ় হয়ে "ফাঁক"-এর মতো দেখায়
  float dark = smoothstep(1.02, 0.7, r) * 0.6 * reveal * min(P, 1.0);
  gl_FragColor = vec4(ramp(inten * 0.8), dark);
}
