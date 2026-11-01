varying vec2 vUv;
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform vec2 uOrigin;
uniform float uAspect;
uniform float uFront;
uniform float uProg;
uniform float uTime;

float mk(vec2 uv) { return texture2D(uMask, uv).r; }

vec3 fireRamp(float x) {
  vec3 c = vec3(1.0, 0.18, 0.02) * smoothstep(0.0, 0.6, x) * 1.2;
  c += vec3(1.0, 0.50, 0.06) * smoothstep(0.3, 1.1, x) * 1.1;
  c += vec3(1.0, 0.85, 0.5) * smoothstep(0.9, 2.0, x) * 1.3;
  return c;
}

void main() {
  float t = uTime;

  // হাত থেকে আগুন ছড়িয়ে পড়ে: front এর ভেতরের অংশ জ্বলছে
  vec2 p = vUv - uOrigin;
  p.x *= uAspect;
  float dist = length(p);
  float reveal = smoothstep(uFront + 0.04, uFront - 0.06, dist);
  if (reveal <= 0.001) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float m = mk(vUv);

  // শিখা ওপরে ওঠে: নিচের শরীরের মাস্ক ওপরদিকে টেনে এনে জমা করা (দুলুনিসহ)
  float sw = fbm(vec2(vUv.x * 6.0 * uAspect, vUv.y * 3.0 - t * 1.4)) - 0.5;
  float H = 0.22;
  float jit = hash21(gl_FragCoord.xy + fract(t) * 37.0);
  float acc = 0.0;
  for (int i = 0; i < 10; i++) {
    float k = (float(i) + jit) / 9.5;
    float w = pow(max(1.0 - k, 0.0), 1.3);
    vec2 s0 = vec2(vUv.x + sw * 0.12 * k, vUv.y - k * H);
    float side = 0.6 * k * H / uAspect;
    acc = max(acc, mk(s0) * w);
    acc = max(acc, mk(s0 + vec2(side, 0.0)) * w * 0.85);
    acc = max(acc, mk(s0 - vec2(side, 0.0)) * w * 0.85);
  }

  // শিখার জিভ: লম্বাটে গতিশীল নয়েজ দিয়ে কাটা
  float n = fbm(vec2(vUv.x * 9.0 * uAspect, vUv.y * 3.6 - t * 2.4));
  float f = smoothstep(0.26, 0.80, acc * (0.22 + 1.9 * n));
  f *= 1.0 - 0.9 * m;

  // শরীরের কিনারা ধরে উজ্জ্বল গরম রেখা
  vec2 dx = vec2(uTexel.x * 2.0, 0.0);
  vec2 dy = vec2(0.0, uTexel.y * 2.0);
  float ed = clamp(abs(mk(vUv + dx) + mk(vUv - dx) + mk(vUv + dy) + mk(vUv - dy) - 4.0 * m) * 0.5, 0.0, 1.0);

  float x = f * 1.45 + ed * 0.4;
  vec3 col = fireRamp(x);

  // শরীরের ভেতরে হালকা তাপের আভা
  col += vec3(1.0, 0.30, 0.05) * m * (0.05 + 0.16 * fbm(vec2(vUv.x * 7.0 * uAspect, vUv.y * 4.0 - t * 1.8)));

  col *= reveal;
  // আগুন ছড়ানোর মুখে ঝলক
  col += vec3(1.0, 0.8, 0.4) * exp(-pow((dist - uFront) / 0.02, 2.0)) * acc * 0.45;

  col *= smoothstep(0.0, 0.1, uProg);
  gl_FragColor = vec4(col, 1.0);
}
