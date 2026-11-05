// Hero arka planı: sinyal dalgası gibi salınan, imlece dalgalanarak tepki veren
// nokta zemini. Harici kütüphane yok, saf WebGL2.

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;

uniform mat4 uProjection;
uniform mat4 uView;
uniform float uTime;
uniform vec2 uPointer;
uniform float uPointerForce;
uniform float uRise;
uniform float uPixelRatio;

out float vFade;
out float vHeat;

void main() {
    vec3 p = vec3(aPosition.x, 0.0, aPosition.y);

    float wave = sin(p.x * 0.32 + uTime * 0.55) * 0.42
               + sin(p.z * 0.46 - uTime * 0.70) * 0.28
               + sin((p.x - p.z) * 0.85 + uTime * 1.20) * 0.07;

    float d = distance(p.xz, uPointer);
    float ripple = sin(d * 2.4 - uTime * 4.2) * exp(-d * 0.5) * 0.55 * uPointerForce;

    p.y = (wave + ripple) * uRise - (1.0 - uRise) * 1.6;

    vec4 viewPosition = uView * vec4(p, 1.0);
    gl_Position = uProjection * viewPosition;

    float depth = -viewPosition.z;
    gl_PointSize = clamp(24.0 / depth, 1.0, 5.0) * uPixelRatio;

    vFade = smoothstep(44.0, 9.0, depth) * smoothstep(0.8, 3.5, depth) * uRise;
    vHeat = clamp(smoothstep(0.18, 0.78, p.y) + exp(-d * 0.9) * uPointerForce, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in float vFade;
in float vHeat;

uniform vec3 uCold;
uniform vec3 uHot;
uniform float uOpacity;

out vec4 fragColor;

void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;

    float alpha = smoothstep(0.5, 0.12, r) * vFade * uOpacity;
    fragColor = vec4(mix(uCold, uHot, vHeat) * alpha, 1.0);
}`;

const BACKGROUND = [11 / 255, 11 / 255, 12 / 255];
const COLD = [0.26, 0.27, 0.25];
const HOT = [0.84, 1.0, 0.23];

const FIELD = { width: 36, near: 6, far: -44 };
const CAMERA = { eye: [0, 2.4, 7.5], target: [0, 0.2, -4], fov: (55 * Math.PI) / 180 };

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {{ state: { rise: number, scroll: number }, start(): void, stop(): void } | null}
 *   WebGL2 yoksa null döner; sayfa CSS arka planıyla devam eder.
 */
export function createSignalField(canvas, { reducedMotion = false } = {}) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  if (!program) return null;

  const uniforms = {};
  for (const name of [
    'uProjection',
    'uView',
    'uTime',
    'uPointer',
    'uPointerForce',
    'uRise',
    'uPixelRatio',
    'uCold',
    'uHot',
    'uOpacity',
  ]) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  const compact = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cols = compact ? 110 : 200;
  const rows = compact ? 90 : 160;
  const pointCount = cols * rows;

  const positions = new Float32Array(pointCount * 2);
  for (let r = 0, i = 0; r < rows; r++) {
    const z = FIELD.near + ((FIELD.far - FIELD.near) * r) / (rows - 1);
    for (let c = 0; c < cols; c++, i += 2) {
      positions[i] = -FIELD.width / 2 + (FIELD.width * c) / (cols - 1);
      positions[i + 1] = z;
    }
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  const location = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(program);
  gl.uniform3fv(uniforms.uCold, COLD);
  gl.uniform3fv(uniforms.uHot, HOT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.clearColor(...BACKGROUND, 1);

  // Dışarıdan (GSAP ile) canlandırılan değerler
  const state = { rise: reducedMotion ? 1 : 0, scroll: 0 };

  const pointer = {
    ndc: [0, 0], // imlecin ekran konumu (-1..1)
    target: [0, -6], // dalganın merkezi olması gereken zemin noktası
    current: [0, -6],
    force: 0,
    targetForce: 0,
    lastMove: -Infinity,
  };
  const eye = [...CAMERA.eye];
  let aspect = 1;
  let pixelRatio = 1;
  let frame = 0;
  let running = false;
  const startTime = performance.now();

  function resize() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    aspect = width / height;
    gl.viewport(0, 0, width, height);
    if (!running) render(performance.now());
  }

  // İmlecin altındaki zemin noktasını bul: kameradan ışın gönderip y=0 düzlemiyle kesiştir.
  function pointerToGround(ndcX, ndcY) {
    const forward = normalize(subtract(CAMERA.target, eye));
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = cross(right, forward);
    const tanHalf = Math.tan(CAMERA.fov / 2);
    const dir = normalize([
      forward[0] + right[0] * ndcX * tanHalf * aspect + up[0] * ndcY * tanHalf,
      forward[1] + right[1] * ndcX * tanHalf * aspect + up[1] * ndcY * tanHalf,
      forward[2] + right[2] * ndcX * tanHalf * aspect + up[2] * ndcY * tanHalf,
    ]);
    const t = dir[1] < -0.02 ? -eye[1] / dir[1] : 40;
    return [eye[0] + dir[0] * t, clamp(eye[2] + dir[2] * t, FIELD.far + 4, FIELD.near)];
  }

  function onPointerMove(event) {
    if (event.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    if (event.clientY > rect.bottom) return;
    pointer.ndc = [
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    ];
    pointer.target = pointerToGround(pointer.ndc[0], pointer.ndc[1]);
    pointer.targetForce = 1;
    pointer.lastMove = performance.now();
  }

  function render(now) {
    const time = (reducedMotion ? 12000 : now - startTime) / 1000;

    // İmleç bir süre hareketsizse dalga merkezi kendi kendine gezinir.
    if (!reducedMotion && now - pointer.lastMove > 2500) {
      pointer.target = [Math.sin(time * 0.23) * 7, -7 + Math.cos(time * 0.17) * 4];
      pointer.targetForce = 0.55;
      pointer.ndc = [pointer.ndc[0] * 0.98, pointer.ndc[1] * 0.98];
    }

    pointer.current[0] += (pointer.target[0] - pointer.current[0]) * 0.06;
    pointer.current[1] += (pointer.target[1] - pointer.current[1]) * 0.06;
    pointer.force += (pointer.targetForce - pointer.force) * 0.04;

    eye[0] += (CAMERA.eye[0] + pointer.ndc[0] * 0.6 - eye[0]) * 0.05;
    eye[1] += (CAMERA.eye[1] + pointer.ndc[1] * 0.25 + state.scroll * 1.8 - eye[1]) * 0.08;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(uniforms.uProjection, false, perspective(CAMERA.fov, aspect, 0.1, 100));
    gl.uniformMatrix4fv(uniforms.uView, false, lookAt(eye, CAMERA.target, [0, 1, 0]));
    gl.uniform1f(uniforms.uTime, time);
    gl.uniform2fv(uniforms.uPointer, pointer.current);
    gl.uniform1f(uniforms.uPointerForce, reducedMotion ? 0 : pointer.force);
    gl.uniform1f(uniforms.uRise, state.rise);
    gl.uniform1f(uniforms.uPixelRatio, pixelRatio);
    gl.uniform1f(uniforms.uOpacity, 1 - state.scroll * 0.7);
    gl.drawArrays(gl.POINTS, 0, pointCount);
  }

  function loop(now) {
    render(now);
    frame = requestAnimationFrame(loop);
  }

  function start() {
    if (running || reducedMotion) return;
    running = true;
    frame = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(canvas);
  resize();

  if (!reducedMotion) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    // Ekranda görünmüyorsa ya da sekme arka plandaysa çizmeyi bırak.
    let visible = true;
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      visible && !document.hidden ? start() : stop();
    }).observe(canvas);
    document.addEventListener('visibilitychange', () =>
      visible && !document.hidden ? start() : stop(),
    );
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stop();
  });

  return { state, start, stop };
}

function createProgram(gl, vertexSource, fragmentSource) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('[signal-field]', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[signal-field]', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

// ---- Küçük vektör/matris yardımcıları (sütun öncelikli, WebGL düzeni) ----

function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ]);
}

function lookAt(eye, target, up) {
  const z = normalize(subtract(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ]);
}

const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
