import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';

const WASM_SRC = 'node_modules/@mediapipe/tasks-vision/wasm';
const WASM_DST = 'public/wasm';
const MODEL = 'public/models/hand_landmarker.task';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

if (existsSync(WASM_SRC)) {
  mkdirSync(WASM_DST, { recursive: true });
  cpSync(WASM_SRC, WASM_DST, { recursive: true });
  console.log('[assets] wasm copied → public/wasm');
} else {
  console.warn('[assets] wasm not found, run npm install first');
}

const MODELS = [
  {
    file: 'public/models/gesture_recognizer.task',
    url: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
    label: 'gesture model',
  },
  { file: MODEL, url: MODEL_URL, label: 'hand model' },
  {
    file: 'public/models/selfie_segmenter.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
    label: 'body segmenter model',
    min: 100_000,
  },
];

for (const m of MODELS) {
  const ok = existsSync(m.file) && statSync(m.file).size > (m.min ?? 1_000_000);
  if (ok) {
    console.log('[assets] ' + m.label + ' already present');
    continue;
  }
  try {
    mkdirSync('public/models', { recursive: true });
    const res = await fetch(m.url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    writeFileSync(m.file, Buffer.from(await res.arrayBuffer()));
    console.log('[assets] ' + m.label + ' downloaded → ' + m.file);
  } catch (e) {
    console.warn('[assets] ' + m.label + ' download failed (' + e.message + '), will load from CDN at runtime');
  }
}
