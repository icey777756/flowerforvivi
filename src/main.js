import * as THREE from "three";
import { BloomScene } from "./flower.js";
import { HandTracker } from "./hand-tracker.js";
import { HandOverlay } from "./hand-overlay.js";

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

const app = document.getElementById("app");
const canvas = document.getElementById("flower-canvas");
const handCanvas = document.getElementById("hand-canvas");
const video = document.getElementById("camera");
const intro = document.getElementById("intro");
const startCameraButton = document.getElementById("startCamera");
const startDemoButton = document.getElementById("startDemo");
const cameraButton = document.getElementById("cameraButton");
const toggleButton = document.getElementById("toggleButton");
const autoButton = document.getElementById("autoButton");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const gestureLabel = document.getElementById("gestureLabel");
const openPct = document.getElementById("openPct");
const meterFill = document.getElementById("meterFill");
const meterKnob = document.getElementById("meterKnob");
const bloomMeter = document.getElementById("bloomMeter");
const hudHint = document.getElementById("hudHint");
const toast = document.getElementById("toast");
const boot = document.getElementById("boot");
const bootText = document.getElementById("bootText");
const bootNote = document.getElementById("bootNote");
const fallback = document.getElementById("fallback");
const fallbackDemo = document.getElementById("fallbackDemo");
const inappNote = document.getElementById("inappNote");

const params = new URLSearchParams(window.location.search);
const UA = navigator.userAgent;
const IS_IOS =
  /iPad|iPhone|iPod/.test(UA) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const IS_IN_APP =
  /MicroMessenger|QQ\/|Weibo|AlipayClient|DingTalk|Toutiao|ByteDance|; wv\)/i.test(UA);

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const state = {
  mode: "idle",
  experience: false,
  cameraStarting: false,
  cameraReady: false,
  demoOpen: true,
  hasHand: false,
  lastHandAt: 0,
  gesture: null,
  landmarks: null,
  bloom: 0.32,
  targetBloom: 0.32,
  prevBloom: 0.32,
  lastBurstAt: 0,
  manualBloom: null,
  handOffsetX: 0,
  handOffsetY: 0,
  handTilt: 0,
  handTiltTarget: 0,
  pointer: { x: 0, y: 0, active: false, source: null },
  mouse: {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.42,
    moved: false,
  },
  pointerPinch: 0.5,
  lastHudUpdate: 0,
};

const drag = {
  active: false,
  id: null,
  startX: 0,
  startY: 0,
  base: 0,
  moved: 0,
  startedAt: 0,
};

let scene = null;
let overlay = null;
let toastTimer = 0;
let handTracker = null;
let wakeLock = null;
let loopRunning = false;

/* ------------------------------------------------------------------ *
 * Utilities
 * ------------------------------------------------------------------ */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function smoothstep(min, max, value) {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function padPercent(value) {
  return String(Math.round(clamp(value, 0, 1) * 100)).padStart(2, "0");
}

function haptic(duration = 8) {
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(duration);
  } catch {
    /* ignore */
  }
}

