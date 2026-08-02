/* Jarvis visuals: starfield + 3D reactor brain (three.js, vendored) */
(function () {
  const sc = document.getElementById("stars"), sctx = sc.getContext("2d");
  const theme = () => window.__jarvisTheme || { hue: "125,211,252", mode: "rings" };
  function drawStars() {
    const W = sc.width = innerWidth, H = sc.height = innerHeight;
    sctx.clearRect(0, 0, W, H);
    sctx.fillStyle = `rgba(${theme().hue},0.25)`;
    for (let i = 0; i < 90; i++) {
      sctx.globalAlpha = Math.random() * 0.4 + 0.05;
      sctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }
    sctx.globalAlpha = 1;
    sctx.strokeStyle = `rgba(${theme().hue},0.05)`;
    const horizon = H * 0.72;
    for (let i = 0; i < 14; i++) {
      const yy = horizon + i * i * 2.2;
      if (yy > H) break;
      sctx.beginPath(); sctx.moveTo(0, yy); sctx.lineTo(W, yy); sctx.stroke();
    }
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
  try { renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true }); }
  catch (e) { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(45, 1, 0.1, 100);
  cam.position.set(0, 0, 6.4);
  const group = new T.Group();
  group.position.y = 0.15;
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

  // noise-displaced wireframe blob (nebula / ember)
  const blobGeo = new T.IcosahedronGeometry(1.45, 3);
  const basePos = blobGeo.attributes.position.array.slice();
  const blobMat = new T.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.38, blending: T.AdditiveBlending, depthWrite: false });
  const blob = new T.Mesh(blobGeo, blobMat);

  // particle shell
  const N = 700;
  const pgeo = new T.BufferGeometry();
  const pbase = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996;
    pbase[i * 3] = Math.cos(th) * r * 1.85; pbase[i * 3 + 1] = y * 1.85; pbase[i * 3 + 2] = Math.sin(th) * r * 1.85;
  }
  pgeo.setAttribute("position", new T.BufferAttribute(pbase.slice(), 3));
  const pmat = new T.PointsMaterial({ size: 0.05, map: tex, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false });
  const shell = new T.Points(pgeo, pmat);

  // reactor cage: broken arcs + endpoint nodes on tilted axes
  const ringsGroup = new T.Group();
  const arcDefs = [
    { r: 1.00, tube: 0.016, tilt: [0.9, 0, 0.1], sp: 0.9, arcs: [[0, 2.4], [2.9, 1.1], [4.6, 1.2]] },
    { r: 1.28, tube: 0.010, tilt: [0.15, 0.9, 0.4], sp: -0.55, arcs: [[0.5, 1.5], [2.6, 2.6]] },
    { r: 1.56, tube: 0.013, tilt: [0.5, 0.25, 0.9], sp: 0.38, arcs: [[0, 1.0], [1.6, 0.9], [3.2, 1.0], [4.8, 1.0]] },
    { r: 1.86, tube: 0.007, tilt: [0.8, 0.6, 0], sp: -0.22, arcs: [[0.2, 3.0], [3.8, 1.6]] },
    { r: 2.10, tube: 0.010, tilt: [0.1, 0.5, 0.9], sp: 0.16, arcs: [[1.0, 0.7], [3.4, 0.5], [5.2, 0.6]] },
  ];
  const rings = arcDefs.map((d, i) => {
    const holder = new T.Object3D();
    holder.rotation.set(d.tilt[0], d.tilt[1], d.tilt[2]);
    const spin = new T.Object3D(); holder.add(spin);
    const mats = [];
    for (const [start, len] of d.arcs) {
      const m = new T.Mesh(new T.TorusGeometry(d.r, d.tube, 6, 90, len),
        new T.MeshBasicMaterial({ transparent: true, opacity: 0.75, blending: T.AdditiveBlending, depthWrite: false }));
      m.rotation.z = start;
      spin.add(m); mats.push(m.material);
      for (const a of [start, start + len]) {
        const dot = new T.Mesh(new T.SphereGeometry(d.tube * 2.4, 8, 8), m.material);
        dot.position.set(Math.cos(a) * d.r, Math.sin(a) * d.r, 0);
        spin.add(dot);
      }
    }
    ringsGroup.add(holder);
    return { holder, spin, d, i, mats };
  });
  // twin geodesic lattices around the core
  const lat1 = new T.Mesh(new T.IcosahedronGeometry(0.5, 1),
    new T.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false }));
  const lat2 = new T.Mesh(new T.IcosahedronGeometry(0.78, 1),
    new T.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.2, blending: T.AdditiveBlending, depthWrite: false }));
  ringsGroup.add(lat1, lat2);
  // camera-facing outer dial with tick marks + sweep arc
  const dial = new T.Group();
  const tickArr = [];
  for (let i = 0; i < 72; i++) {
    const a = (Math.PI * 2 / 72) * i;
    const inner = 2.3, outer = i % 6 === 0 ? 2.46 : 2.37;
    tickArr.push(Math.cos(a) * inner, Math.sin(a) * inner, 0, Math.cos(a) * outer, Math.sin(a) * outer, 0);
  }
  const tickGeo = new T.BufferGeometry();
  tickGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(tickArr), 3));
  const tickMat = new T.LineBasicMaterial({ transparent: true, opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false });
  dial.add(new T.LineSegments(tickGeo, tickMat));
  const dialArc = new T.Mesh(new T.TorusGeometry(2.3, 0.006, 6, 80, 1.9),
    new T.MeshBasicMaterial({ transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false }));
  dial.add(dialArc);
  ringsGroup.add(dial);

  // core + glow + haze
  const core = new T.Mesh(new T.SphereGeometry(0.10, 32, 32), new T.MeshBasicMaterial({ transparent: true, opacity: 0.9 }));
  const coreGlow = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false }));
  coreGlow.scale.setScalar(1.8);
  const haze = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0.15, blending: T.AdditiveBlending, depthWrite: false }));
  haze.scale.setScalar(7);

  // expanding scan pulse
  const pulseMesh = new T.Mesh(
    new T.RingGeometry(0.98, 1.0, 90),
    new T.MeshBasicMaterial({ transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));

  group.add(blob, shell, ringsGroup, core, coreGlow, haze, pulseMesh);

  const colorMats = [blobMat, pmat, coreGlow.material, haze.material, pulseMesh.material, lat1.material, lat2.material, tickMat, dialArc.material, ...rings.flatMap((r) => r.mats)];
  const baseCol = new T.Color(), listenCol = new T.Color(0xf38ba8), white = new T.Color(1, 1, 1);

  function setTheme(theme) {
    const [r, g, b] = theme.hue.split(",").map(Number);
    baseCol.setRGB(r / 255, g / 255, b / 255);
    const isRings = theme.mode === "rings";
    blob.visible = !isRings;
    ringsGroup.visible = isRings;
    pmat.size = isRings ? 0.035 : 0.05;
  }
  window.__brain3d = { setTheme };
  setTheme(window.__jarvisTheme);

  let energy = 0, mx = 0, my = 0, tx = 0, ty = 0, lastPulse = 0;
  addEventListener("mousemove", (e) => {
    tx = (e.clientX / innerWidth - 0.5) * 0.5;
    ty = (e.clientY / innerHeight - 0.5) * 0.35;
  });
  function resize3d() { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
  addEventListener("resize", resize3d); resize3d();

  const col = new T.Color();
  function loop(t) {
    const st = window.__hudState || "idle";
    const target = st === "idle" ? 0.22 : st === "listening" ? 0.5 : st === "thinking" ? 1 : 0.75;
    energy += (target - energy) * 0.04;
    mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;

    col.copy(baseCol); if (st === "listening") col.lerp(listenCol, 0.85);
    for (const m of colorMats) m.color.copy(col);
    core.material.color.copy(col).lerp(white, 0.55);

    group.rotation.y += 0.002 + energy * 0.006;
    group.rotation.x = 0.18 + my;
    group.rotation.z = mx * 0.4;

    if (blob.visible) {
      const pos = blobGeo.attributes.position.array;
      const amp = 0.10 + energy * 0.34;
      for (let i = 0; i < pos.length; i += 3) {
        const x = basePos[i], y = basePos[i + 1], z = basePos[i + 2];
        const d = (Math.sin(x * 2.1 + t * 0.0011) + Math.sin(y * 3.3 - t * 0.0014) +
                   Math.sin(z * 2.7 + t * 0.0009) + Math.sin((x + y + z) * 1.7 - t * 0.0007)) * 0.25;
        const f = 1 + d * amp;
        pos[i] = x * f; pos[i + 1] = y * f; pos[i + 2] = z * f;
      }
      blobGeo.attributes.position.needsUpdate = true;
    }

    shell.rotation.y = -t * 0.00012;
    shell.scale.setScalar(1 + Math.sin(t * 0.0012) * 0.02 + energy * 0.05);
    pmat.opacity = 0.4 + energy * 0.5;

    if (ringsGroup.visible) {
      for (const { holder, spin, d, i } of rings) {
        spin.rotation.z += d.sp * 0.008 * (1 + energy * 2);
        holder.rotation.x = d.tilt[0] + Math.sin(t * 0.00025 + i * 1.3) * 0.18;
        holder.rotation.y = d.tilt[1] + Math.cos(t * 0.0002 + i * 0.9) * 0.18;
      }
      lat1.rotation.y += 0.012 + energy * 0.025; lat1.rotation.x += 0.005;
      lat2.rotation.y -= 0.007 + energy * 0.014; lat2.rotation.z += 0.003;
      dial.quaternion.copy(cam.quaternion);
      dialArc.rotation.z = -t * 0.0007;
      const ls = 1 + energy * 0.18;
      lat1.scale.setScalar(ls); lat2.scale.setScalar(1 + energy * 0.1);
    }

    const cp = 1 + Math.sin(t * 0.004) * 0.08 + energy * 0.35;
    core.scale.setScalar(cp);
    coreGlow.material.opacity = 0.4 + energy * 0.5;
    coreGlow.scale.setScalar(1.8 * cp);
    haze.material.opacity = 0.10 + energy * 0.18;

    if (t - lastPulse > 3800 / (1 + energy * 1.5)) {
      lastPulse = t; pulseMesh.scale.setScalar(0.3); pulseMesh.material.opacity = 0.5;
    }
    if (pulseMesh.material.opacity > 0.01) {
      pulseMesh.scale.multiplyScalar(1.025);
      pulseMesh.material.opacity *= 0.96;
      pulseMesh.quaternion.copy(cam.quaternion);
    }

    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
