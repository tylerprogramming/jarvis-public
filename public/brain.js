/* Jarvis visuals: a sparse starfield and the sphere (three.js, vendored).
 *
 * The sphere used to be a reactor: a noise-displaced blob, a 700-point shell,
 * five broken arc rings with endpoint nodes, twin lattices, a 72-tick dial
 * and a scan pulse - about forty draw calls and a per-vertex loop every
 * frame. What people actually read off it is a lattice, a core and an orbit
 * or two, so that is what is left: one geodesic lattice, a bright core with
 * a soft glow, two orbits, two arcs with their end nodes, and a thin shell of
 * points. No geometry is rewritten per frame; everything moves by rotation.
 *
 * It still answers the HUD's state (idle / listening / thinking / speaking)
 * through `energy`. The browser already parks requestAnimationFrame for a
 * hidden tab, so nothing here has to.
 */
(function () {
  const sc = document.getElementById("stars"), sctx = sc.getContext("2d");
  const theme = () => window.__jarvisTheme || { hue: "125,211,252" };
  function drawStars() {
    const W = sc.width = innerWidth, H = sc.height = innerHeight;
    sctx.clearRect(0, 0, W, H);
    sctx.fillStyle = `rgba(${theme().hue},0.25)`;
    for (let i = 0; i < 70; i++) {
      sctx.globalAlpha = Math.random() * 0.4 + 0.05;
      sctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }
    sctx.globalAlpha = 1;
  }
  window.__drawStars = drawStars;
  addEventListener("resize", drawStars);
  drawStars();
})();

(function () {
  if (!window.THREE) return;
  const T = THREE;
  const canvas = document.getElementById("brain");
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" }); }
  catch (e) { return; }
  // 1.5 is enough for hairlines on a retina display; 2 doubled the fill cost
  // for no visible gain on a sphere that is mostly empty space.
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(45, 1, 0.1, 100);
  cam.position.set(0, 0, 6.4);
  const group = new T.Group();
  scene.add(group);

  function glowTex() {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.45)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  }
  const tex = glowTex();
  const mat = (opts) => new T.MeshBasicMaterial(Object.assign(
    { transparent: true, blending: T.AdditiveBlending, depthWrite: false }, opts));

  // the lattice: one geodesic shell, and a fainter one inside it
  const lattice = new T.Mesh(new T.IcosahedronGeometry(1.0, 1), mat({ wireframe: true, opacity: 0.5 }));
  const inner = new T.Mesh(new T.IcosahedronGeometry(0.58, 0), mat({ wireframe: true, opacity: 0.22 }));

  // the core and its glow
  const core = new T.Mesh(new T.SphereGeometry(0.11, 24, 24), new T.MeshBasicMaterial({ transparent: true, opacity: 0.95 }));
  const coreGlow = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false }));
  coreGlow.scale.setScalar(1.6);
  const haze = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0.12, blending: T.AdditiveBlending, depthWrite: false }));
  haze.scale.setScalar(6.5);

  // two orbits, one bright and close, one faint and wide
  const orbitA = new T.Object3D(); orbitA.rotation.set(1.25, 0.15, -0.3);
  orbitA.add(new T.Mesh(new T.TorusGeometry(1.55, 0.014, 6, 96), mat({ opacity: 0.85 })));
  const orbitB = new T.Object3D(); orbitB.rotation.set(1.05, -0.4, 0.4);
  orbitB.add(new T.Mesh(new T.TorusGeometry(1.9, 0.008, 6, 96), mat({ opacity: 0.32 })));

  // two arcs with a node at each end, on their own tilted planes
  const arcs = [];
  for (const [tilt, start, len, r, op] of [
    [[0.35, 0.6, 0.2], 0.4, 1.7, 1.95, 0.6],
    [[-0.5, -0.3, 0.7], 3.3, 1.4, 2.0, 0.35],
  ]) {
    const holder = new T.Object3D(); holder.rotation.set(tilt[0], tilt[1], tilt[2]);
    const spin = new T.Object3D(); holder.add(spin);
    const m = mat({ opacity: op });
    const arc = new T.Mesh(new T.TorusGeometry(r, 0.011, 6, 60, len), m);
    arc.rotation.z = start;
    spin.add(arc);
    for (const a of [start, start + len]) {
      const dot = new T.Mesh(new T.SphereGeometry(0.035, 8, 8), m);
      dot.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      spin.add(dot);
    }
    arcs.push({ spin, m });
    group.add(holder);
  }

  // a thin shell of points: enough to read as a sphere, not a cloud
  const N = 180;
  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996;
    pts[i * 3] = Math.cos(th) * r * 1.85; pts[i * 3 + 1] = y * 1.85; pts[i * 3 + 2] = Math.sin(th) * r * 1.85;
  }
  const pgeo = new T.BufferGeometry();
  pgeo.setAttribute("position", new T.BufferAttribute(pts, 3));
  const pmat = new T.PointsMaterial({ size: 0.045, map: tex, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false });
  const shell = new T.Points(pgeo, pmat);

  group.add(lattice, inner, core, coreGlow, haze, orbitA, orbitB, shell);

  const colorMats = [lattice.material, inner.material, coreGlow.material, haze.material, pmat,
    orbitA.children[0].material, orbitB.children[0].material, ...arcs.map((a) => a.m)];
  const baseCol = new T.Color(), listenCol = new T.Color(0xf38ba8), white = new T.Color(1, 1, 1);

  function setTheme(theme) {
    const [r, g, b] = String((theme && theme.hue) || "127,211,255").split(",").map(Number);
    baseCol.setRGB(r / 255, g / 255, b / 255);
  }
  window.__brain3d = { setTheme };
  setTheme(window.__jarvisTheme);

  let energy = 0, mx = 0, my = 0, tx = 0, ty = 0;
  addEventListener("mousemove", (e) => {
    tx = (e.clientX / innerWidth - 0.5) * 0.4;
    ty = (e.clientY / innerHeight - 0.5) * 0.3;
  }, { passive: true });
  function resize3d() { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
  addEventListener("resize", resize3d); resize3d();

  const col = new T.Color();
  function loop(t) {
    const st = window.__hudState || "idle";
    const target = st === "idle" ? 0.2 : st === "listening" ? 0.5 : st === "thinking" ? 1 : 0.7;
    energy += (target - energy) * 0.04;
    mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;

    col.copy(baseCol); if (st === "listening") col.lerp(listenCol, 0.85);
    for (const m of colorMats) m.color.copy(col);
    core.material.color.copy(col).lerp(white, 0.6);

    // one slow drift, a little faster while it is working
    group.rotation.y += 0.0015 + energy * 0.004;
    group.rotation.x = 0.16 + my + Math.sin(t * 0.00018) * 0.05;
    group.rotation.z = mx * 0.35;

    inner.rotation.y -= 0.004 + energy * 0.01;
    inner.rotation.x += 0.002;
    orbitA.rotation.z += 0.0025 + energy * 0.006;
    orbitB.rotation.z -= 0.0012 + energy * 0.003;
    for (const a of arcs) a.spin.rotation.z += 0.0035 * (1 + energy * 2);
    shell.rotation.y = -t * 0.0001;

    const breath = 1 + Math.sin(t * 0.0025) * 0.06 + energy * 0.3;
    core.scale.setScalar(breath);
    coreGlow.scale.setScalar(1.6 * breath);
    coreGlow.material.opacity = 0.45 + energy * 0.45;
    haze.material.opacity = 0.08 + energy * 0.16;
    lattice.material.opacity = 0.42 + energy * 0.25;
    pmat.opacity = 0.35 + energy * 0.4;

    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
