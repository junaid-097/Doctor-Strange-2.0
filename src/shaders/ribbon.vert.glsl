attribute vec2 aInfo;
varying vec2 vInfo;
void main() {
  vInfo = aInfo;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
