// Hero scene: a "network globe" of connected nodes. Terracotta pulses travel
// node-to-node along the edges (مسيّر — routing things to where they belong), warming each edge they cross.
import * as THREE from 'three';

const COLORS = {
  bg: new THREE.Color('#F6F0E6'),
  node: new THREE.Color('#1E5B47'),
  edge: new THREE.Color('#9DB8AA'),
  pulse: new THREE.Color('#C0623A'),
};

const NODE_COUNT = 150;
const RADIUS = 2.4;
const NEIGHBORS = 3;
const PULSES = 26;
const TRAIL = 6;

const pointVert = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uScale;
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * uScale * (9.0 / -mv.z);
    float nearness = smoothstep(11.6, 7.0, -mv.z);   // fade the far side of the globe
    vColor = aColor;
    vAlpha = aAlpha * mix(0.16, 1.0, nearness);
  }
`;

const pointFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.30, 0.22, d);
    float halo = smoothstep(0.5, 0.24, d) * 0.28;
    float a = max(core, halo) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

function makePointMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: pointVert,
    fragmentShader: pointFrag,
    transparent: true,
    depthWrite: false,
  });
}

// Small deterministic PRNG so the layout is identical on every visit.
function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

export function initHeroScene(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null; // No WebGL: the hero keeps its CSS gradient background.
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(COLORS.bg, 6.6, 11.8);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0, 9);

  const world = new THREE.Group();   // positioned per layout + mouse tilt
  const globe = new THREE.Group();   // slow spin
  world.rotation.z = 0.2;
  world.add(globe);
  scene.add(world);

  const uniforms = { uPixelRatio: { value: pixelRatio }, uScale: { value: 1 } };
  const rand = seeded(7);

  // ---- Nodes (Fibonacci sphere with a little jitter) ----
  const nodes = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < NODE_COUNT; i++) {
    const y = 1 - (i / (NODE_COUNT - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const j = RADIUS * (1 + (rand() - 0.5) * 0.14);
    nodes.push(new THREE.Vector3(Math.cos(th) * r * j, y * j, Math.sin(th) * r * j));
  }

  const nodeGeo = new THREE.BufferGeometry().setFromPoints(nodes);
  const nSize = new Float32Array(NODE_COUNT);
  const nAlpha = new Float32Array(NODE_COUNT).fill(1);
  const nColor = new Float32Array(NODE_COUNT * 3);
  for (let i = 0; i < NODE_COUNT; i++) {
    const hub = rand() < 0.1;
    nSize[i] = hub ? 13 : 6 + rand() * 2.5;
    (hub ? COLORS.pulse : COLORS.node).toArray(nColor, i * 3);
  }
  nodeGeo.setAttribute('aSize', new THREE.BufferAttribute(nSize, 1));
  nodeGeo.setAttribute('aAlpha', new THREE.BufferAttribute(nAlpha, 1));
  nodeGeo.setAttribute('aColor', new THREE.BufferAttribute(nColor, 3));
  globe.add(new THREE.Points(nodeGeo, makePointMaterial(uniforms)));

  // ---- Edges (k nearest neighbours, deduplicated) ----
  const edges = [];
  const adjacency = nodes.map(() => []);
  const seen = new Set();
  nodes.forEach((p, i) => {
    nodes
      .map((q, j) => [j, p.distanceToSquared(q)])
      .filter(([j]) => j !== i)
      .sort((a, b) => a[1] - b[1])
      .slice(0, NEIGHBORS)
      .forEach(([j]) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) return;
        seen.add(key);
        const e = edges.length;
        edges.push([i, j, p.distanceTo(nodes[j])]);
        adjacency[i].push({ to: j, e });
        adjacency[j].push({ to: i, e });
      });
  });

  const edgePos = new Float32Array(edges.length * 6);
  const edgeCol = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], e) => {
    nodes[a].toArray(edgePos, e * 6);
    nodes[b].toArray(edgePos, e * 6 + 3);
  });
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
  edgeGeo.setAttribute('color', new THREE.BufferAttribute(edgeCol, 3));
  globe.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 })));
  const heat = new Float32Array(edges.length);

  // ---- Orbit rings with a satellite each ----
  const rings = [
    { r: 3.25, tiltX: 1.2, tiltY: 0.3, speed: 0.22 },
    { r: 3.6, tiltX: 1.75, tiltY: -0.6, speed: -0.15 },
  ].map((cfg) => {
    const pts = new THREE.EllipseCurve(0, 0, cfg.r, cfg.r).getPoints(160).map((p) => new THREE.Vector3(p.x, p.y, 0));
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: COLORS.pulse, transparent: true, opacity: 0.22 })
    );
    const holder = new THREE.Group();
    holder.rotation.set(cfg.tiltX, cfg.tiltY, 0);
    holder.add(ring);
    world.add(holder);
    return { ...cfg, holder };
  });
  const satGeo = new THREE.BufferGeometry();
  satGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rings.length * 3), 3));
  satGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(rings.length).fill(11), 1));
  satGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(rings.length).fill(1), 1));
  const satCol = new Float32Array(rings.length * 3);
  rings.forEach((_, i) => COLORS.pulse.toArray(satCol, i * 3));
  satGeo.setAttribute('aColor', new THREE.BufferAttribute(satCol, 3));
  world.add(new THREE.Points(satGeo, makePointMaterial(uniforms)));
  const satLocal = new THREE.Vector3();

  // ---- Pulses travelling along the network ----
  const pulses = Array.from({ length: PULSES }, () => {
    const e = Math.floor(rand() * edges.length);
    const [a, b] = edges[e];
    return { prev: a, a, b, e, t: rand(), speed: 0.7 + rand() * 0.7 };
  });
  const P = PULSES * TRAIL;
  const pulsePos = new Float32Array(P * 3);
  const pulseSize = new Float32Array(P);
  const pulseAlpha = new Float32Array(P);
  const pulseCol = new Float32Array(P * 3);
  for (let i = 0; i < PULSES; i++) {
    for (let k = 0; k < TRAIL; k++) {
      const idx = i * TRAIL + k;
      const f = k / TRAIL;
      pulseSize[idx] = 10 * (1 - f * 0.6);
      pulseAlpha[idx] = Math.pow(1 - f, 1.6);
      COLORS.pulse.toArray(pulseCol, idx * 3);
    }
  }
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
  pulseGeo.setAttribute('aSize', new THREE.BufferAttribute(pulseSize, 1));
  pulseGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pulseAlpha, 1));
  pulseGeo.setAttribute('aColor', new THREE.BufferAttribute(pulseCol, 3));
  globe.add(new THREE.Points(pulseGeo, makePointMaterial(uniforms)));

  const tmp = new THREE.Vector3();
  const edgeTint = new THREE.Color();

  function stepPulses(dt) {
    for (const p of pulses) {
      p.t += (dt * p.speed) / edges[p.e][2];
      if (p.t >= 1) {
        const options = adjacency[p.b].filter((o) => o.to !== p.a);
        const next = (options.length ? options : adjacency[p.b])[Math.floor(rand() * (options.length || adjacency[p.b].length))];
        p.prev = p.a;
        p.a = p.b;
        p.b = next.to;
        p.e = next.e;
        p.t = 0;
      }
      heat[p.e] = 1;
    }
    for (let i = 0; i < PULSES; i++) {
      const p = pulses[i];
      for (let k = 0; k < TRAIL; k++) {
        const tk = p.t - k * 0.08;
        if (tk >= 0) tmp.lerpVectors(nodes[p.a], nodes[p.b], tk);
        else tmp.lerpVectors(nodes[p.prev], nodes[p.a], 1 + tk);
        tmp.toArray(pulsePos, (i * TRAIL + k) * 3);
      }
    }
    pulseGeo.attributes.position.needsUpdate = true;
  }

  function stepEdges(dt) {
    const decay = Math.exp(-dt * 1.8);
    for (let e = 0; e < edges.length; e++) {
      heat[e] *= decay;
      edgeTint.copy(COLORS.edge).lerp(COLORS.pulse, heat[e]);
      edgeTint.toArray(edgeCol, e * 6);
      edgeTint.toArray(edgeCol, e * 6 + 3);
    }
    edgeGeo.attributes.color.needsUpdate = true;
  }

  // ---- Layout ----
  const layout = { x: 0, y: 0, scale: 1 };
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const viewH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const viewW = viewH * camera.aspect;
    if (w >= 900) {
      // RTL: copy sits on the right, the globe lives on the left.
      // Keep the globe inside the left ~40% so it never runs under the copy.
      layout.scale = THREE.MathUtils.clamp(Math.min(viewW / 13, (viewW * 0.42) / (2 * RADIUS)), 0.5, 1.05);
      layout.x = -viewW * 0.5 + RADIUS * layout.scale * 0.85;
      layout.y = 0;
    } else {
      layout.x = 0;
      layout.y = 0.2;
      layout.scale = Math.min(0.9, viewW / 7.5);
    }
    uniforms.uScale.value = Math.min(1.25, Math.max(0.7, h / 820));
    if (reducedMotion) render(0);
  }

  // ---- Interaction ----
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  let elapsed = 0;
  function render(dt) {
    elapsed += dt;
    mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 2.5);
    mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 2.5);

    const scroll = Math.min(window.scrollY / window.innerHeight, 1);
    world.position.set(layout.x, layout.y + scroll * 1.4, 0);
    world.scale.setScalar(layout.scale * (1 - scroll * 0.12));
    world.rotation.x = mouse.y * 0.18;
    world.rotation.y = mouse.x * 0.28;
    globe.rotation.y += dt * 0.07;

    rings.forEach((ring, i) => {
      const a = elapsed * ring.speed + i * 2;
      satLocal.set(Math.cos(a) * ring.r, Math.sin(a) * ring.r, 0).applyEuler(ring.holder.rotation);
      satLocal.toArray(satGeo.attributes.position.array, i * 3);
    });
    satGeo.attributes.position.needsUpdate = true;

    stepPulses(dt);
    stepEdges(dt);
    renderer.render(scene, camera);
  }

  // ---- Loop: only run while the hero is on screen and the tab is visible ----
  const clock = new THREE.Clock();
  let inView = true;
  let rafId = 0;
  function loop() {
    rafId = 0;
    if (!inView || document.hidden) return;
    render(Math.min(clock.getDelta(), 0.05));
    rafId = requestAnimationFrame(loop);
  }
  function start() {
    if (reducedMotion || rafId) return;
    clock.getDelta();
    rafId = requestAnimationFrame(loop);
  }

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) start();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  new ResizeObserver(resize).observe(canvas);

  resize();
  // Pre-warm so pulses and warmed edges are already spread out on the first frame.
  for (let i = 0; i < 90; i++) { stepPulses(1 / 30); stepEdges(1 / 30); }
  render(0);
  requestAnimationFrame(() => canvas.classList.add('ready'));
  start();

  return { renderer };
}
