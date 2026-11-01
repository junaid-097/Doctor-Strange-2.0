uniform sampler2D tDiffuse;
uniform float uTime;
uniform vec2 uRes;
uniform float uAberr;
uniform float uVig;
uniform float uGrain;
uniform float uShake;
varying vec2 vUv;

float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 rolloff(vec3 c) {
  vec3 over = max(c - 0.75, 0.0);
  return min(c, vec3(0.75)) + 0.25 * (1.0 - exp(-over / 0.25));
}

void main() {
  vec2 uv = vUv;
  uv += (vec2(h21(vec2(uTime, 1.7)), h21(vec2(uTime, 8.3))) - 0.5) * uShake * 0.012;
  vec2 c = uv - 0.5;
  float d = dot(c, c);
  vec2 off = c * uAberr * (0.6 + d * 2.5);
  vec3 col;
  col.r = texture2D(tDiffuse, uv + off).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - off).b;

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, 1.07);
  // সিনেমাটিক গ্রেড: ছায়ায় হালকা নীলচে, আলোয় উষ্ণ
  col *= mix(vec3(0.90, 1.0, 1.10), vec3(1.06, 1.0, 0.94), smoothstep(0.08, 0.7, lum));
  col *= 1.0 - uVig * smoothstep(0.08, 0.62, d * 2.0);
  float g = h21(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5;
  col += g * uGrain * (0.35 + (1.0 - clamp(lum, 0.0, 1.0)));
  col = rolloff(max(col, 0.0));
  gl_FragColor = vec4(col, 1.0);
}
