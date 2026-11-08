import { HAND_CONNECTIONS } from "./hand-tracker.js?v=10";

const TIPS = new Set([4, 8, 12, 16, 20]);
const TIP_NAMES = [4, 8, 12, 16, 20];

function mix(a, b, t) {
  return a + (b - a) * t;
}

/**
 * A lightweight 2D overlay that mirrors the camera and draws the tracked
 * skeleton with a soft bioluminescent pen.
 */
export class HandOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.landmarks = null;
    this.gesture = null;
    this.video = null;
    this._lastTime = 0;
    this._fade = 0;
    this.resize();
  }

  setVideo(video) {
    this.video = video;
  }

  setHand(landmarks, gesture) {
    this.landmarks = landmarks;
    this.gesture = gesture;
  }

  resize(width = window.innerWidth, height = window.innerHeight) {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, width, height);
  }

  _videoMap() {
    const vw = this.video?.videoWidth || 1280;
    const vh = this.video?.videoHeight || 720;
    const scale = Math.max(this.width / vw, this.height / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    return {
      dw,
      dh,
      ox: (this.width - dw) / 2,
      oy: (this.height - dh) / 2,
    };
  }

  _map(point, map) {
    return {
      x: map.ox + (1 - point.x) * map.dw,
      y: map.oy + point.y * map.dh,
    };
  }

  _clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  draw(time) {
    const ctx = this.ctx;
    this._clear();

    const landmarks = this.landmarks;
    if (!landmarks || landmarks.length < 21) {
      this._fade = Math.max(0, this._fade - 0.06);
      return;
    }

    const dt = Math.min(0.06, Math.max(0.008, time - (this._lastTime || time)));
    this._lastTime = time;
    this._fade = Math.min(1, this._fade + dt * 5);
    const fade = this._fade;
    const openness = this.gesture?.openness ?? 0.5;
    const map = this._videoMap();
    const points = landmarks.map((point) => this._map(point, map));
    const warm = [
      Math.round(mix(255, 190, openness)),
      Math.round(mix(176, 161, openness)),
      Math.round(mix(159, 255, openness)),
    ];
    const rgb = `${warm[0]}, ${warm[1]}, ${warm[2]}`;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const palm = this.gesture?.palm
      ? this._map(this.gesture.palm, map)
      : points[9];
    const palmRadius = Math.max(this.width, this.height) * 0.1;
    const palmGlow = ctx.createRadialGradient(
      palm.x,
      palm.y,
      0,
      palm.x,
      palm.y,
      palmRadius,
    );
    palmGlow.addColorStop(0, `rgba(${rgb}, ${0.055 * fade})`);
    palmGlow.addColorStop(0.5, `rgba(${rgb}, ${0.018 * fade})`);
    palmGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = palmGlow;
    ctx.fillRect(
      palm.x - palmRadius,
      palm.y - palmRadius,
      palmRadius * 2,
      palmRadius * 2,
    );

    // Soft wide connection strokes create the bloom around the line work.
    ctx.beginPath();
    for (const [from, to] of HAND_CONNECTIONS) {
      ctx.moveTo(points[from].x, points[from].y);
      ctx.lineTo(points[to].x, points[to].y);
    }
    ctx.strokeStyle = `rgba(${rgb}, ${0.075 * fade})`;
    ctx.lineWidth = 5;
    ctx.stroke();

    // Fine skeleton.
    ctx.beginPath();
    for (const [from, to] of HAND_CONNECTIONS) {
      ctx.moveTo(points[from].x, points[from].y);
      ctx.lineTo(points[to].x, points[to].y);
    }
    ctx.strokeStyle = `rgba(${rgb}, ${0.3 * fade})`;
    ctx.lineWidth = 0.85;
    ctx.stroke();

    // Knuckles.
    for (let i = 0; i < points.length; i += 1) {
      if (TIPS.has(i)) continue;
      const p = points[i];
      const isKnuckle = [0, 5, 9, 13, 17].includes(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, isKnuckle ? 2.2 : 1.35, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb}, ${(isKnuckle ? 0.68 : 0.42) * fade})`;
      ctx.fill();
    }

    // Fingertips: a quiet orbital mark that opens with the hand.
    for (const tipIndex of TIP_NAMES) {
      const p = points[tipIndex];
      const isIndex = tipIndex === 8;
      const ringRadius = (isIndex ? 8.5 : 5.2) + openness * 1.8;
      const pulse = 1 + Math.sin(time * 2.1 + tipIndex * 0.7) * 0.06;

      ctx.beginPath();
      ctx.arc(p.x, p.y, ringRadius * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rgb}, ${(isIndex ? 0.42 : 0.18) * fade})`;
      ctx.lineWidth = isIndex ? 0.9 : 0.7;
      ctx.stroke();

      if (isIndex) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(time * 0.32);
        for (let tick = 0; tick < 4; tick += 1) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(ringRadius + 3.5, 0);
          ctx.lineTo(ringRadius + 8, 0);
          ctx.strokeStyle = `rgba(${rgb}, ${0.3 * fade})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        ctx.restore();
      }

      const tipGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, isIndex ? 22 : 12);
      tipGlow.addColorStop(0, `rgba(255, 248, 231, ${(isIndex ? 0.32 : 0.2) * fade})`);
      tipGlow.addColorStop(0.28, `rgba(${rgb}, ${(isIndex ? 0.12 : 0.07) * fade})`);
      tipGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = tipGlow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isIndex ? 22 : 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, isIndex ? 2.4 : 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 246, 228, ${0.82 * fade})`;
      ctx.fill();
    }

    ctx.restore();
  }

  clear() {
    this.landmarks = null;
    this.gesture = null;
    this._fade = 0;
    this._clear();
  }
}
