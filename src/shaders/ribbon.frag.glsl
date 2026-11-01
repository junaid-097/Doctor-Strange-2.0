varying vec2 vInfo;
uniform float uTime;

void main() {
  float across = abs(vInfo.y);
  float core = pow(max(1.0 - across, 0.0), 1.8);
  float n = vnoise(vec2(vInfo.x * 22.0 - uTime * 9.0, across * 3.0 + uTime * 2.0));
  float body = core * vInfo.x * (0.65 + 0.7 * n);
  float hot = pow(core, 6.0) * vInfo.x;
  vec3 col = vec3(1.0, 0.45, 0.07) * body * 2.0 + vec3(1.0, 0.92, 0.7) * hot * 2.6;
  gl_FragColor = vec4(col, 1.0);
}
