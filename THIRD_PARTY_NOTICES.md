# Third-Party Notices

This project bundles the following third-party software and model assets.

## Three.js

- Version: 0.186.1
- Copyright: © 2010-2026 three.js authors
- License: MIT
- Source: https://github.com/mrdoob/three.js
- Bundled files:
  - `vendor/three/build/three.module.js`
  - `vendor/three/build/three.core.js`
  - `vendor/three/addons/postprocessing/*`
  - `vendor/three/addons/shaders/*`
- Full license text: [`licenses/three-LICENSE.txt`](licenses/three-LICENSE.txt)

## MediaPipe Hands

- Package: `@mediapipe/hands` 0.4.1675469240
- Copyright: © Google LLC
- License: Apache License 2.0
- Source: https://github.com/google-ai-edge/mediapipe
- Documentation: https://developers.google.com/mediapipe/solutions/vision/hand_landmarker
- Bundled files:
  - `mediapipe/hands/hands.js`
  - `mediapipe/hands/hands.binarypb`
  - `mediapipe/hands/hands_solution_packed_assets.data`
  - `mediapipe/hands/hands_solution_packed_assets_loader.js`
  - `mediapipe/hands/hands_solution_simd_wasm_bin.js`
  - `mediapipe/hands/hands_solution_simd_wasm_bin.wasm`
  - `mediapipe/hands/hands_solution_wasm_bin.js`
  - `mediapipe/hands/hands_solution_wasm_bin.wasm`
  - `mediapipe/hands/hand_landmark_full.tflite`
  - `mediapipe/hands/hand_landmark_lite.tflite`
- Full license text: [`licenses/Apache-2.0.txt`](licenses/Apache-2.0.txt)

## Noto Serif SC (web font subset)

- Font: Noto Serif SC, regular 400 (subset of 254 Chinese glyphs used by the site)
- Copyright: © 2012 Google Inc.
- License: SIL Open Font License 1.1
- Source: https://github.com/notofonts/noto-cjk
- Bundled file: `assets/fonts/vivi-serif.woff2`
- Full license text: [`licenses/OFL-NotoSerifSC.txt`](licenses/OFL-NotoSerifSC.txt)

## Notes

All bundled assets are served locally. The hand-tracking model runs in the
visitor's browser; no camera frames are transmitted to a remote service by this
project.

The flower geometry, shaders, gesture-scoring logic, UI, and server are original
code written for this project.
