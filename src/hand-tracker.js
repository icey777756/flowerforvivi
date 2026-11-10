/* ------------------------------------------------------------------ *
 * MediaPipe Hands controller + geometric gesture analysis
 * ------------------------------------------------------------------ */

const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];

const BASE_URL = new URL("mediapipe/hands/", document.baseURI).href;

const IS_COMPACT =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;

/**
 * Resolve a MediaPipe runtime file. The normal deployment reads files from
 * `mediapipe/hands/`; the single-file export injects an asset resolver that
 * returns in-memory Blob URLs instead.
 */
function resolveAsset(file) {
  const customResolver = window.__BLOOM_MEDIAPIPE_ASSET_RESOLVER__;
  if (typeof customResolver === "function") {
    const resolved = customResolver(file);
    if (resolved) return resolved;
  }
  return `${BASE_URL}${file}`;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function distance2d(a, b, aspect) {
  const dx = (a.x - b.x) * aspect;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function vector2d(a, b, aspect) {
  return { x: (b.x - a.x) * aspect, y: b.y - a.y };
}

function segmentDot(a, b, c, aspect) {
  // Dot product of the two limbs at b. A straight finger gives ~-1, a
  // completely folded finger gives ~+1.
  const v1 = vector2d(b, a, aspect);
  const v2 = vector2d(b, c, aspect);
  const l1 = Math.hypot(v1.x, v1.y) || 1;
  const l2 = Math.hypot(v2.x, v2.y) || 1;
  return (v1.x * v2.x + v1.y * v2.y) / (l1 * l2);
}

/**
 * Estimate how open the hand is. The scale uses the palm, so it works at
 * different distances from the camera. Returns a value in [0, 1].
 */
export function analyzeHand(landmarks, aspect = 16 / 9) {
  if (!landmarks || landmarks.length < 21) return null;

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];

  const palmLength = distance2d(wrist, middleMcp, aspect);
  const palmWidth = distance2d(indexMcp, pinkyMcp, aspect);
  const palmSize = Math.max(
    0.0001,
    palmLength * 0.78 + palmWidth * 0.22,
  );

  const fingerData = [
    { name: "index", mcp: 5, pip: 6, tip: 8, weight: 0.28 },
    { name: "middle", mcp: 9, pip: 10, tip: 12, weight: 0.28 },
    { name: "ring", mcp: 13, pip: 14, tip: 16, weight: 0.22 },
    { name: "pinky", mcp: 17, pip: 18, tip: 20, weight: 0.14 },
  ];

  let weighted = 0;
  let totalWeight = 0;
  const fingers = [];

  for (const finger of fingerData) {
    const mcp = landmarks[finger.mcp];
    const pip = landmarks[finger.pip];
    const tip = landmarks[finger.tip];

    const reach = distance2d(tip, mcp, aspect) / palmSize;
    const straightness = (1 - segmentDot(mcp, pip, tip, aspect)) * 0.5;
    const reachScore = smoothstep(0.34, 0.94, reach);
    const straightScore = smoothstep(0.42, 0.9, straightness);
    const extension = clamp01(reachScore * 0.66 + straightScore * 0.34);

    fingers.push({
      name: finger.name,
      extension,
      tip,
      pip,
      mcp,
    });

    weighted += extension * finger.weight;
    totalWeight += finger.weight;
  }

  // Thumb moves on a different axis, so its distance to the index knuckle is
  // a more reliable signal than reaching away from its own knuckle.
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const thumbMcp = landmarks[2];
  const thumbReach =
    distance2d(thumbTip, indexMcp, aspect) / palmSize;
  const thumbStraightness =
    (1 - segmentDot(thumbMcp, thumbIp, thumbTip, aspect)) * 0.5;
  const thumbExtension = clamp01(
    smoothstep(0.55, 1.23, thumbReach) * 0.7 +
      smoothstep(0.25, 0.85, thumbStraightness) * 0.3,
  );

  weighted += thumbExtension * 0.08;
  totalWeight += 0.08;

  const rawOpenness = clamp01(weighted / totalWeight);
  const openness = smoothstep(0.06, 0.94, rawOpenness);

  const palmPoints = [landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]];
  const palm = palmPoints.reduce(
    (acc, point) => {
      acc.x += point.x / palmPoints.length;
      acc.y += point.y / palmPoints.length;
      return acc;
    },
    { x: 0, y: 0 },
  );

  const pinchDistance = distance2d(thumbTip, landmarks[8], aspect) / palmSize;

  let state = "half";
  if (openness < 0.24) state = "fist";
  else if (openness > 0.7) state = "open";

  const handVector = vector2d(wrist, middleMcp, aspect);
  const roll = Math.atan2(handVector.x, -handVector.y);

  return {
    openness,
    rawOpenness,
    state,
    palm,
    indexTip: landmarks[8],
    thumbTip,
    middleTip: landmarks[12],
    wrist,
    roll,
    fingers,
    thumb: thumbExtension,
    pinch: clamp01(pinchDistance / 1.5),
    span: palmSize,
  };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      if (window.Hands) resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Hands script failed")), {
          once: true,
        });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    if (/^https?:/i.test(src)) script.crossOrigin = "anonymous";
    script.dataset.src = src;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error(`Failed to load ${src}`)),
      { once: true },
    );
    document.head.appendChild(script);
  });
}

