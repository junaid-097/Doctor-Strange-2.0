varying vec2 vUv;
varying vec2 vWorld;
uniform float uTime;
uniform float uPower;
uniform float uSeed;
uniform sampler2D uVideo;
uniform vec2 uDisp;
uniform float uMirror;

void main() {
  float d = length(vUv - 0.5) * 2.0;
  float fall = exp(-d * d * 3.4) * (1.0 - smoothstep(0.8, 1.0, d));
  float fl = 0.86 + 0.14 * sin(uTime * 23.0 + uSeed * 20.0) * sin(uTime * 7.3 + uSeed * 5.0);
  float vx = uMirror > 0.5 ? 0.5 - vWorld.x / uDisp.x : 0.5 + vWorld.x / uDisp.x;
  vec2 vuv = vec2(vx, 0.5 + vWorld.y / uDisp.y);
  vec3 v = texture2D(uVideo, clamp(vuv, 0.0, 1.0)).rgb;
  vec3 lightCol = vec3(1.0, 0.42, 0.09);
  vec3 add = lightCol * fall * clamp(uPower, 0.0, 1.2) * fl * (0.03 + 0.28 * v);
  gl_FragColor = vec4(add, 1.0);
}
