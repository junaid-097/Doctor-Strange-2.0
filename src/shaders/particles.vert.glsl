attribute vec3 aPos;
attribute vec2 aVel;
attribute vec4 aInfo;
varying vec2 vQ;
varying float vAge;
varying float vSeed;

void main() {
  float age = aInfo.x;
  float size = aInfo.y * mix(1.0, 0.35, age);
  float speed = length(aVel);
  vec2 dir = speed > 1e-3 ? aVel / speed : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float len = size * (1.0 + aInfo.w * speed * 0.012);
  vec2 q = position.xy;
  vec2 off = dir * q.x * len * 2.0 + perp * q.y * size * 2.0;
  vQ = q * 2.0;
  vAge = age;
  vSeed = aInfo.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(vec3(aPos.xy + off, aPos.z), 1.0);
}