export class HandTracker {
  constructor({ onResults, onStatus, onFrame } = {}) {
    this.onResults = onResults || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onFrame = onFrame || (() => {});
    this.hands = null;
    this.video = null;
    this.stream = null;
    this.running = false;
    this.starting = false;
    this._timer = 0;
    this._raf = 0;
    this._sending = false;
    this._openSmooth = null;
    this._smoothedLandmarks = null;
    this._state = null;
    this._lastSeenAt = 0;
    this._lastAnalysis = null;
    this._lastFrameAt = 0;
    this._consecutiveErrors = 0;
    this._handedness = null;
  }

  async _ensureHands() {
    if (this.hands) return;
    if (!window.Hands) {
      this.onStatus({ type: "loading-model", message: "正在下載手部模型" });
      await loadScript(resolveAsset("hands.js"));
    }
    if (typeof window.Hands !== "function") {
      throw new Error("MediaPipe Hands did not initialise.");
    }

    this.hands = new window.Hands({
      locateFile: (file) => resolveAsset(file),
    });
    this.hands.setOptions({
      maxNumHands: 1,
      // The lite model is ~2.6x smaller and noticeably faster on phones; the
      // gesture score comes from geometry, so accuracy stays comfortable.
      modelComplexity: IS_COMPACT ? 0 : 1,
      // Lower confidence + landmark smoothing keeps the hand from flickering
      // out every few frames on phone cameras.
      minDetectionConfidence: IS_COMPACT ? 0.6 : 0.62,
      minTrackingConfidence: IS_COMPACT ? 0.55 : 0.58,
      selfieMode: false,
    });
    this.hands.onResults((results) => this._handleResults(results));

    this.onStatus({ type: "loading-model", message: "正在喚醒手部模型" });
    await this.hands.initialize();
  }

  async start(video) {
    if (this.starting || this.running) return;
    this.starting = true;
    this.video = video;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("MEDIA_UNSUPPORTED");
      }

