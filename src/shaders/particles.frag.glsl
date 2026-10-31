varying vec2 vQ;
varying float vAge;
varying float vSeed;
uniform float uTime;

void main() {
  float core = smoothstep(1.0, 0.0, length(vQ));
  core = pow(core, 2.0);
  float hot = pow(core, 3.0);
  float flick = 0.75 + 0.25 * sin(vSeed * 91.0 + uTime * 45.0);
  vec3 col = mix(vec3(1.0, 0.52, 0.10), vec3(1.0, 0.95, 0.8), hot);
  col = mix(col, vec3(0.85, 0.12, 0.02), smoothstep(0.45, 1.0, vAge));
  float fade = (1.0 - vAge);
  fade *= fade;
  gl_FragColor = vec4(col * core * fade * flick * 2.2, 1.0);
}
