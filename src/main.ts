import './style.css';
import { Camera } from './camera';
import { Tracker } from './tracker';
import { Stage } from './stage';
import { HandSystem } from './hands';
import { Director } from './director';
import { Sfx } from './audio';
import { BodyFx } from './bodyfx';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('stage');
const video = $<HTMLVideoElement>('cam');
const splash = $('splash');
const startBtn = $<HTMLButtonElement>('start');
const statusEl = $('status');
const hint = $('hint');
const hud = $('hud');
const debugEl = $('debug');
const debug = new URLSearchParams(location.search).has('debug');

const camera = new Camera(video);
const tracker = new Tracker();
const sfx = new Sfx();
const stage = new Stage(canvas, video);
const hands = new HandSystem(stage);
const director = new Director(stage, hands, sfx);
const spellEl = $('spellName');
director.onCast = (name) => {
  spellEl.textContent = name;
  spellEl.classList.remove('show');
  void spellEl.offsetWidth; // এনিমেশন নতুন করে শুরু
  spellEl.classList.add('show');
};
const bodyFx = new BodyFx(stage, hands, sfx, director.particles);

const trackerReady = tracker.init().then(
  () => null,
  (e: unknown) => e,
);

// শরীর-ভাঙার মডেল পেছনে লোড হয়; না এলেও বাকি সব চলবে
void trackerReady.then((err) => {
  if (!err) bodyFx.init().catch((e: unknown) => console.warn('body segmenter unavailable', e));
});

const setStatus = (msg: string, err = false) => {
  statusEl.textContent = msg;
  statusEl.classList.toggle('err', err);
};

function cameraError(e: unknown): string {
  const name = (e as { name?: string; message?: string })?.name ?? '';
  const msg = (e as { message?: string })?.message ?? '';
  if (msg === 'INSECURE') return 'The camera needs an https link.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Allow camera permission, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera found.';
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close it and retry.';
  return 'Camera failed to start: ' + (msg || name);
}

let loopStarted = false;
let lastHandSeen = -100;

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  setStatus('Starting camera…');
  sfx.init();
  try {
    await camera.start('user');
  } catch (e) {
    setStatus(cameraError(e), true);
    startBtn.disabled = false;
    return;
  }
  stage.setMirror(camera.mirrored);
  setStatus('Loading…');
  const err = await trackerReady;
  if (err) {
    console.error(err);
    setStatus('Failed to load. Reload the page.', true);
    startBtn.disabled = false;
    return;
  }
  splash.classList.add('out');
  hud.classList.remove('hidden');
  hint.classList.remove('hidden');
  if (debug) debugEl.classList.remove('hidden');
  if (!loopStarted) {
    loopStarted = true;
    requestAnimationFrame(frame);
  }
});

$('btnFlip').addEventListener('click', async () => {
  try {
    await camera.start(camera.facing === 'user' ? 'environment' : 'user');
    stage.setMirror(camera.mirrored);
  } catch (e) {
    console.warn(e);
  }
});
const muteBtn = $('btnMute');
let muted = false;
muteBtn.addEventListener('click', () => {
  muted = !muted;
  sfx.setMuted(muted);
  muteBtn.classList.toggle('muted', muted);
});
const fsBtn = $('btnFs');
if (!document.documentElement.requestFullscreen) fsBtn.classList.add('hidden');
fsBtn.addEventListener('click', () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
});

let last = performance.now() / 1000;
let lastVideoTime = -1;
let fpsEma = 60;
let slowFrames = 0;

function frame(ms: number) {
  requestAnimationFrame(frame);
  const now = ms / 1000;
  const dt = Math.min(0.05, Math.max(0.001, now - last));
  last = now;

  stage.syncVideo(video.videoWidth, video.videoHeight);

  if (tracker.ready && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const res = tracker.detect(video);
    if (res && res.landmarks.length) {
      hands.ingest(res, now);
      lastHandSeen = now;
    }
  }
  hands.update(dt, now);
  director.update(dt, now);
  bodyFx.quality = director.quality;
  bodyFx.update(dt, now, video);
  stage.render(dt, now);

  hint.classList.toggle('hidden', now - lastHandSeen < 4);

  fpsEma += (1 / dt - fpsEma) * 0.05;
  if (fpsEma < 38) {
    slowFrames++;
  } else {
    slowFrames = 0;
  }
  if (slowFrames > 90 && stage.pixelRatio > 0.8) {
    stage.setPixelRatio(stage.pixelRatio * 0.82);
    director.quality = Math.max(0.5, director.quality * 0.85);
    slowFrames = 0;
  }

  if (debug) {
    const h0 = hands.hands[0];
    const h1 = hands.hands[1];
    const last = h0.lastShape.t >= h1.lastShape.t ? h0.lastShape : h1.lastShape;
    debugEl.textContent =
      `fps ${fpsEma.toFixed(0)}  pr ${stage.pixelRatio.toFixed(2)}  q ${director.quality.toFixed(2)}\n` +
      `tracker ${tracker.kind}/${tracker.delegate}/${tracker.source}\n` +
      `H0 ${h0.mode} [${h0.label || '-'} ${h0.score.toFixed(2)}] p=${director.mandalas[0].power.toFixed(2)}\n` +
      `H1 ${h1.mode} [${h1.label || '-'} ${h1.score.toFixed(2)}] p=${director.mandalas[1].power.toFixed(2)}\n` +
      `shape: ${last.kind} ${last.score.toFixed(2)} | ${last.info}`;
  }
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
