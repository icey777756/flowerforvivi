import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ------------------------------------------------------------------ *
 * Deterministic helpers
 * ------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const deg = THREE.MathUtils.degToRad;

/* ------------------------------------------------------------------ *
 * Flower construction
 * ------------------------------------------------------------------ */

const LAYERS = [
  {
    index: 0,
    count: 11,
    particles: 1180,
    length: 2.55,
    width: 0.96,
    baseRadius: 0.42,
    elevBase: 53,
    elevTip: 101,
    twist: 0.13,
    cup: 0.35,
    offset: 0.12,
    brightness: 1.06,
    palette: ["#ffbc6b", "#ff8f72", "#ff4b83", "#c08bff"],
    edgeTip: "#6d5bff",
  },
  {
    index: 1,
    count: 9,
    particles: 820,
    length: 1.95,
    width: 0.82,
    baseRadius: 0.32,
    elevBase: 39,
    elevTip: 83,
    twist: -0.16,
    cup: 0.4,
    offset: 0.46,
    brightness: 1.1,
    palette: ["#ffd58c", "#ff9e74", "#ff5f91", "#d0a2ff"],
    edgeTip: "#7b63ff",
  },
  {
    index: 2,
    count: 7,
    particles: 660,
    length: 1.42,
    width: 0.67,
    baseRadius: 0.22,
    elevBase: 25,
    elevTip: 68,
    twist: 0.2,
    cup: 0.46,
    offset: 0.08,
    brightness: 1.14,
    palette: ["#fff0bd", "#ffc27d", "#ff8e9f", "#e0baff"],
    edgeTip: "#8b74ff",
  },
  {
    index: 3,
    count: 5,
    particles: 510,
    length: 0.92,
    width: 0.52,
    baseRadius: 0.14,
    elevBase: 13,
    elevTip: 51,
    twist: -0.12,
    cup: 0.5,
    offset: 0.32,
    brightness: 1.2,
    palette: ["#fff8d0", "#ffd38e", "#ffafa6", "#f0d6ff"],
    edgeTip: "#a088ff",
  },
];

const CORE_PARTICLES = 950;