function showToast(message, kind = "", duration = 4200) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast is-visible${kind ? ` is-${kind}` : ""}`;
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, duration);
}

function hideToast() {
  window.clearTimeout(toastTimer);
  toast.classList.remove("is-visible");
}

function showBoot(message, withNote = false) {
  bootText.textContent = message;
  bootNote.hidden = !withNote;
  boot.hidden = false;
}

function hideBoot() {
  boot.hidden = true;
  bootNote.hidden = true;
}

function setStatusLabel(label) {
  statusText.textContent = label;
}

function markLive(kind) {
  statusDot.classList.remove("is-live", "is-demo", "is-error");
  if (kind === "camera") statusDot.classList.add("is-live");
  else if (kind === "demo") statusDot.classList.add("is-demo");
  else if (kind === "error") statusDot.classList.add("is-error");
}

function setPressed(button, pressed) {
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
}

function updateModeChrome() {
  app.dataset.mode = state.mode;
  const cameraOn = state.mode === "camera" && state.cameraReady;
  setPressed(cameraButton, cameraOn);
  setPressed(autoButton, state.mode === "auto");
  cameraButton.disabled = state.cameraStarting;
  cameraButton.title = cameraOn ? "关闭摄像头，改用触摸" : "开启摄像头手势";
  autoButton.title = state.mode === "auto" ? "停止自动呼吸" : "自动呼吸";
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  try {
    wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

function revealExperience() {
  if (state.experience) return;
  state.experience = true;
  document.body.classList.add("is-experiencing");
  canvas.style.cursor = "crosshair";
  requestWakeLock();
}

function setSearching(searching) {
  document.body.classList.toggle("is-searching", Boolean(searching));
}

function startLoop() {
  if (loopRunning || !scene) return;
  loopRunning = true;
  scene.start(frame);
}

function stopLoop() {
  if (!loopRunning || !scene) return;
  loopRunning = false;
  scene.stop();
}

function getVideoViewportPoint(point) {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = Math.max(width / vw, height / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const ox = (width - dw) / 2;
  const oy = (height - dh) / 2;
  return {
    x: ox + (1 - point.x) * dw,
    y: oy + point.y * dh,
  };
}

function describeCameraError(error) {
  if (!window.isSecureContext) {
    return "摄像头需要 HTTPS 页面。请通过 https:// 或 localhost 打开后重试。";
  }
  if (IS_IN_APP) {
    return "当前是应用内浏览器，摄像头被限制。请点右上角「···」选择在系统浏览器打开。";
  }
  if (!error) return "摄像头暂时无法启动，已切换到触摸模式。";
  if (error.message === "MEDIA_UNSUPPORTED") {
    return "当前浏览器不支持摄像头访问，已切换到触摸模式。";
  }
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "摄像头权限未开启。你仍可拖动画面体验花朵。";
  }
  if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
    return "没有找到可用的摄像头，已切换到触摸模式。";
  }
  if (error.name === "NotReadableError") {
    return "摄像头正被其他程序占用，已切换到触摸模式。";
  }
  if (/wasm|model|script|Hands|fetch|network/i.test(error.message || "")) {
    return "手部模型加载失败，已切换到触摸模式。请刷新页面后重试。";
  }
  console.error("[BLOOM] camera error", error);
  return "摄像头暂时无法启动，已切换到触摸模式。";
}

/* ------------------------------------------------------------------ *
 * Bloom control
 * ------------------------------------------------------------------ */

function setManualBloom(value, { burst = false } = {}) {
  const next = clamp(value, 0, 1);
  const previous = state.manualBloom ?? state.bloom;
  state.manualBloom = next;
  state.demoOpen = next > 0.5;
  if (burst && previous <= 0.55 && next > 0.55) {
    scene?.triggerBurst(0.9);
    haptic(10);
  }
  updateHud(true);
}

function takeOverBloom() {
  if (state.mode === "auto") {
    state.mode = "touch";
    state.manualBloom = clamp(state.bloom, 0, 1);
    updateModeChrome();
    markLive("demo");
    setStatusLabel("TOUCH MODE");
  }
}

function toggleBloom() {
  if (!state.experience) return;
  if (state.mode === "camera") {
    showToast("手势模式中 · 直接用握拳 / 张掌控制花朵", "", 2600);
    haptic(4);
    return;
  }
  takeOverBloom();
  const current = state.manualBloom ?? state.bloom;
  const next = current > 0.5 ? 0.04 : 0.98;
  setManualBloom(next);
  if (next > 0.5) {
    scene?.triggerBurst(1);
    haptic(12);
  } else {
    haptic(6);
  }
}

/* ------------------------------------------------------------------ *
 * Experience modes
 * ------------------------------------------------------------------ */

function resetCameraState() {
  if (handTracker && (handTracker.running || handTracker.starting)) {
    handTracker.stop();
  }
  state.cameraReady = false;
  state.cameraStarting = false;
  state.hasHand = false;
  state.landmarks = null;
  state.gesture = null;
  document.body.classList.remove("has-camera");
  if (overlay) {
    overlay.setVideo(video);
    overlay.clear();
  }
  setSearching(false);
}

function enterTouch({ message = "", quiet = false, keepBloom = false } = {}) {
  if (state.cameraStarting) {
    showToast("摄像头正在启动，请稍候…", "", 2200);
    return;
  }

  hideBoot();
  resetCameraState();

  state.mode = "touch";
  state.manualBloom = keepBloom ? clamp(state.bloom, 0, 1) : null;
  state.demoOpen = keepBloom ? state.bloom > 0.5 : true;
  state.pointerPinch = 0.45;

  revealExperience();
  updateModeChrome();
  markLive("demo");
  setStatusLabel("TOUCH MODE");

  if (!state.mouse.moved) {
    state.pointer.x = window.innerWidth * 0.5;
    state.pointer.y = window.innerHeight * 0.42;
  } else {
    state.pointer.x = state.mouse.x;
    state.pointer.y = state.mouse.y;
  }
  state.pointer.active = true;
  state.pointer.source = "demo";

  if (!keepBloom) scene?.triggerBurst(0.55);

  if (message) {
    showToast(message, "", 4600);
  }

  updateHud(true);
}

function enterAuto({ quiet = false } = {}) {
  if (state.cameraStarting) return;
  hideBoot();
  resetCameraState();

  state.mode = "auto";
  state.manualBloom = null;
  state.pointerPinch = 0.5;

  revealExperience();
  updateModeChrome();
  markLive("demo");
  setStatusLabel("AUTO BLOOM");

  state.pointer.active = false;
  updateHud(true);

  if (!quiet) showToast("自动呼吸中 · 点「开合」随时接管", "", 4200);
}

async function startCameraFlow() {
  if (state.cameraStarting) return;
  if (handTracker?.running) return;

  state.cameraStarting = true;
  state.mode = "camera";
  state.manualBloom = null;
  revealExperience();
  updateModeChrome();
  markLive("camera");
  setStatusLabel("CONNECTING");
  showBoot("正在请求摄像头", false);
  setSearching(false);
  hideToast();

  if (overlay) {
    overlay.setVideo(video);
    overlay.clear();
  }

  try {
    await handTracker.start(video);
    state.cameraStarting = false;
    state.cameraReady = true;
    state.mode = "camera";
    state.hasHand = false;
    state.lastHandAt = 0;
    state.pointer.active = false;
    document.body.classList.add("has-camera");
    hideBoot();
    updateModeChrome();
    markLive("camera");
    setStatusLabel("CAMERA LIVE");
    setSearching(true);
    updateHud(true);
    showToast("手势已就绪 · 将手掌放入画面，握拳或张开", "ready", 4200);
  } catch (error) {
    state.cameraStarting = false;
    state.cameraReady = false;
    document.body.classList.remove("has-camera");
    hideBoot();
    const message = describeCameraError(error);
    enterTouch({ quiet: true });
    markLive("demo");
    setStatusLabel("TOUCH MODE");
    showToast(message, "error", 6000);
  }
}

function stopCameraAndDemo(message = "摄像头已关闭 · 改用触摸开合") {
  enterTouch({ message, quiet: true, keepBloom: true });
}

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

function onPointerMove(event) {
  state.mouse.x = event.clientX;
  state.mouse.y = event.clientY;
  state.mouse.moved = true;

  const canTease =
    !state.experience ||
    state.mode === "touch" ||
    state.mode === "auto" ||
    (state.mode === "camera" && !state.hasHand);

  if (canTease) {
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
    state.pointer.active = true;
    state.pointer.source = "mouse";
  }
}

function beginDrag(event) {
  if (!state.experience || state.mode === "camera") return;
  if (event.pointerType === "mouse" && event.button !== 0) return;

  drag.active = true;
  drag.id = event.pointerId;
  drag.startX = event.clientX;
  drag.startY = event.clientY;
  drag.base = state.manualBloom ?? state.bloom;
  drag.moved = 0;
  drag.startedAt = performance.now();

  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }

  if (state.mode === "auto") takeOverBloom();
  event.preventDefault();
}

function moveDrag(event) {
  if (!drag.active || event.pointerId !== drag.id) return;

  const distance = Math.hypot(
    event.clientX - drag.startX,
    event.clientY - drag.startY,
  );
  drag.moved = Math.max(drag.moved, distance);

  const delta = (drag.startY - event.clientY) / (window.innerHeight * 0.52);
  setManualBloom(drag.base + delta);
  event.preventDefault();
}

function endDrag(event) {
  if (!drag.active || event.pointerId !== drag.id) return;
  drag.active = false;

  const elapsed = performance.now() - drag.startedAt;
  if (elapsed < 340 && drag.moved < 14) {
    toggleBloom();
  }
}

/* Bloom meter behaves like a slider, so the flower is also controllable
 * with a precise horizontal gesture (and the keyboard on desktop). */

function meterValueFromX(clientX) {
  const rect = bloomMeter.getBoundingClientRect();
  return clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
}

function onMeterPointerDown(event) {
  if (!state.experience) return;
  if (state.mode === "camera") {
    showToast("手势模式中 · 直接用握拳 / 张掌控制花朵", "", 2400);
    return;
  }
  takeOverBloom();
  bloomMeter.classList.add("is-dragging");
  setManualBloom(meterValueFromX(event.clientX));
  try {
    bloomMeter.setPointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }
  event.preventDefault();
}

function onMeterPointerMove(event) {
  if (!bloomMeter.classList.contains("is-dragging")) return;
  setManualBloom(meterValueFromX(event.clientX));
  event.preventDefault();
}

function onMeterPointerUp() {
  bloomMeter.classList.remove("is-dragging");
}

function onMeterKeyDown(event) {
  if (!state.experience) return;
  const step = event.shiftKey ? 0.2 : 0.08;
  const current = state.manualBloom ?? state.bloom;
  let next = null;

  if (event.key === "ArrowRight" || event.key === "ArrowUp") next = current + step;
  else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = current - step;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = 1;
  else if (event.key === " " || event.key === "Enter") {
    toggleBloom();
  }

  if (next !== null) {
    takeOverBloom();
    setManualBloom(next);
    event.preventDefault();
  }
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return (
    target.isContentEditable ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON" ||
    tag === "A" ||
    target === bloomMeter
  );
}

function onKeyDown(event) {
  if (isTypingTarget(event.target)) return;

  if (event.code === "Space") {
    if (state.experience && state.mode !== "camera") {
      event.preventDefault();
      toggleBloom();
    }
    return;
  }

  if (event.key === "d" || event.key === "D") {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      enterTouch({ keepBloom: true });
    }
  }

  if (event.key === "c" || event.key === "C") {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      startCameraFlow();
    }
  }

  if (event.key === "a" || event.key === "A") {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      if (state.mode === "auto") enterTouch({ keepBloom: true, quiet: true });
      else enterAuto({ quiet: true });
    }
  }
}

function onVisibilityChange() {
  if (document.hidden) {
    hideToast();
    stopLoop();
    return;
  }
  startLoop();
  if (state.experience) requestWakeLock();
}

/* ------------------------------------------------------------------ *
 * Hand results
 * ------------------------------------------------------------------ */

function onHandResults({ landmarks, gesture }) {
  if (!landmarks || !gesture) {
    if (state.hasHand) {
      state.hasHand = false;
      state.gesture = null;
      state.landmarks = null;
      state.pointerPinch = 0.5;
      if (overlay) overlay.clear();
      setSearching(state.mode === "camera" && state.cameraReady);
    }
    return;
  }

  state.lastHandAt = performance.now();
  state.hasHand = true;
  state.landmarks = landmarks;
  state.gesture = gesture;
  state.pointerPinch = gesture.pinch;
  setSearching(false);

  const indexTip = getVideoViewportPoint(gesture.indexTip);
  state.pointer.x = indexTip.x;
  state.pointer.y = indexTip.y;
  state.pointer.active = true;
  state.pointer.source = "hand";

  const palm = getVideoViewportPoint(gesture.palm);
  const nx = palm.x / window.innerWidth - 0.5;
  const ny = palm.y / window.innerHeight - 0.5;
  state.handOffsetX = clamp(nx * 1.1, -0.7, 0.7);
  state.handOffsetY = clamp(-ny * 0.8, -0.45, 0.45);
  state.handTiltTarget = clamp(gesture.roll || 0, -0.9, 0.9);

  if (overlay) overlay.setHand(landmarks, gesture);
}

function onTrackerStatus(status) {
  if (!status) return;

  if (status.type === "requesting") {
    if (!boot.hidden) showBoot("正在请求摄像头", false);
  } else if (status.type === "loading-model") {
    if (!boot.hidden) showBoot(status.message || "正在唤醒手部模型", true);
  } else if (status.type === "warning") {
    showToast(status.message || "手部追踪出现波动", "", 2600);
  } else if (status.type === "stopped") {
    hideBoot();
    setSearching(false);
  }
}

/* ------------------------------------------------------------------ *
 * HUD
 * ------------------------------------------------------------------ */

const HUD_COPY = {
  idle: { label: "等待手掌", en: "WAITING" },
  waiting: { label: "等待手掌", en: "WAITING FOR HAND" },
  fist: { label: "—", en: "CLOSED · FIST" },
  half: { label: "—", en: "OPENING" },
  open: { label: "送你一朵小葳花", en: "BLOOM · OPEN" },
  touchOpen: { label: "送你一朵小葳花", en: "TOUCH · BLOOM" },
  touchHalf: { label: "—", en: "TOUCH · OPENING" },
  touchClosed: { label: "—", en: "TOUCH · BUD" },
  auto: { label: "呼吸", en: "AUTO · BREATH" },
};

function updateHud(force = false) {
  const now = performance.now();
  if (!force && now - state.lastHudUpdate < 70) return;
  state.lastHudUpdate = now;

  const pct = padPercent(state.bloom);
  openPct.textContent = pct;
  const pctValue = Math.round(clamp(state.bloom, 0, 1) * 100);
  meterFill.style.width = `${pctValue}%`;
  meterKnob.style.left = `${pctValue}%`;
  bloomMeter.setAttribute("aria-valuenow", String(pctValue));

  let key = "waiting";
  let hint = "";

  if (!state.experience) {
    key = "idle";
    hint = "等待你唤醒";
  } else if (state.mode === "touch") {
    key =
      state.bloom > 0.62
        ? "touchOpen"
        : state.bloom > 0.28
          ? "touchHalf"
          : "touchClosed";
    hint = "";
  } else if (state.mode === "auto") {
    key = "auto";
    hint = "自动呼吸中 · 点「开合」接管";
  } else if (state.mode === "camera" && state.hasHand && state.gesture) {
    key = state.gesture.state;
    if (key === "half") hint = "缓缓张开手掌";
  } else if (state.mode === "camera") {
    hint = "将手掌放入画面";
  }

  const copy = HUD_COPY[key] || HUD_COPY.waiting;
  if (gestureLabel.textContent !== copy.label) {
    gestureLabel.textContent = copy.label;
  }
  if (hudHint.textContent !== hint) hudHint.textContent = hint;
  app.dataset.gesture = key;
}

/* ------------------------------------------------------------------ *
 * Frame loop
 * ------------------------------------------------------------------ */

function chooseTargetBloom(time) {
  const breathing = Math.sin(time * 1.15) * 0.008;

  if (!state.experience) {
    return clamp(0.52 + Math.sin(time * 0.34) * 0.03 + breathing, 0, 1);
  }

  if (state.manualBloom !== null) {
    return clamp(state.manualBloom + breathing * 0.4, 0, 1);
  }

  if (state.mode === "auto") {
    const cycle = 0.5 - 0.5 * Math.cos(time * 0.36);
    return clamp(0.04 + cycle * 0.94, 0, 1);
  }

  if (state.mode === "touch") {
    const base = state.demoOpen ? 0.94 : 0.035;
    return clamp(base + (state.demoOpen ? breathing : 0), 0, 1);
  }

  if (state.mode === "camera") {
    if (state.hasHand && state.gesture) {
      const mapped = smoothstep(0.04, 0.9, state.gesture.openness);
      return clamp(0.025 + mapped * 0.955 + breathing, 0, 1);
    }
    return 0.17 + Math.sin(time * 0.45) * 0.015;
  }

  return 0.32;
}

function focusTarget() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const landscape = width > height;

  // The scene maps these viewport fractions through the camera, so the flower
  // sits at the same place on every phone instead of drifting with aspect.
  if (!state.experience) {
    if (landscape && height <= 560) return { x: 0.72, y: 0.46 };
    if (width <= 680) {
      return {
        x: 0.5,
        y: height < 660 ? 0.28 : height < 780 ? 0.305 : 0.325,
      };
    }
    if (width <= 1000) return { x: 0.7, y: 0.5 };
    return { x: 0.68, y: 0.51 };
  }

  if (landscape && height <= 560) return { x: 0.7, y: 0.42 };
  if (width <= 680) return { x: 0.5, y: 0.4 };
  return { x: 0.52, y: 0.4 };
}

function bloomScale() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width > height && height <= 560) return state.experience ? 0.9 : 1.02;
  if (width >= 900) return state.experience ? 0.82 : 1;
  // The opening screen gets a fuller bloom; it sits lower and larger.
  return state.experience ? 1 : 1.16;
}

function frame(dt, time) {
  state.targetBloom = chooseTargetBloom(time);

  const rising = state.targetBloom > state.bloom;
  const rate = rising ? 4.4 : 3.2;
  state.bloom = clamp(damp(state.bloom, state.targetBloom, rate, dt), 0, 1);

  if (
    state.bloom >= 0.45 &&
    state.prevBloom < 0.45 &&
    state.targetBloom > 0.65 &&
    state.experience &&
    time - state.lastBurstAt > 1.2
  ) {
    scene.triggerBurst(1);
    state.lastBurstAt = time;
  }
  state.prevBloom = state.bloom;

  if (
    state.mode === "camera" &&
    state.cameraReady &&
    state.hasHand &&
    performance.now() - state.lastHandAt > 380
  ) {
    state.hasHand = false;
    state.gesture = null;
    state.landmarks = null;
    state.handOffsetX = 0;
    state.handOffsetY = 0;
    state.pointerPinch = 0.5;
    if (overlay) overlay.clear();
    setSearching(true);
  }

  if (state.mode !== "camera" || !state.hasHand) {
    state.handOffsetX = damp(state.handOffsetX, 0, 2.2, dt);
    state.handOffsetY = damp(state.handOffsetY, 0, 2.2, dt);
    state.handTiltTarget = damp(state.handTiltTarget, 0, 2.2, dt);
  }
  state.handTilt = damp(state.handTilt, state.handTiltTarget, 3.2, dt);

  const focus = focusTarget();
  scene.setFocus(focus.x, focus.y);
  const pointer = state.pointer;
  const pointerIsActive =
    pointer.active &&
    (state.mode === "touch" ||
      state.mode === "auto" ||
      !state.experience ||
      (state.mode === "camera" && (state.hasHand || pointer.source === "mouse")));

  scene.update(dt, {
    bloom: state.bloom,
    pointer: pointerIsActive ? pointer : null,
    pointerActive: pointerIsActive,
    pointerPinch: state.pointerPinch,
    handOffset: { x: state.handOffsetX, y: state.handOffsetY },
    handTilt: state.handTilt,
    scale: bloomScale(),
    intro: !state.experience,
  });

  if (overlay) overlay.draw(time);
  updateHud(false);
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function wireEvents() {
  startCameraButton.addEventListener("click", () => startCameraFlow());
  startDemoButton.addEventListener("click", () => enterTouch());

  cameraButton.addEventListener("click", () => {
    if (state.cameraStarting) return;
    if (state.cameraReady && state.mode === "camera") {
      stopCameraAndDemo();
    } else {
      startCameraFlow();
    }
  });

  toggleButton.addEventListener("click", () => toggleBloom());

  autoButton.addEventListener("click", () => {
    if (state.mode === "auto") {
      enterTouch({ quiet: true, keepBloom: true });
      showToast("已接管 · 用「开合」继续调整", "", 2400);
      return;
    }
    enterAuto();
  });

  canvas.addEventListener("pointerdown", beginDrag);
  window.addEventListener("pointermove", moveDrag, { passive: false });
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("keydown", onKeyDown);
  document.addEventListener("visibilitychange", onVisibilityChange);

  bloomMeter.addEventListener("pointerdown", onMeterPointerDown);
  bloomMeter.addEventListener("pointermove", onMeterPointerMove);
  bloomMeter.addEventListener("pointerup", onMeterPointerUp);
  bloomMeter.addEventListener("pointercancel", onMeterPointerUp);
  bloomMeter.addEventListener("keydown", onMeterKeyDown);

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener(
    "resize",
    () => {
      overlay?.resize();
    },
    { passive: true },
  );

  window.addEventListener("pagehide", () => {
    handTracker?.stop();
    scene?.stop();
    loopRunning = false;
    releaseWakeLock();
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted && !document.hidden) startLoop();
  });

  fallbackDemo?.addEventListener("click", () => {
    window.location.reload();
  });
}

function init() {
  try {
    scene = new BloomScene(canvas);
  } catch (error) {
    console.error("[BLOOM] WebGL initialisation failed", error);
    fallback.hidden = false;
    canvas.style.display = "none";
    handCanvas.style.display = "none";
    fallbackDemo?.addEventListener("click", () => window.location.reload());
    return;
  }

  overlay = new HandOverlay(handCanvas);
  handTracker = new HandTracker({
    onResults: onHandResults,
    onStatus: onTrackerStatus,
  });

  if (IS_IN_APP) {
    inappNote.hidden = false;
  }

  wireEvents();
  updateModeChrome();
  updateHud(true);
  markLive("idle");
  setStatusLabel("STANDBY");
  intro.removeAttribute("aria-busy");

  startLoop();

  // Optional deep links: useful for kiosks, recordings and quick demos.
  if (params.get("demo") === "1") {
    window.setTimeout(() => enterTouch({ quiet: true }), 240);
  } else if (params.get("auto") === "1") {
    window.setTimeout(() => enterAuto({ quiet: true }), 240);
  } else if (params.get("camera") === "1") {
    window.setTimeout(() => startCameraFlow(), 420);
  } else if (params.get("intro") === "0") {
    window.setTimeout(() => enterTouch({ quiet: true }), 120);
  }

  // A tiny handle for creative debugging from the console.
  window.__BLOOM__ = {
    state,
    scene,
    get tracker() {
      return handTracker;
    },
    enterTouch,
    enterAuto,
    startCamera: startCameraFlow,
    setBloom: setManualBloom,
  };
}

init();
