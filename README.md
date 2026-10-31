# mystic-hand-magic

Hand tracking in the browser with fire and spell effects drawn over the camera feed. Open palm gives a circle, one finger draws a trail (draw a loop to make a new circle), a fist breaks it apart. Two fingers (V sign) sets your body on fire; the body segmentation model (`selfie_segmenter.tflite`) loads in the background and the effect only runs while V is held. Fingertips of both hands facing each other make a golden spark bar.

Vite, TypeScript, three.js, MediaPipe Hands.

## Run

```
npm install
npm run dev
```

The camera only works on https. `npm run dev` serves a self-signed certificate, so open the https address it prints.

## Build

```
npm run build
```

Output goes to `dist/`. The build script downloads the MediaPipe wasm files and the hand model. If the model can't be downloaded the app loads it from a CDN instead.

## Deploy

GitHub Pages: push to `main`, then Settings → Pages → Source → GitHub Actions. The workflow in `.github/workflows` does the rest.

Vercel or Netlify: build command `npm run build`, output directory `dist`.

## Notes

Sizes, bloom and grain are in `src/config.ts`. The circle itself is a fragment shader in `src/shaders/mandala.frag.glsl`.

Gestures (open, fist, point, V) come from MediaPipe's GestureRecognizer plus a rotation-independent finger-straightness check on 3D world landmarks. If the gesture model can't load it falls back to the plain hand landmarker. Add `?debug` to the URL to see the detected mode and model label per hand.

Drawn spells: with one finger pointing, draw a shape and pause. A circle opens a spark-ring portal, a triangle raises a hex-grid shield, a straight line lashes a fire whip in the drawn direction. Shape recognition lives in `src/shapes.ts` (pure math, no camera needed), the spells in `src/spells.ts`. Tuning knobs are `CONFIG.shape` and `SHAPE_TUNING`; with `?debug` the last stroke's verdict and measurements are shown on screen.
