// Hero scene: a network globe wired like a circuit. A call enters at a node (green ring),
// current runs along the shortest wire path to one endpoint (terracotta), the endpoint
// lights up, and the circuit fades. مسيّر: routing each call to where it belongs.
import * as THREE from 'three';

const COLORS = {
  bg: new THREE.Color('#F6F0E6'),
  node: new THREE.Color('#1E5B47'),
  edge: new THREE.Color('#B4CABE'),
  current: new THREE.Color('#C0623A'),
  spark: new THREE.Color('#E5652A'),   // live current: a hotter, more vivid terracotta
  source: new THREE.Color('#1E5B47'),
};

const NODE_COUNT = 150;
const RADIUS = 2.4;
const NEIGHBORS = 3;

const ROUTES = 4;        // circuits live at once
const TRAIL = 7;         // spark head + tail
const FLOW = 16;         // current dots running along a powered wire
const RING_POOL = 10;    // arrival / call flashes
const SPEED = 3.4;       // edges per second
const HOLD = 1.4;        // seconds a completed circuit stays powered

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

const dotFrag = /* glsl */ `
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

const ringFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.07, 0.0, abs(d - 0.42)) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

function makePointMaterial(uniforms, fragmentShader = dotFrag) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: pointVert,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
}

// Points cloud whose per-point position/size/alpha/colour we rewrite each frame.
function makeCloud(count, uniforms, fragmentShader) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count), 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const points = new THREE.Points(geo, makePointMaterial(uniforms, fragmentShader));
  points.frustumCulled = false;
  const a = geo.attributes;
  return {
    points,
    pos: a.position.array, size: a.aSize.array, alpha: a.aAlpha.array, color: a.aColor.array,
    flush() { a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = a.aColor.needsUpdate = true; },
  };
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
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

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

  // Endpoints ("hubs") are where circuits terminate.
  const isHub = new Uint8Array(NODE_COUNT);
  const hubs = [];
  const nodeGeo = new THREE.BufferGeometry().setFromPoints(nodes);
  const baseSize = new Float32Array(NODE_COUNT);
  const nSize = new Float32Array(NODE_COUNT);
  const nColor = new Float32Array(NODE_COUNT * 3);
  for (let i = 0; i < NODE_COUNT; i++) {
    isHub[i] = rand() < 0.1 ? 1 : 0;
    if (isHub[i]) hubs.push(i);
    baseSize[i] = nSize[i] = isHub[i] ? 12 : 6 + rand() * 2.5;
    (isHub[i] ? COLORS.current : COLORS.node).toArray(nColor, i * 3);
  }
  nodeGeo.setAttribute('aSize', new THREE.BufferAttribute(nSize, 1));
  nodeGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(NODE_COUNT).fill(1), 1));
  nodeGeo.setAttribute('aColor', new THREE.BufferAttribute(nColor, 3));
  globe.add(new THREE.Points(nodeGeo, makePointMaterial(uniforms)));
  const bump = new Float32Array(NODE_COUNT);   // endpoint "lit" amount, decays

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
        edges.push([i, j]);
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
  globe.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 })));
  // Per-vertex charge, so a wire can be powered part-way along its length.
  const charge = new Float32Array(edges.length * 2);

  // Shortest-path field toward every endpoint (BFS): next[i] is the neighbour one hop closer.
  const fields = new Map(hubs.map((target) => {
    const dist = new Int16Array(NODE_COUNT).fill(-1);
    const next = new Int16Array(NODE_COUNT).fill(-1);
    dist[target] = 0;
    const queue = [target];
    for (let h = 0; h < queue.length; h++) {
      const u = queue[h];
      for (const { to } of adjacency[u]) {
        if (dist[to] < 0) { dist[to] = dist[u] + 1; next[to] = u; queue.push(to); }
      }
    }
    return [target, { dist, next }];
  }));

  // ---- Orbit rings with a satellite each ----
  const orbits = [
    { r: 3.25, tiltX: 1.2, tiltY: 0.3, speed: 0.22 },
    { r: 3.6, tiltX: 1.75, tiltY: -0.6, speed: -0.15 },
  ].map((cfg) => {
    const pts = new THREE.EllipseCurve(0, 0, cfg.r, cfg.r).getPoints(160).map((p) => new THREE.Vector3(p.x, p.y, 0));
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: COLORS.current, transparent: true, opacity: 0.2 })
    );
    const holder = new THREE.Group();
    holder.rotation.set(cfg.tiltX, cfg.tiltY, 0);
    holder.add(line);
    world.add(holder);
    return { ...cfg, holder };
  });
  const sats = makeCloud(orbits.length, uniforms);
  orbits.forEach((_, i) => { sats.size[i] = 10; sats.alpha[i] = 1; COLORS.current.toArray(sats.color, i * 3); });
  world.add(sats.points);
  const satLocal = new THREE.Vector3();

  // ---- Rings: a static one marking each endpoint + a pool of flashes ----
  const rings = makeCloud(hubs.length + RING_POOL, uniforms, ringFrag);
  hubs.forEach((h, i) => {
    nodes[h].toArray(rings.pos, i * 3);
    rings.size[i] = 24;
    rings.alpha[i] = 0.35;
    COLORS.current.toArray(rings.color, i * 3);
  });
  const flashes = Array.from({ length: RING_POOL }, (_, i) => ({ slot: hubs.length + i, t: 1 }));
  globe.add(rings.points);

  function flash(node, color, scale = 1) {
    const f = flashes.reduce((a, b) => (b.t > a.t ? b : a));   // free or oldest
    f.t = 0;
    f.scale = scale;
    nodes[node].toArray(rings.pos, f.slot * 3);
    color.toArray(rings.color, f.slot * 3);
  }

  // ---- Circuits ----
  const sparks = makeCloud(ROUTES * (TRAIL + FLOW), uniforms);
  for (let i = 0; i < ROUTES * (TRAIL + FLOW); i++) COLORS.spark.toArray(sparks.color, i * 3);
  globe.add(sparks.points);

  const routes = Array.from({ length: ROUTES }, (_, i) => ({ phase: 'wait', timer: i * 0.7, s: 0, path: [], links: [] }));

  function spawn(route) {
    const target = pick(hubs);
    const { dist, next } = fields.get(target);
    let sources = [];
    for (let i = 0; i < NODE_COUNT; i++) if (!isHub[i] && dist[i] >= 5 && dist[i] <= 10) sources.push(i);
    if (!sources.length) for (let i = 0; i < NODE_COUNT; i++) if (!isHub[i] && dist[i] >= 2) sources.push(i);
    const path = [pick(sources)];
    while (path[path.length - 1] !== target) path.push(next[path[path.length - 1]]);
    route.path = path;
    route.links = path.slice(1).map((v, j) => {
      const { e } = adjacency[path[j]].find((o) => o.to === v);
      return { e, forward: edges[e][0] === path[j] };
    });
    route.s = 0;
    route.phase = 'travel';
    flash(path[0], COLORS.source, 0.8);
  }

  const tmp = new THREE.Vector3();
  function pointOnPath(route, s, out) {
    const last = route.path.length - 1;
    const i = Math.min(Math.floor(s), last - 1);
    return out.lerpVectors(nodes[route.path[i]], nodes[route.path[i + 1]], THREE.MathUtils.clamp(s - i, 0, 1));
  }

  const edgeTint = new THREE.Color();
  let elapsed = 0;

  function stepCircuits(dt) {
    const decay = Math.exp(-dt * 1.6);
    for (let v = 0; v < charge.length; v++) charge[v] *= decay;

    routes.forEach((route, r) => {
      const base = r * (TRAIL + FLOW);
      for (let k = 0; k < TRAIL + FLOW; k++) sparks.alpha[base + k] = 0;

      if (route.phase === 'wait') {
        route.timer -= dt;
        if (route.timer > 0) return;
        spawn(route);
      }

      const last = route.path.length - 1;
      if (route.phase === 'travel') {
        route.s += dt * SPEED;
        if (route.s >= last) {
          route.s = last;
          route.phase = 'hold';
          route.timer = HOLD;
          const end = route.path[last];
          bump[end] = 1;
          flash(end, COLORS.current, 1.3);
        }
      } else if (route.phase === 'hold') {
        route.timer -= dt;
        if (route.timer <= 0) {
          route.phase = 'wait';
          route.timer = 0.3 + rand() * 1.2;
          return;   // stop powering; the wires fade out through `decay`
        }
      }

      // Power the wire up to the current position.
      for (let j = 0; j < route.links.length && j < route.s; j++) {
        const { e, forward } = route.links[j];
        const from = e * 2 + (forward ? 0 : 1);
        const to = e * 2 + (forward ? 1 : 0);
        charge[from] = 1;
        charge[to] = Math.max(charge[to], THREE.MathUtils.clamp(route.s - j, 0, 1));
      }

      // Spark head with a tail (only while travelling).
      if (route.phase === 'travel') {
        for (let k = 0; k < TRAIL; k++) {
          const sk = route.s - k * 0.13;
          if (sk < 0) break;
          const f = k / TRAIL;
          pointOnPath(route, sk, tmp).toArray(sparks.pos, (base + k) * 3);
          sparks.size[base + k] = 15 * (1 - f * 0.55);
          sparks.alpha[base + k] = Math.pow(1 - f, 1.5);
        }
      }

      // Current dots flowing along the powered part, toward the endpoint.
      const fade = route.phase === 'hold' ? Math.min(1, route.timer / 0.5) : 1;
      const spacing = last / FLOW;
      for (let k = 0; k < FLOW; k++) {
        const sd = (k * spacing + elapsed * 1.6) % last;
        if (sd > route.s - 0.1) continue;
        const idx = base + TRAIL + k;
        pointOnPath(route, sd, tmp).toArray(sparks.pos, idx * 3);
        sparks.size[idx] = 5.5;
        sparks.alpha[idx] = fade;
      }
    });
    sparks.flush();

    for (let e = 0; e < edges.length; e++) {
      edgeTint.copy(COLORS.edge).lerp(COLORS.spark, charge[e * 2]).toArray(edgeCol, e * 6);
      edgeTint.copy(COLORS.edge).lerp(COLORS.spark, charge[e * 2 + 1]).toArray(edgeCol, e * 6 + 3);
    }
    edgeGeo.attributes.color.needsUpdate = true;

    // Endpoint flashes: expand and fade.
    for (const f of flashes) {
      f.t = Math.min(1, f.t + dt / 1.1);
      const ease = 1 - Math.pow(1 - f.t, 3);
      rings.size[f.slot] = (14 + ease * 48) * (f.scale || 1);
      rings.alpha[f.slot] = f.t >= 1 ? 0 : Math.pow(1 - f.t, 1.3);
    }
    hubs.forEach((h, i) => {
      bump[h] *= Math.exp(-dt * 1.8);
      nSize[h] = baseSize[h] * (1 + bump[h] * 0.9);
      rings.alpha[i] = 0.35 + bump[h] * 0.5;
    });
    rings.flush();
    nodeGeo.attributes.aSize.needsUpdate = true;
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

    orbits.forEach((orbit, i) => {
      const a = elapsed * orbit.speed + i * 2;
      satLocal.set(Math.cos(a) * orbit.r, Math.sin(a) * orbit.r, 0).applyEuler(orbit.holder.rotation);
      satLocal.toArray(sats.pos, i * 3);
    });
    sats.flush();

    stepCircuits(dt);
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
  // Pre-warm so a few circuits are already mid-flight on the first frame.
  for (let i = 0; i < 75; i++) { elapsed += 1 / 30; stepCircuits(1 / 30); }
  render(0);
  requestAnimationFrame(() => canvas.classList.add('ready'));
  start();

  return { renderer };
}