      this.onStatus({ type: "requesting", message: "正在請求鏡頭" });

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          // 960x540 keeps landmarks stable while asking far less of a phone's
          // ISP and MediaPipe pipeline than a full 720p stream.
          width: { ideal: IS_COMPACT ? 960 : 1280 },
          height: { ideal: IS_COMPACT ? 540 : 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      });

      video.srcObject = this.stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      await video.play();

      await new Promise((resolve) => {
        if (video.readyState >= 2 && video.videoWidth) {
          resolve();
          return;
        }
        const onReady = () => resolve();
        video.addEventListener("loadeddata", onReady, { once: true });
        setTimeout(resolve, 2200);
      });

      await this._ensureHands();

      this.running = true;
      this.starting = false;
      this._openSmooth = null;
      this._smoothedLandmarks = null;
      this._state = null;
      this._consecutiveErrors = 0;
      this._lastFrameAt = performance.now();
      this.onStatus({
        type: "running",
        message: "手勢已就緒",
        videoSize: {
          width: video.videoWidth || 1280,
          height: video.videoHeight || 720,
        },
      });
      this._pump();
    } catch (error) {
      this.starting = false;
      this.stopStream();
      throw error;
    }
  }

  _pump() {
    if (!this.running) return;
    if (document.hidden) {
      this._timer = window.setTimeout(() => this._pump(), 240);
      return;
    }

    const tick = async () => {
      if (!this.running) return;
      const started = performance.now();

      if (
        !this._sending &&
        this.video &&
        this.video.readyState >= 2 &&
        this.video.videoWidth
      ) {
        this._sending = true;
        try {
          await this.hands.send({ image: this.video });
          this._consecutiveErrors = 0;
        } catch (error) {
          console.warn("[HandTracker] detection frame failed", error);
          this._consecutiveErrors += 1;
          if (this._consecutiveErrors === 8) {
            this.onStatus({
              type: "warning",
              message: "手部追蹤出現波動，正在嘗試恢復",
            });
          }
        } finally {
          this._sending = false;
        }
      }

      const elapsed = performance.now() - started;
      const delay = Math.max(0, 1000 / 30 - elapsed);
      this._timer = window.setTimeout(() => {
        this._raf = requestAnimationFrame(tick);
      }, delay);
    };

    this._raf = requestAnimationFrame(tick);
  }

  _smoothLandmarks(landmarks, dt) {
    if (
      !this._smoothedLandmarks ||
      this._smoothedLandmarks.length !== landmarks.length
    ) {
      this._smoothedLandmarks = landmarks.map((point) => ({
        x: point.x,
        y: point.y,
        z: point.z || 0,
      }));
      return this._smoothedLandmarks;
    }

    const smoothed = this._smoothedLandmarks;
    for (let i = 0; i < landmarks.length; i += 1) {
      const point = landmarks[i];
      const target = smoothed[i];
      const dx = point.x - target.x;
      const dy = point.y - target.y;
      const dz = (point.z || 0) - target.z;
      // One-euro style: heavy smoothing while the finger is still, almost
      // no lag once it moves. This kills idle jitter without rubber-banding.
      const speed = Math.hypot(dx, dy) / Math.max(dt, 0.008);
      const alpha = Math.min(0.82, Math.max(0.22, 0.22 + speed * 0.5));
      target.x += dx * alpha;
      target.y += dy * alpha;
      target.z += dz * alpha;
    }
    return smoothed;
  }

  _classify(openness) {
    // Hysteresis: a hand sitting near a threshold must move clearly past it
    // before the state flips, which stops the HUD and the bloom from strobing.
    if (this._state === "open") {
      if (openness < 0.54) {
        this._state = openness < 0.28 ? "fist" : "half";
      }
    } else if (this._state === "fist") {
      if (openness > 0.34) {
        this._state = openness > 0.62 ? "open" : "half";
      }
    } else {
      if (openness < 0.22) this._state = "fist";
      else if (openness > 0.68) this._state = "open";
      else this._state = "half";
    }
    return this._state;
  }

  _handleResults(results) {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min(0.12, Math.max(0.012, (now - this._lastFrameAt) / 1000));
    this._lastFrameAt = now;

    const landmarks = results.multiHandLandmarks?.[0] || null;
    const handedness = results.multiHandedness?.[0] || null;
    this._handedness = handedness;

    if (!landmarks) {
      // Hold the last pose for ~300ms so one missed frame does not tear down
      // the hand state and make the flower snap.
      // Hold the pose for 600ms. A single missed detection must not clear
      // the skeleton, the HUD and the bloom target.
      if (now - this._lastSeenAt > 600) {
        this._openSmooth = null;
        this._smoothedLandmarks = null;
        this._state = null;
        this._lastAnalysis = null;
        this.onResults({ landmarks: null, gesture: null, handedness: null });
      }
      return;
    }

    this._lastSeenAt = now;
    const smoothedLandmarks = this._smoothLandmarks(landmarks, dt);
    const analyzed = analyzeHand(
      smoothedLandmarks,
      (this.video?.videoWidth || 16) / (this.video?.videoHeight || 9),
    );
    if (!analyzed) return;

    if (this._openSmooth === null) {
      this._openSmooth = analyzed.openness;
    } else {
      const response = analyzed.openness > this._openSmooth ? 8 : 6;
      this._openSmooth +=
        (analyzed.openness - this._openSmooth) *
        (1 - Math.exp(-dt * response));
    }

    analyzed.rawOpenness = analyzed.openness;
    analyzed.openness = this._openSmooth;
    analyzed.state = this._classify(analyzed.openness);

    this._lastAnalysis = analyzed;
    this.onResults({
      landmarks: smoothedLandmarks,
      gesture: analyzed,
      handedness,
    });
  }

  get lastAnalysis() {
    return this._lastAnalysis;
  }

  stopStream() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
  }

  stop() {
    this.running = false;
    this.starting = false;
    window.clearTimeout(this._timer);
    cancelAnimationFrame(this._raf);
    this._sending = false;
    this._lastAnalysis = null;
    this._openSmooth = null;
    this._smoothedLandmarks = null;
    this._state = null;
    this.stopStream();
    if (this.hands) this.hands.reset();
    this.onStatus({ type: "stopped", message: "鏡頭已關閉" });
  }

  async dispose() {
    this.stop();
    if (this.hands) {
      try {
        await this.hands.close();
      } catch {
        /* noop */
      }
      this.hands = null;
    }
  }
}

export { HAND_CONNECTIONS };