function createPetalGeometry(quality = 1) {
  const rng = mulberry32(0x0f10a1);
  const positions = [];
  const buds = [];
  const colorsOpen = [];
  const colorsBud = [];
  const sizes = [];
  const seeds = [];
  const delays = [];
  const glows = [];
  const cores = [];
  const edges = [];

  const color = new THREE.Color();
  const colorBud = new THREE.Color();
  const rootColor = new THREE.Color();
  const tipColor = new THREE.Color();
  const edgeColor = new THREE.Color();
  const edgeTipColor = new THREE.Color();
  const warm = new THREE.Color("#ffbf83");
  const rose = new THREE.Color("#ff7e9d");
  const white = new THREE.Color("#fff7e4");

  for (const spec of LAYERS) {
    rootColor.set(spec.palette[0]);
    tipColor.set(spec.palette[2]);
    edgeColor.set(spec.palette[3]);
    edgeTipColor.set(spec.edgeTip);

    for (let petal = 0; petal < spec.count; petal += 1) {
      const phi =
        spec.offset + (petal / spec.count) * Math.PI * 2 + (rng() - 0.5) * 0.075;
      const petalSeed = rng();
      const length = spec.length * (0.9 + rng() * 0.18);
      const width = spec.width * (0.84 + rng() * 0.24);
      const elevBase = spec.elevBase + (rng() - 0.5) * 7;
      const elevTip = spec.elevTip + (rng() - 0.5) * 9;
      const sideX = -Math.sin(phi);
      const sideZ = Math.cos(phi);
      const particleCount = Math.max(
        140,
        Math.round(spec.particles * quality * (0.9 + rng() * 0.18)),
      );

      for (let p = 0; p < particleCount; p += 1) {
        const u = Math.pow(rng(), 0.72);
        const v = rng() * 2 - 1;
        const edge = Math.pow(
          Math.sin(Math.PI * Math.pow(u, 0.82)),
          0.62,
        );

        const radialAngle =
          phi + spec.twist * Math.pow(u, 1.45) * (0.68 + petalSeed * 0.62);
        const elevation = deg(
          lerp(elevBase, elevTip, Math.pow(u, 0.88)) + (rng() - 0.5) * 1.8,
        );
        const radius = spec.baseRadius + u * length + (rng() - 0.5) * 0.035;

        const x = Math.cos(radialAngle) * Math.sin(elevation) * radius;
        const y = Math.cos(elevation) * radius;
        const z = Math.sin(radialAngle) * Math.sin(elevation) * radius;

        const lateral = v * width * edge;
        const cup = Math.sin(Math.PI * u) * v * v * width * spec.cup;
        const ruffle =
          Math.sin(u * Math.PI * 3.1 + petalSeed * 6.283 + v * 0.9) *
          0.028 *
          Math.pow(u, 1.4);

        const ox = x + sideX * lateral + (rng() - 0.5) * 0.025;
        const oy = y + cup + ruffle + (rng() - 0.5) * 0.025;
        const oz = z + sideZ * lateral + (rng() - 0.5) * 0.025;

        const budRadius =
          0.065 +
          0.3 *
            Math.pow(Math.sin(Math.PI * (0.08 + u * 0.82)), 0.82) +
          spec.index * 0.016;
        const budAngle =
          phi + v * 0.15 * Math.sin(Math.PI * u) + spec.index * 0.055;
        const budHeight =
          -0.34 + u * (1.62 + spec.index * 0.035) + (rng() - 0.5) * 0.028;
        const budR = budRadius * (1 + v * 0.11) + (rng() - 0.5) * 0.02;

        positions.push(ox, oy, oz);
        buds.push(
          Math.cos(budAngle) * budR,
          budHeight,
          Math.sin(budAngle) * budR,
        );

        const tipMix = smoothstep(0.12, 1, u);
        // The rim is a gradient: lavender at the base of the petal, deep
        // periwinkle at the tip, so the whole silhouette glows violet.
        const rim = Math.pow(Math.abs(v), 1.28) * 0.94;
        color
          .copy(rootColor)
          .lerp(tipColor, smoothstep(0.08, 0.96, u))
          .lerp(edgeColor, rim)
          .lerp(edgeTipColor, rim * smoothstep(0.28, 1, u) * 0.85);
        if (rng() > 0.965) color.lerp(white, 0.5);
        color.multiplyScalar(
          (0.72 + rng() * 0.56) * spec.brightness * (1 + rim * 0.18),
        );
        colorsOpen.push(color.r, color.g, color.b);

        colorBud
          .copy(warm)
          .lerp(rose, smoothstep(0.2, 1, u) * 0.46)
          .lerp(white, tipMix * 0.12)
          .multiplyScalar(0.58 + rng() * 0.18);
        colorsBud.push(colorBud.r, colorBud.g, colorBud.b);

        sizes.push(
          0.56 + rng() * 0.76 + (1 - u) * 0.08 + Math.abs(v) * 0.34,
        );
        seeds.push(rng());
        delays.push(spec.index * 0.07 + rng() * 0.58);
        glows.push(0.24 + rng() * 0.34 + edge * 0.36);
        cores.push(0);
        edges.push(rim);
      }
    }
  }

  // Stamens, pollen and the luminous heart of the flower.
  for (let i = 0; i < CORE_PARTICLES; i += 1) {
    const phi = rng() * Math.PI * 2;
    const kind = rng();
    let ox;
    let oy;
    let oz;

    if (kind < 0.4) {
      const reach = 0.1 + Math.pow(rng(), 0.7) * 0.8;
      const rise = 0.07 + Math.pow(rng(), 0.62) * 0.95;
      const t = 0.18 + rng() * 0.82;
      ox = Math.cos(phi) * reach * t + (rng() - 0.5) * 0.035;
      oz = Math.sin(phi) * reach * t + (rng() - 0.5) * 0.035;
      oy = rise * t + Math.sin(t * Math.PI) * 0.16 - 0.03;
    } else if (kind < 0.9) {
      const r = Math.sqrt(rng()) * 0.72;
      ox = Math.cos(phi) * r;
      oz = Math.sin(phi) * r;
      oy = 0.02 + rng() * 0.3 - r * 0.14;
    } else {
      const r = 0.12 + rng() * 0.62;
      ox = Math.cos(phi) * r;
      oz = Math.sin(phi) * r;
      oy = 0.35 + rng() * 1.05;
    }

    positions.push(ox, oy, oz);

    const budAngle = phi + (rng() - 0.5) * 0.4;
    const budR = 0.045 + Math.sqrt(rng()) * 0.26;
    buds.push(
      Math.cos(budAngle) * budR,
      -0.2 + rng() * 1.36,
      Math.sin(budAngle) * budR,
    );

    color
      .set("#ffd694")
      .lerp(new THREE.Color("#ffae63"), rng() * 0.72)
      .lerp(new THREE.Color("#ff7f8a"), Math.pow(rng(), 2) * 0.22);
    if (rng() > 0.96) color.lerp(white, 0.4);
    color.multiplyScalar(0.82 + rng() * 0.42);
    colorsOpen.push(color.r, color.g, color.b);

    colorBud
      .set("#ffd79d")
      .lerp(new THREE.Color("#ff9b9d"), rng() * 0.38)
      .multiplyScalar(0.8 + rng() * 0.35);
    colorsBud.push(colorBud.r, colorBud.g, colorBud.b);

    sizes.push(0.72 + Math.pow(rng(), 1.7) * 2.2);
    seeds.push(rng());
    delays.push(rng() * 0.34);
    glows.push(0.48 + rng() * 0.38);
    cores.push(1);
    edges.push(0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "aBudPosition",
    new THREE.Float32BufferAttribute(buds, 3),
  );
  geometry.setAttribute(
    "aColorOpen",
    new THREE.Float32BufferAttribute(colorsOpen, 3),
  );
  geometry.setAttribute(
    "aColorBud",
    new THREE.Float32BufferAttribute(colorsBud, 3),
  );
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aDelay", new THREE.Float32BufferAttribute(delays, 1));
  geometry.setAttribute("aGlow", new THREE.Float32BufferAttribute(glows, 1));
  geometry.setAttribute("aCore", new THREE.Float32BufferAttribute(cores, 1));
  geometry.setAttribute("aEdge", new THREE.Float32BufferAttribute(edges, 1));
  geometry.computeBoundingSphere();

  return geometry;
}

const PETAL_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uBloom;
  uniform float uBurst;
  uniform vec3 uPointer;
  uniform float uPointerStrength;
  uniform float uPointerRadius;
  uniform float uPixelRatio;
  uniform float uPointScale;

  attribute vec3 aBudPosition;
  attribute vec3 aColorOpen;
  attribute vec3 aColorBud;
  attribute float aSize;
  attribute float aSeed;
  attribute float aDelay;
  attribute float aGlow;
  attribute float aCore;
  attribute float aEdge;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;
  varying float vEdge;

  void main() {
    float denom = max(0.001, 1.0 - aDelay * 0.28);
    float localBloom = clamp((uBloom - aDelay * 0.28) / denom, 0.0, 1.0);
    localBloom = smoothstep(0.0, 1.0, localBloom);

    vec3 pos = mix(aBudPosition, position, localBloom);

    // Petals spiral open through the air instead of travelling in a straight line.
    float arc = sin(localBloom * 3.14159265);
    float ang = arc * (0.13 + aSeed * 0.22) * (0.35 + length(position.xz) * 0.16);
    float ca = cos(ang);
    float sa = sin(ang);
    pos.xz = mat2(ca, -sa, sa, ca) * pos.xz;

    // Idle breath.
    pos.y += sin(uTime * 0.78 + aSeed * 6.28318 + length(position.xz) * 1.4)
      * 0.026 * (0.35 + localBloom);

    // A pulse of light pushes outward whenever the hand opens.
    pos += normalize(pos + vec3(0.0001)) * uBurst * (0.12 + aSeed * 0.38);

    // The index fingertip quietly bends the flower toward itself.
    vec3 toPointer = uPointer - pos;
    float pointerDistance = length(toPointer);
    float pull = smoothstep(uPointerRadius, 0.0, pointerDistance);
    pull *= uPointerStrength * (0.2 + localBloom * 0.8);
    pos += normalize(toPointer + vec3(0.00001)) * pull * (0.22 + aSeed * 0.24);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float perspective = uPointScale / max(1.0, -mvPosition.z);

    gl_PointSize = aSize * perspective * uPixelRatio;
    gl_PointSize *= 1.0 + pull * 1.8 + uBurst * 0.32;
    gl_PointSize = clamp(gl_PointSize, 1.0, 24.0);

    float shimmer = sin(uTime * 1.35 + aSeed * 31.0) * 0.5 + 0.5;
    vColor = mix(aColorBud, aColorOpen, smoothstep(0.0, 0.76, localBloom));
    vColor *= (0.82 + shimmer * 0.24) + pull * 0.55 + uBurst * 0.5;

    vAlpha = aGlow * (0.4 + localBloom * 0.4) * (0.78 + shimmer * 0.22);
    float centerFade = mix(
      1.0,
      0.22 + 0.78 * smoothstep(0.0, 1.5, length(position.xz)),
      localBloom
    );
    centerFade = mix(centerFade, 1.0, aCore);
    vAlpha *= centerFade;
    vSeed = aSeed;
    vEdge = aEdge;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PETAL_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;
  varying float vEdge;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float d = length(centered) * 2.0;
    if (d > 1.0) discard;

    float core = smoothstep(1.0, 0.0, d);
    float glow = pow(max(0.0, 1.0 - d), 2.6);
    float alpha = vAlpha * smoothstep(1.0, 0.42, d);

    vec3 color = vColor * (0.38 + core * 0.86 + glow * 0.15);
    vec3 sparkle = mix(vec3(1.0, 0.78, 0.62), vec3(0.80, 0.72, 1.0), vEdge);
    color += sparkle * pow(core, 7.0) * 0.18;
    color += vec3(0.52, 0.40, 1.0) * glow * vEdge * 0.35;

    gl_FragColor = vec4(color, alpha);
  }
`;

const STAR_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSize;
  attribute float aPhase;
  attribute float aBright;
  attribute float aTwinkle;
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    // Each star drifts on its own slow orbit. The amplitude grows with the
    // phase term so no two stars move in lockstep.
    pos.x += sin(uTime * 0.14 + aPhase * 27.0) * (0.3 + aPhase * 1.0);
    pos.y += sin(uTime * 0.1 + aPhase * 13.0) * (0.1 + aPhase * 0.35);
    pos.z += cos(uTime * 0.07 + aPhase * 9.0) * 0.22;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float twinkle =
      sin(uTime * (0.35 + aTwinkle * 0.85) + aPhase * 17.0) * 0.5 + 0.5;
    gl_PointSize = clamp(
      aSize * uPixelRatio * (0.82 + twinkle * 0.38),
      1.0,
      11.0
    );
    gl_Position = projectionMatrix * mvPosition;
    vColor = aColor;
    vAlpha = aBright * (0.45 + twinkle * 0.55);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float d = length(centered) * 2.0;
    if (d > 1.0) discard;

    // A soft, mostly-filled disc keeps 1-3px stars visible, while the hot
    // centre and wide tail give the larger ones depth.
    float aa = smoothstep(1.0, 0.82, d);
    float falloff = pow(max(0.0, 1.0 - d), 1.5);
    float alpha = vAlpha * (0.4 + 0.6 * falloff) * aa;
    vec3 color = vColor * (0.78 + 0.9 * pow(max(0.0, 1.0 - d), 3.0));

    gl_FragColor = vec4(color, alpha);
  }
`;

function makeCanvasTexture(draw, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createHaloTexture() {
  return makeCanvasTexture((ctx, size) => {
    const c = size / 2;
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, "rgba(255, 240, 219, 0.72)");
    gradient.addColorStop(0.1, "rgba(255, 198, 165, 0.4)");
    gradient.addColorStop(0.28, "rgba(255, 139, 153, 0.16)");
    gradient.addColorStop(0.55, "rgba(174, 127, 232, 0.07)");
    gradient.addColorStop(1, "rgba(60, 30, 100, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
}

function createOrbTexture() {
  return makeCanvasTexture((ctx, size) => {
    const c = size / 2;
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, "rgba(255, 255, 244, 1)");
    gradient.addColorStop(0.04, "rgba(255, 246, 218, 0.98)");
    gradient.addColorStop(0.12, "rgba(255, 196, 155, 0.72)");
    gradient.addColorStop(0.28, "rgba(255, 118, 151, 0.24)");
    gradient.addColorStop(0.55, "rgba(155, 113, 255, 0.08)");
    gradient.addColorStop(1, "rgba(88, 44, 144, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }, 256);
}

function createStarfield() {
  const rng = mulberry32(0xa17f00);
  const count = 1000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const brights = new Float32Array(count);
  const twinkles = new Float32Array(count);
  const palette = [
    new THREE.Color("#fff6e8"),
    new THREE.Color("#ffd9c4"),
    new THREE.Color("#e4d6ff"),
    new THREE.Color("#ffffff"),
    new THREE.Color("#bcd2ff"),
    new THREE.Color("#ffc9e2"),
  ];
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const radius = 12 + rng() * 22;
    const theta = rng() * Math.PI * 2;
    const y = (rng() - 0.42) * 26;
    const spread = Math.sqrt(Math.max(0, radius * radius - y * y));
    positions[i * 3] = Math.cos(theta) * spread;
    positions[i * 3 + 1] = y * 0.65;
    positions[i * 3 + 2] = Math.sin(theta) * spread - 12;

    // Near stars are larger and brighter; far ones recede into the haze.
    const depth = (radius - 12) / 22;
    color
      .copy(palette[Math.floor(rng() * palette.length)])
      .multiplyScalar((0.9 + rng() * 0.55) * (1.08 - depth * 0.3));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    sizes[i] =
      (0.55 + Math.pow(rng(), 2.4) * 4.7) * (1.12 - depth * 0.45);
    brights[i] =
      (0.26 + Math.pow(rng(), 1.15) * 0.74) * (1.05 - depth * 0.28);
    twinkles[i] = 0.15 + rng() * 0.95;
    phases[i] = rng();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aBright", new THREE.BufferAttribute(brights, 1));
  geometry.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkles, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -2;
  return points;
}

/* ------------------------------------------------------------------ *
 * Scene
 * ------------------------------------------------------------------ */

export class BloomScene {
  constructor(canvas) {
    this.canvas = canvas;
    // Phones keep the silhouette intact with roughly half the particles and a
    // lower device-pixel cap: the bloom is additive and small, so the loss is
    // invisible while the frame time drops by more than half.
    const shortest = Math.min(window.innerWidth, window.innerHeight);
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    this.isMobile = shortest < 700 || Boolean(coarse);
    this.quality = this.isMobile ? 0.5 : 1;
    this.maxDpr = this.isMobile ? 1.6 : 1.75;
    this.burst = 0;
    this.pointerStrength = 0;
    this.pointerVisible = 0;
    this.spinSpeed = 0.09;
    this.raf = 0;
    this._time = 0;
    this._focus = new THREE.Vector3(0, 0, 0);
    this._focusTarget = new THREE.Vector3(0, 0, 0);
    this._focusScreen = new THREE.Vector2(0.5, 0.5);
    this._focusDirty = true;
    this._dpr = 1;
    this._size = new THREE.Vector2(1, 1);
    this._pointerNdc = new THREE.Vector2(0, 0);
    this._ndc = new THREE.Vector2();
    this._raycaster = new THREE.Raycaster();
    this._pointerWorld = new THREE.Vector3();
    this._pointerTarget = new THREE.Vector3();
    this._pointerReady = false;
    this._worldNormal = new THREE.Vector3();
    this._pointerPlane = new THREE.Plane();
    this._center = new THREE.Vector3();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
    this.camera.position.set(0, 5.4, 8.7);
    this.camera.lookAt(0, 0.18, 0);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.tilt = new THREE.Group();
    this.tilt.rotation.x = 0.15;
    this.root.add(this.tilt);

    this.spin = new THREE.Group();
    this.tilt.add(this.spin);

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createHaloTexture(),
        color: 0xffd5b5,
        transparent: true,
        opacity: 0.045,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.halo.scale.setScalar(6.4);
    this.halo.position.set(0, 0.2, -0.7);
    this.root.add(this.halo);

    this.starfield = createStarfield();
    this.starfield.rotation.y = 0.16;
    this.scene.add(this.starfield);

    this._buildSkyStars();
    this._buildOrbitStars();

    const geometry = createPetalGeometry(this.quality);
    this.petalMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBloom: { value: 0.34 },
        uBurst: { value: 0 },
        uPointer: { value: new THREE.Vector3(0, 0, 0) },
        uPointerStrength: { value: 0 },
        uPointerRadius: { value: 1.35 },
        uPixelRatio: { value: 1 },
        uPointScale: { value: 39 },
      },
      vertexShader: PETAL_VERTEX,
      fragmentShader: PETAL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    this.petals = new THREE.Points(geometry, this.petalMaterial);
    this.petals.frustumCulled = false;
    this.petals.renderOrder = 2;
    this.spin.add(this.petals);

    this.coreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createOrbTexture(),
        color: 0xffcba0,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.coreGlow.scale.setScalar(1.45);
    this.coreGlow.position.set(0, 0.16, 0.05);
    this.coreGlow.renderOrder = 1;
    this.spin.add(this.coreGlow);

    this.pointerOrb = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createOrbTexture(),
        color: 0xffe5c9,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.pointerOrb.scale.setScalar(0.8);
    this.pointerOrb.renderOrder = 20;
    this.scene.add(this.pointerOrb);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      0.24,
      0.3,
      0.42,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.resize(window.innerWidth, window.innerHeight);
    this._boundResize = () => this.resize(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", this._boundResize, { passive: true });
  }

  resize(width, height) {
    this._size.set(width, height);
    this._dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.renderer.setPixelRatio(this._dpr);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this._dpr);
    this.composer.setSize(width, height);

    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    const portraitFit = aspect < 1 ? Math.min(2.45, 1.04 / aspect) : 1;
    const heightFit =
      height < 560 ? Math.min(1.35, 600 / Math.max(1, height)) : 1;
    const distance = 9.65 * portraitFit * heightFit;
    const direction = new THREE.Vector3(0, 0.665, 0.747).normalize();
    this.camera.position.copy(direction.multiplyScalar(distance));
    this.camera.position.y += 0.2;
    this.camera.lookAt(0, 0.15, 0);
    this.camera.updateProjectionMatrix();

    this.petalMaterial.uniforms.uPixelRatio.value = this._dpr;
    // Keep the particles the same size *relative to the bloom* on every
    // viewport. Point size is driven by the vertical FOV, so it has to follow
    // the viewport height rather than the camera distance alone; otherwise a
    // short landscape screen collapses thousands of additive sprites into a
    // blown-out core.
    this._basePointScale = Math.max(14, 39 * (height / 900));
    this.petalMaterial.uniforms.uPointScale.value = this._basePointScale;
    this.starfield.material.uniforms.uPixelRatio.value = this._dpr;
    if (this.skyStars) {
      this.skyStars.material.uniforms.uPixelRatio.value = this._dpr;
    }
    if (this.orbitStars) {
      this.orbitStars.material.uniforms.uPixelRatio.value = this._dpr;
    }
    this.pointerOrb.visible = false;
    this._pointerReady = false;
    this._focusDirty = true;
    this._repositionSkyStars();
  }

  setFocus(x, y = 0.5) {
    // Screen-space anchor: x/y are viewport fractions (0.5 = centre). Mapping
    // through the camera keeps the composition identical on any aspect ratio.
    if (
      Math.abs(this._focusScreen.x - x) < 0.0005 &&
      Math.abs(this._focusScreen.y - y) < 0.0005
    ) {
      return;
    }
    this._focusScreen.set(x, y);
    this._focusDirty = true;
  }

  _computeFocusWorld() {
    // The camera matrices must be current before raycasting; resize() runs
    // before the next render, so refresh them explicitly.
    this.camera.updateMatrixWorld(true);
    const ndcX = this._focusScreen.x * 2 - 1;
    const ndcY = 1 - this._focusScreen.y * 2;
    this._raycaster.setFromCamera(this._ndc.set(ndcX, ndcY), this.camera);
    this.camera.getWorldDirection(this._worldNormal);
    this._pointerPlane.setFromNormalAndCoplanarPoint(
      this._worldNormal,
      this._center.set(0, 0, 0),
    );
    if (
      !this._raycaster.ray.intersectPlane(
        this._pointerPlane,
        this._focusTarget,
      )
    ) {
      this._focusTarget.set(0, 0, 0);
    }
    this._focusDirty = false;
  }

  triggerBurst(strength = 1) {
    this.burst = Math.max(this.burst, strength);
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this._ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(this._ndc, this.camera);
    this.root.getWorldPosition(this._center);
    this.camera.getWorldDirection(this._worldNormal);
    this._pointerPlane.setFromNormalAndCoplanarPoint(
      this._worldNormal,
      this._center,
    );
    const result = new THREE.Vector3();
    if (!this._raycaster.ray.intersectPlane(this._pointerPlane, result)) {
      result.copy(this._center);
    }
    return result;
  }

  _buildSkyStars() {
    const rng = mulberry32(0x51a9c0);
    const count = 190;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const brights = new Float32Array(count);
    const twinkles = new Float32Array(count);
    const palette = [
      new THREE.Color("#fff8ef"),
      new THREE.Color("#e9dcff"),
      new THREE.Color("#ffd9e6"),
      new THREE.Color("#bca8ff"),
      new THREE.Color("#cfe1ff"),
    ];
    const color = new THREE.Color();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 18);
    const hit = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    this._skyNdc = [];
    this.camera.updateMatrixWorld(true);

    for (let i = 0; i < count; i += 1) {
      const ndcX = -0.95 + rng() * 1.9;
      const ndcY = -0.92 + rng() * 1.82;
      this._skyNdc.push(new THREE.Vector2(ndcX, ndcY));
      ndc.set(ndcX, ndcY);
      this._raycaster.setFromCamera(ndc, this.camera);
      if (!this._raycaster.ray.intersectPlane(plane, hit)) {
        hit.set(0, 0, -18);
      }
      positions[i * 3] = hit.x;
      positions[i * 3 + 1] = hit.y;
      positions[i * 3 + 2] = hit.z;

      color
        .copy(palette[Math.floor(rng() * palette.length)])
        .multiplyScalar(0.85 + rng() * 0.5);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      sizes[i] = (0.6 + Math.pow(rng(), 2.1) * 4.3) * (0.9 + (ndcY + 1) * 0.08);
      brights[i] = 0.32 + Math.pow(rng(), 1.1) * 0.68;
      twinkles[i] = 0.15 + rng() * 0.9;
      phases[i] = rng();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aBright", new THREE.BufferAttribute(brights, 1));
    geometry.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkles, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
      },
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = -3;
    this.scene.add(points);
    this.skyStars = points;
  }

  _repositionSkyStars() {
    if (!this.skyStars || !this._skyNdc) return;
    this.camera.updateMatrixWorld(true);
    const positions = this.skyStars.geometry.attributes.position;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 18);
    const hit = new THREE.Vector3();
    for (let i = 0; i < this._skyNdc.length; i += 1) {
      this._raycaster.setFromCamera(this._skyNdc[i], this.camera);
      if (this._raycaster.ray.intersectPlane(plane, hit)) {
        positions.setXYZ(i, hit.x, hit.y, hit.z);
      }
    }
    positions.needsUpdate = true;
  }

  _buildOrbitStars() {
    const rng = mulberry32(0x2a61f0);
    const count = 120;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const brights = new Float32Array(count);
    const twinkles = new Float32Array(count);
    const palette = [
      new THREE.Color("#fff4dc"),
      new THREE.Color("#ffe1c6"),
      new THREE.Color("#ffd6ea"),
      new THREE.Color("#e6dcff"),
    ];
    const color = new THREE.Color();

    // A loose, flattened torus of fireflies around the bloom. It is parented
    // to the flower so it follows the focus, tilt and scale.
    for (let i = 0; i < count; i += 1) {
      const angle = rng() * Math.PI * 2;
      const radius = 3.15 + Math.pow(rng(), 0.9) * 1.45;
      const vertical = rng() * 2 - 1;
      const ringRadius = Math.sqrt(Math.max(0, 1 - vertical * vertical)) * radius;
      positions[i * 3] = Math.cos(angle) * ringRadius + (rng() - 0.5) * 0.4;
      positions[i * 3 + 1] = vertical * radius + 0.1;
      positions[i * 3 + 2] = Math.sin(angle) * ringRadius + (rng() - 0.5) * 0.4;

      color
        .copy(palette[Math.floor(rng() * palette.length)])
        .multiplyScalar(0.9 + rng() * 0.5);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      sizes[i] = 1.0 + Math.pow(rng(), 1.7) * 3.6;
      brights[i] = 0.56 + Math.pow(rng(), 1.05) * 0.44;
      twinkles[i] = 0.2 + rng() * 0.85;
      phases[i] = rng();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aBright", new THREE.BufferAttribute(brights, 1));
    geometry.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkles, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
      },
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 3;
    points.position.y = 0.55;

    const group = new THREE.Group();
    group.add(points);
    this.root.add(group);
    this.orbitGroup = group;
    this.orbitStars = points;
  }

  update(dt, input) {
    const {
      bloom: rawBloom = 0.4,
      pointer = null,
      pointerActive = false,
      pointerPinch = 0.5,
      handOffset = { x: 0, y: 0 },
      handTilt = 0,
      scale = 1,
      intro = false,
    } = input;
    const bloom = THREE.MathUtils.clamp(rawBloom, 0, 1);
    const safeDt = Math.max(0, Math.min(dt, 0.05));

    this._time += safeDt;
    if (this._focusDirty) this._computeFocusWorld();
    this._focus.lerp(
      this._focusTarget,
      1 - Math.exp(-safeDt * (intro ? 6 : 3)),
    );
    this.burst *= Math.exp(-safeDt * 2.6);
    if (this.burst < 0.001) this.burst = 0;

    this.petalMaterial.uniforms.uTime.value = this._time;
    this.petalMaterial.uniforms.uBloom.value = bloom;
    this.petalMaterial.uniforms.uBurst.value = this.burst;
    this.starfield.material.uniforms.uTime.value = this._time;
    this.starfield.rotation.y += safeDt * 0.004;
    // Whole-sky parallax: a barely-there drift that makes the field feel
    // suspended rather than printed on the background.
    const skyDriftX = Math.sin(this._time * 0.05) * 0.5;
    const skyDriftY = Math.cos(this._time * 0.037) * 0.35;
    this.starfield.position.x = skyDriftX;
    this.starfield.position.y = skyDriftY;
    if (this.skyStars) {
      this.skyStars.position.x = skyDriftX;
      this.skyStars.position.y = skyDriftY;
    }
    if (this.skyStars) {
      this.skyStars.material.uniforms.uTime.value = this._time;
    }
    if (this.orbitStars) {
      this.orbitStars.material.uniforms.uTime.value = this._time;
      this.orbitGroup.rotation.y += safeDt * 0.1;
      this.orbitGroup.rotation.x = Math.sin(this._time * 0.09) * 0.06;
      this.orbitGroup.rotation.z = Math.cos(this._time * 0.06) * 0.04;
    }
    this.bloomPass.strength = 0.2 + bloom * 0.06 + this.burst * 0.28;
    this.bloomPass.radius = 0.28 + bloom * 0.06;

    const targetX = this._focus.x + handOffset.x;
    const targetY = this._focus.y + handOffset.y;
    const follow = 1 - Math.exp(-safeDt * (intro ? 5 : 2.8));
    this.root.position.x = lerp(this.root.position.x, targetX, follow);
    this.root.position.y = lerp(this.root.position.y, targetY, follow);
    this.root.position.z = lerp(this.root.position.z, this._focus.z, follow);
    const targetScale = THREE.MathUtils.clamp(scale, 0.5, 1.4);
    this.root.scale.setScalar(
      lerp(this.root.scale.x, targetScale, 1 - Math.exp(-safeDt * 3.5)),
    );
    // Shrink the sprites with the flower so a scaled-down bloom keeps its
    // granular texture instead of fusing into a solid light.
    this.petalMaterial.uniforms.uPointScale.value =
      this._basePointScale * this.root.scale.x;
    this.root.rotation.z = lerp(
      this.root.rotation.z,
      handTilt * 0.16 + (intro ? 0.025 : 0),
      1 - Math.exp(-safeDt * 2.2),
    );

    this.spin.rotation.y += safeDt * this.spinSpeed;
    const pointerY =
      pointer && Number.isFinite(pointer.y)
        ? (pointer.y / Math.max(1, window.innerHeight) - 0.5) * 2
        : 0;
    this.tilt.rotation.x = lerp(
      this.tilt.rotation.x,
      0.15 + pointerY * 0.055 - handTilt * 0.035,
      1 - Math.exp(-safeDt * 2.4),
    );

    this.halo.material.opacity = 0.025 + bloom * 0.045;
    this.halo.scale.setScalar(6.2 + bloom * 0.8);
    this.coreGlow.material.opacity = 0.045 + bloom * 0.07;
    this.coreGlow.scale.setScalar(0.95 + bloom * 0.34);
    this.halo.material.rotation += safeDt * 0.008;

    this.root.updateMatrixWorld(true);

    if (pointerActive && pointer) {
      const targetWorld = this.screenToWorld(pointer.x, pointer.y);
      this._pointerTarget.copy(targetWorld);
      if (!this._pointerReady) {
        this._pointerWorld.copy(targetWorld);
        this._pointerReady = true;
      } else {
        this._pointerWorld.lerp(targetWorld, 1 - Math.exp(-safeDt * 14));
      }

      this.pointerOrb.visible = true;
      this.pointerOrb.position.copy(this._pointerWorld);
      const pulse = 0.84 + Math.sin(this._time * 2.4) * 0.08;
      const orbScale = (0.68 + bloom * 0.36 + (1 - pointerPinch) * 0.06) * pulse;
      this.pointerOrb.scale.setScalar(orbScale);
      this.pointerOrb.material.opacity = lerp(
        this.pointerOrb.material.opacity,
        0.36 + bloom * 0.24,
        1 - Math.exp(-safeDt * 5),
      );
      this.pointerStrength = lerp(
        this.pointerStrength,
        0.9,
        1 - Math.exp(-safeDt * 4),
      );

      const localPointer = this.petals.worldToLocal(
        this._pointerWorld.clone(),
      );
      this.petalMaterial.uniforms.uPointer.value.copy(localPointer);
      this.petalMaterial.uniforms.uPointerStrength.value = this.pointerStrength;
    } else {
      this.pointerStrength = lerp(
        this.pointerStrength,
        0,
        1 - Math.exp(-safeDt * 5),
      );
      this.petalMaterial.uniforms.uPointerStrength.value = this.pointerStrength;
      this.pointerOrb.material.opacity = lerp(
        this.pointerOrb.material.opacity,
        0,
        1 - Math.exp(-safeDt * 7),
      );
      if (this.pointerOrb.material.opacity < 0.01) {
        this.pointerOrb.visible = false;
      }
    }
  }

  render() {
    this.composer.render();
  }

  start(onFrame) {
    let previous = performance.now();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(Math.max((now - previous) / 1000, 0), 0.05);
      previous = now;
      onFrame(dt, this._time);
      this.render();
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    window.removeEventListener("resize", this._boundResize);
    this.petals.geometry.dispose();
    this.petalMaterial.dispose();
    this.starfield.geometry.dispose();
    this.starfield.material.dispose();
    if (this.skyStars) {
      this.skyStars.geometry.dispose();
      this.skyStars.material.dispose();
    }
    if (this.orbitStars) {
      this.root.remove(this.orbitGroup);
      this.orbitStars.geometry.dispose();
      this.orbitStars.material.dispose();
    }
    this.composer.dispose();
    this.renderer.dispose();
  }
}
