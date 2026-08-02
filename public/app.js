/* ================= themes ================= */
const THEMES = {
  reactor: { mode: "rings", hue: "125,211,252", vars: {
    "--bg": "#040810", "--panel": "rgba(10,22,38,0.55)", "--panel-deep": "rgba(6,14,26,0.72)",
    "--line": "rgba(125,211,252,0.25)", "--line-soft": "rgba(125,211,252,0.10)",
    "--accent": "#38bdf8", "--accent-hi": "#7dd3fc",
    "--text": "#e6f0fb", "--dim": "#8fa3bd" } },
  nebula: { mode: "sphere", hue: "167,139,250", vars: {
    "--bg": "#06050c", "--panel": "rgba(20,16,38,0.55)", "--panel-deep": "rgba(12,9,24,0.72)",
    "--line": "rgba(167,139,250,0.22)", "--line-soft": "rgba(167,139,250,0.10)",
    "--accent": "#a78bfa", "--accent-hi": "#cba6f7",
    "--text": "#e0dbf5", "--dim": "#8d87b3" } },
  ember: { mode: "sphere", hue: "251,191,36", vars: {
    "--bg": "#0c0703", "--panel": "rgba(38,24,10,0.55)", "--panel-deep": "rgba(24,15,6,0.72)",
    "--line": "rgba(251,191,36,0.25)", "--line-soft": "rgba(251,191,36,0.10)",
    "--accent": "#f59e0b", "--accent-hi": "#fbbf24",
    "--text": "#f7efe2", "--dim": "#b8a688" } },
};
let themeName = localStorage.getItem("jarvis_theme") || "reactor";
if (!THEMES[themeName]) themeName = "reactor";
let THEME = THEMES[themeName];
function applyTheme(name) {
  themeName = name; THEME = THEMES[name];
  localStorage.setItem("jarvis_theme", name);
  window.__jarvisTheme = THEME;
  for (const [k, v] of Object.entries(THEME.vars))
    document.documentElement.style.setProperty(k, v);
  if (window.__drawStars) window.__drawStars();
  if (window.__brain3d) window.__brain3d.setTheme(THEME);
}


let state = "idle"; // idle | listening | thinking | speaking
applyTheme(themeName);


/* ================= data ================= */
const $ = (id) => document.getElementById(id);
const fmt = (n) => n == null ? "—" : n.toLocaleString("en-US");

function spark(hist, key) {
  const vals = hist.map((r) => r[key]).filter((v) => v != null);
  if (vals.length < 2) return "";
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const ptsStr = vals.map((v, i) =>
    `${(i / (vals.length - 1)) * 100},${16 - ((v - min) / span) * 14}`).join(" ");
  return `<svg viewBox="0 0 100 18" preserveAspectRatio="none"><polyline points="${ptsStr}"/></svg>`;
}

function weekDelta(hist, key) {
  const rows = hist.filter((r) => r[key] != null);
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1];
  const anchor = rows.find((r) => (new Date(last.date) - new Date(r.date)) / 86400000 <= 7.5) || rows[0];
  const days = Math.max((new Date(last.date) - new Date(anchor.date)) / 86400000, 1);
  return Math.round((last[key] - anchor[key]) / days * 7);
}

let DATA = null;
async function loadData() {
  DATA = await (await fetch("/api/data")).json();
  render(DATA);
}

function render(d) {
  $("name").textContent = d.config.name;
  $("tagline").textContent = d.config.tagline;
  const v = d.vitals, h = d.history;

  // vitals - every tile is driven by config, so an unconfigured channel simply
  // is not drawn rather than sitting there permanently blank
  const cfg = d.config;
  const show = (k) => (cfg.vitals_show || []).includes(k);
  const channels = cfg.channels || {};
  const cell = (lab, val, delta, na) =>
    `<div class="vcell"><div class="lab">${esc(lab)}</div><div class="n">${val}</div><div class="d ${na ? "na" : ""}">${delta}</div></div>`;
  const wkTxt = (wk) => wk == null ? "tracking" : (wk >= 0 ? "▲ " : "▼ ") + fmt(Math.abs(wk)) + "/wk";

  let html = "";

  if (show("yt_subs") && channels.youtube) {
    const subsWk = weekDelta(h, "yt_subs");
    html += vital("Subscribers", fmt(v.yt_subs), wkTxt(subsWk), spark(h, "yt_subs"), subsWk > 0 ? "good" : "");
  }

  const grid = [];
  const maybe = (key, label, valueKey, histKey) => {
    if (!show(key)) return;
    const wk = weekDelta(h, histKey);
    grid.push(cell(label, fmt(v[valueKey]), v[valueKey] == null ? "tell jarvis" : wkTxt(wk), wk == null));
  };
  if (channels.instagram) maybe("instagram", "Instagram", "ig_followers", "ig_followers");
  if (channels.tiktok) maybe("tiktok", "TikTok", "tiktok_followers", "tiktok_followers");
  if (channels.linkedin) maybe("linkedin", "LinkedIn", "linkedin_followers", "linkedin_followers");
  if (channels.x) maybe("x", "X", "x_followers", "x_followers");
  if (show("community") && v.community_members != null) {
    grid.push(cell(cfg.community_label || "Community", fmt(v.community_members),
      (v.community_joins_7d || 0) + " joins/wk", !v.community_joins_7d));
  }
  if (grid.length) html += `<div class="vgrid">${grid.join("")}</div>`;

  const latest = v.yt_latest || {};
  if (show("latest_video") && latest.title) {
    html += vital("Latest video", fmt(latest.views),
      latest.views_per_day ? "≈" + fmt(latest.views_per_day) + " /day" : "",
      spark(h, "latest_views"), "", latest.title);
  }

  // the check-in tile only appears once something is actually writing check-ins
  const canary = v.canary || {};
  if (show("checkin") && canary.last_checkin) {
    const darkDays = Math.round((Date.now() - new Date(canary.last_checkin)) / 86400000);
    html += vital("Check-in", darkDays + "<small> days dark</small>",
      darkDays > 3 ? "revive it" : "ok", "", darkDays > 3 ? "bad" : "good");
  }

  $("vitals").innerHTML = html ||
    `<div class="msg sys">no channels configured yet - run <b>jarvis setup</b> or open settings</div>`;

  // directives - the empty state has to teach, since a new user has none
  $("directives").innerHTML = d.directives.map((x, i) =>
    `<div class="directive ${x.done ? "done" : ""}" data-i="${i}"><span class="box"></span><span>${esc(x.text)}</span></div>`
  ).join("") ||
    `<div class="msg sys">nothing queued. ask jarvis to "add a directive to ..." or let the
     morning agent set them.</div>`;
  document.querySelectorAll(".directive").forEach((el) =>
    el.onclick = async () => {
      await fetch("/api/directives", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toggle: +el.dataset.i }) });
      loadData();
    });

  // radar
  const radar = d.radar || {};
  const brks = (radar.breakouts || []).slice(0, 4);
  const watching = (radar.channels || []).length;
  $("radar").innerHTML = brks.length
    ? brks.map((b) =>
        `<div class="doc" onclick="window.open('https://youtube.com/watch?v=${esc(b.id)}')"
              title="${esc(b.title)} - running ${b.multiple}x this channel's normal pace">
          <span>${esc(b.title.slice(0, 30))}</span>
          <span class="age" style="color:var(--amber)">${b.multiple}x</span></div>`).join("")
    : watching
      ? `<div class="msg sys">no breakouts - watching ${watching} channel${watching > 1 ? "s" : ""}</div>`
      : `<div class="msg sys">add channels to watch in settings, then run the radar agent</div>`;

  // documents
  $("documents").innerHTML = d.documents.map((x) =>
    `<div class="doc" data-f="${esc(x.file)}" title="click to read"><span>${esc(x.name.slice(0, 32))}</span><span class="age">${x.age}</span></div>`
  ).join("") ||
    `<div class="msg sys">empty. agent reports and drafts land here - click an agent on the
     ring to run one now.</div>`;
  document.querySelectorAll(".doc").forEach((el) =>
    el.onclick = async () => {
      const r = await (await fetch("/api/doc?f=" + encodeURIComponent(el.dataset.f))).json();
      $("modal-title").textContent = r.name || "document";
      $("modal-body").textContent = r.content || r.error;
      $("modal").classList.add("open");
    });

  renderPrimary();
  renderCalendar(d.calendar);
  greet(d);
}

/* First thing a new user sees in COMMS. A blinking cursor teaches nothing, so
 * open with what to actually type - tailored to whether setup is done. */
let greeted = false;
function greet(d) {
  if (greeted) return;
  greeted = true;
  const asked = (t) =>
    `<span class="try" onclick="send('${t.replace(/'/g, "\\'")}')">${esc(t)}</span>`;
  const el = document.createElement("div");
  el.className = "msg sys";
  el.innerHTML = d.config.configured
    ? `try asking: ${[
        "what can you do?",
        "how am I tracking this week?",
        "add a directive to film the agent video",
      ].map(asked).join(" · ")}`
    : `setup isn't finished, so most numbers will be blank. run <b>jarvis setup</b> in a
       terminal, or press the gear button. then try ${asked("what can you do?")}`;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

function renderCalendar(cal) {
  const el = $("calstrip");
  if (!cal || !cal.days) { el.style.display = "none"; return; }
  const names = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const todayIso = new Date().toLocaleDateString("sv-SE");
  // legend lists only the slot types this week's plan actually uses
  const types = [...new Set(cal.days.flatMap((d2) => d2.items.map((i2) => i2.type)))];
  el.innerHTML = cal.days.map((day, i) =>
    `<div class="day ${day.date === todayIso ? "today" : ""}">
      <div class="d">${names[i]}</div>
      <div class="slots">${day.items.map((it) =>
        `<span class="slot ${esc(it.type)} ${it.done ? "done" : ""}" title="${esc(it.type)}"></span>`).join("")}
      </div></div>`
  ).join("") + (types.length
    ? `<div class="legend"><span>${types.map((t) => `■ ${esc(t)}`).join(" ")}</span></div>`
    : "");
}

/* primary directive cards cycle every 20s (subs <-> ARR) */
let cardIdx = 0;
function renderPrimary() {
  if (!DATA) return;
  const v = DATA.vitals, h = DATA.history;
  const cards = DATA.config.primary_cards || [];
  const pd = cards[cardIdx % cards.length];
  if (!pd) return;
  const latest = v.yt_latest || {};
  $("pd-label").textContent = "PRIMARY DIRECTIVE · " + pd.label;
  const meta = (pairs) => pairs.map(([l, x]) => `<span>${l} <b>${x}</b></span>`).join("");
  if (pd.metric === "audience") {
    const parts = [["YT", v.yt_subs], ["IG", v.ig_followers], ["TT", v.tiktok_followers], ["LI", v.linkedin_followers]];
    const total = parts.reduce((s2, [, x]) => s2 + (x || 0), 0);
    const wk = ["yt_subs", "ig_followers", "tiktok_followers", "linkedin_followers"]
      .map((k) => weekDelta(h, k)).filter((x) => x != null).reduce((a, b) => a + b, 0);
    $("pd-num").textContent = fmt(total);
    document.querySelector("#primary .big small").textContent = "FOLLOWERS";
    $("pd-meta").innerHTML = meta([
      ["TARGET", fmt(pd.target)],
      ["THIS WEEK", (wk >= 0 ? "+" : "") + fmt(wk)],
      ["PLATFORMS", "4"],
    ]);
    $("pd-deploy").innerHTML = parts.map(([l, x]) => `${l} <b>${fmt(x)}</b>`).join(" · ");
  } else if (pd.metric === "arr") {
    const biz = v.business || {};
    $("pd-num").textContent = "$" + fmt(biz.arr);
    document.querySelector("#primary .big small").textContent = "ARR";
    $("pd-meta").innerHTML = meta([
      ["TARGET", "$" + fmt(pd.target)],
      ["MRR", biz.mrr != null ? "$" + fmt(biz.mrr) : "—"],
      ["EMAIL LIST", biz.email_subs != null ? fmt(biz.email_subs) : "—"],
    ]);
    $("pd-deploy").innerHTML = biz.week_start
      ? `last business snapshot · <b>week of ${esc(biz.week_start)}</b>` : "";
  } else {
    const subsWk = weekDelta(h, "yt_subs");
    $("pd-num").textContent = fmt(v.yt_subs);
    document.querySelector("#primary .big small").textContent = "SUBS";
    let pace = "—";
    if (subsWk > 0) {
      const weeks = (pd.target - v.yt_subs) / subsWk;
      const eta = new Date(Date.now() + weeks * 7 * 86400000);
      pace = eta.toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase();
    } else if (subsWk != null) pace = "STALLED";
    $("pd-meta").innerHTML = meta([
      ["TARGET", fmt(pd.target)],
      ["THIS WEEK", subsWk == null ? "tracking" : (subsWk >= 0 ? "+" : "") + fmt(subsWk)],
      ["AT THIS PACE", pace],
    ]);
    $("pd-deploy").innerHTML = latest.title
      ? `latest deploy · <b>${esc(latest.title)}</b> - ${fmt(latest.views)} views` : "";
  }
}
setInterval(() => { cardIdx++; renderPrimary(); }, 20000);

function vital(label, num, delta, sparkHtml, deltaCls = "", title = "") {
  return `<div class="vital" title="${esc(title || "")}">
    <div class="row1"><span>· ${label}</span><span class="delta ${deltaCls}">${delta}</span></div>
    <div class="num">${num}</div>${sparkHtml}</div>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- agent ring ---------- */
let AGENTS_LIST = [];
function layoutAgents() {
  const cx = innerWidth / 2, cy = innerHeight / 2 - 30;
  const R = Math.min(innerWidth, innerHeight) * 0.40;
  const els = document.querySelectorAll(".agent");
  els.forEach((el, i) => {
    const a = -Math.PI / 2 + (i / els.length) * Math.PI * 2;
    el.style.left = cx + Math.cos(a) * R * 1.34 + "px";
    el.style.top = cy + Math.sin(a) * R * 0.70 + "px";
  });
}
async function loadAgents() {
  try {
    const d = await (await fetch("/api/agents")).json();
    const changed = AGENTS_LIST.length !== d.agents.length;
    AGENTS_LIST = d.agents;
    const box = $("agents");
    if (!box.children.length || changed) {
      box.innerHTML = AGENTS_LIST.map((a) =>
        `<div class="agent" id="ag-${esc(a.id)}" title="${esc(a.description || a.label)}${a.id === "runner" ? "" : " - click to run now"}">
          <span class="adot"></span>${esc(a.label)}<span class="atag">${esc(a.tag)}</span></div>`
      ).join("");
      layoutAgents();
      // clicking an agent runs it now, which is how you test one without
      // waiting for its scheduled hour
      AGENTS_LIST.filter((a) => a.id !== "runner").forEach((a) => {
        const el = $("ag-" + a.id);
        if (el) el.onclick = () => runAgent(a);
      });
    }
    for (const a of AGENTS_LIST) {
      const el = $("ag-" + a.id);
      if (!el) continue;
      el.classList.toggle("live", a.running || (a.id === "runner" && state !== "idle"));
      el.classList.toggle("off", a.enabled === false || (a.unmet || []).length > 0);
    }
  } catch {}
}

async function runAgent(a) {
  if ((a.unmet || []).length) {
    addMsg("sys", `${a.label.toLowerCase()} needs config: ${a.unmet.join(", ")}`);
    return;
  }
  addMsg("sys", `running ${a.label.toLowerCase()} agent - output lands in the documents trail`);
  try {
    const r = await (await fetch("/api/agents/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: a.id }),
    })).json();
    if (r.error) addMsg("sys", `${a.label.toLowerCase()}: ${r.error}`);
    else setTimeout(loadAgents, 1500);
  } catch (e) { addMsg("sys", "could not start agent: " + e.message); }
}
addEventListener("resize", layoutAgents);
loadAgents();
setInterval(loadAgents, 8000);

$("theme").onclick = () => {
  const names = Object.keys(THEMES);
  applyTheme(names[(names.indexOf(themeName) + 1) % names.length]);
};
$("modal").onclick = () => $("modal").classList.remove("open");
loadData();
setInterval(loadData, 5 * 60 * 1000);

/* ================= chat -> claude code ================= */
let sessionId = localStorage.getItem("jarvis_session") || null, speakOn = true;
const ACKS = ["On it.", "Right away.", "Working on it now.", "Checking that now.", "Give me a moment.", "Running it now."];
const msgs = $("msgs");
function addMsg(cls, text) {
  const el = document.createElement("div");
  el.className = "msg " + cls; el.textContent = text;
  msgs.appendChild(el); msgs.scrollTop = msgs.scrollHeight;
  return el;
}
function setState(s) {
  state = s;
  window.__hudState = s;
  const r = document.getElementById("ag-runner");
  if (r) r.classList.toggle("live", s !== "idle");
  $("m-runner").textContent = s === "thinking" ? "WORKING" : s === "speaking" ? "SPEAKING" : s === "listening" ? "LISTENING" : "IDLE";
  $("dot-runner").className = "dot" + (s !== "idle" ? " busy" : "");
}

async function send(message) {
  if (!message.trim()) return;
  addMsg("you", message);
  $("cmd").value = "";
  setState("thinking");
  const ack = ACKS[Math.floor(Math.random() * ACKS.length)];
  addMsg("sys", ack.toLowerCase());
  if (speakOn) speak(ack, true);
  const reply = addMsg("jarvis", "");
  const tools = document.createElement("div");
  reply.before(tools);
  let acc = "";
  try {
    const resp = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
    });
    const rd = resp.body.getReader(), dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await rd.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const evm = chunk.match(/^event: (.+)$/m), dm = chunk.match(/^data: (.+)$/m);
        if (!evm || !dm) continue;
        const ev = evm[1], data = JSON.parse(dm[1]);
        if (ev === "session") { sessionId = data.sessionId; localStorage.setItem("jarvis_session", sessionId); }
        else if (ev === "delta") { acc += data.text; reply.textContent = acc; msgs.scrollTop = msgs.scrollHeight; }
        else if (ev === "tool") {
          const c = document.createElement("span");
          c.className = "toolchip"; c.textContent = data.name;
          tools.appendChild(c);
        }
        else if (ev === "done") {
          if (data.result && !acc) reply.textContent = acc = data.result;
          if (data.sessionId) { sessionId = data.sessionId; localStorage.setItem("jarvis_session", sessionId); }
        }
        else if (ev === "error") reply.textContent = acc + "\n[runner error " + data.code + "]";
      }
    }
  } catch (e) { reply.textContent = acc + "\n[link error: " + e.message + "]"; }
  loadData();
  if (speakOn && acc) speak(acc); else setState("idle");
}

$("cmd").addEventListener("keydown", (e) => { if (e.key === "Enter") send($("cmd").value); });

/* ---------- voice out (elevenlabs -> browser fallback) ---------- */
let audioEl = null;
function stopSpeaking() {
  if (audioEl) { audioEl.pause(); audioEl = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
}
async function speak(text, quiet = false) {
  const clean = text.replace(/```[\s\S]*?```/g, " code block omitted ")
    .replace(/[*_#`>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 1100);
  if (!clean) { if (!quiet) setState("idle"); return; }
  if (!quiet) stopSpeaking();
  try {
    const r = await fetch("/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
    });
    if (!r.ok) throw new Error("tts " + r.status);
    const blob = await r.blob();
    const el = new Audio(URL.createObjectURL(blob));
    if (!quiet) {
      audioEl = el;
      el.onplay = () => setState("speaking");
      el.onended = el.onerror = () => setState("idle");
    }
    await el.play();
    return;
  } catch (e) { /* fall back to browser voice */ }
  if (!window.speechSynthesis) { if (!quiet) setState("idle"); return; }
  if (quiet) return; // don't queue browser speech over a coming reply
  const u = new SpeechSynthesisUtterance(clean);
  const v = speechSynthesis.getVoices().find((v) => /Daniel|Oliver|en-GB/i.test(v.name + v.lang));
  if (v) u.voice = v;
  u.rate = 1.04; u.pitch = 0.92;
  u.onstart = () => setState("speaking");
  u.onend = u.onerror = () => setState("idle");
  speechSynthesis.speak(u);
}
$("speak").onclick = () => {
  speakOn = !speakOn;
  $("speak").classList.toggle("off", !speakOn);
  if (!speakOn) stopSpeaking();
};

/* ---------- voice in ----------
 * Two paths. If the server has a working speech-to-text provider (local
 * whisper, or OpenAI when a key is present), we record audio here and post it
 * there - the audio stays on the machine when whisper is local. Otherwise we
 * fall back to the browser's SpeechRecognition, which is Chrome only and
 * uploads audio to Google. */
let STT_SERVER = false;
fetch("/api/status")
  .then((r) => r.json())
  .then((s) => {
    STT_SERVER = Boolean(s.stt_server_side);
    // name the brain that is actually answering, rather than assuming one
    const label = $("brain-label");
    const active = (s.brain || {}).active;
    if (label) label.textContent = active ? active.replace("-", ".").toUpperCase() : "NO BRAIN";
    if (!active)
      addMsg("sys", "no brain available - install claude code, or set OPENAI_API_KEY, or point brain.openai.base_url at a local model");
  })
  .catch(() => {});

let mediaRec = null, chunks = [], recording = false;

async function startRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    addMsg("sys", "microphone permission denied");
    return false;
  }
  chunks = [];
  const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  mediaRec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  mediaRec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mediaRec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: mediaRec.mimeType || "audio/webm" });
    if (blob.size < 1200) { setState("idle"); return; } // basically silence
    setState("thinking");
    try {
      const r = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      const data = await r.json();
      if (data.text) { $("cmd").value = data.text; send(data.text); }
      else { addMsg("sys", "could not transcribe that"); setState("idle"); }
    } catch (e) {
      addMsg("sys", "transcription failed: " + e.message);
      setState("idle");
    }
  };
  mediaRec.start();
  recording = true;
  return true;
}

function stopRecording() {
  recording = false;
  $("mic").classList.remove("listening");
  try { mediaRec && mediaRec.state !== "inactive" && mediaRec.stop(); } catch {}
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
if (SR) {
  rec = new SR();
  rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false;
  rec.onresult = (e) => {
    const t = Array.from(e.results).map((r) => r[0].transcript).join("");
    $("cmd").value = t;
    if (e.results[e.results.length - 1].isFinal) { stopListen(); send(t); }
  };
  rec.onend = () => { if (listening) stopListen(); };
  rec.onerror = () => stopListen();
}
function stopListen() {
  listening = false; $("mic").classList.remove("listening");
  if (state === "listening") setState("idle");
  try { rec && rec.stop(); } catch {}
}
$("mic").onclick = async () => {
  if (recording) return stopRecording();
  if (listening) return stopListen();
  stopSpeaking();

  if (STT_SERVER && window.MediaRecorder && navigator.mediaDevices) {
    $("mic").classList.add("listening");
    setState("listening");
    if (!(await startRecording())) { $("mic").classList.remove("listening"); setState("idle"); }
    return;
  }
  if (!rec) {
    addMsg("sys", "no speech input available - install local whisper, add an OpenAI key, or use chrome");
    return;
  }
  listening = true; $("mic").classList.add("listening"); setState("listening");
  rec.start();
};
addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== $("cmd")) { e.preventDefault(); $("cmd").focus(); }
  if (e.key === "Escape") $("modal").classList.remove("open");
});

/* ---------- wake word: "jarvis ..." ---------- */
let wakeOn = localStorage.getItem("jarvis_wake") === "1", wakeRec = null, armed = false;
function syncWake() {
  if (!SR) return;
  const shouldRun = wakeOn && state === "idle" && !listening;
  if (shouldRun && !wakeRec) {
    wakeRec = new SR();
    wakeRec.lang = "en-US"; wakeRec.continuous = true; wakeRec.interimResults = false;
    wakeRec.onresult = (e) => {
      const t = e.results[e.results.length - 1][0].transcript.trim();
      const m = t.match(/\bjarvis\b[,.]?\s*(.*)/i);
      if (armed && t) { armed = false; send(t); return; }
      if (!m) return;
      const cmd = m[1].trim();
      if (cmd.split(/\s+/).filter(Boolean).length >= 2) send(cmd);
      else { armed = true; speak("Yes?"); setTimeout(() => (armed = false), 12000); }
    };
    wakeRec.onend = () => { wakeRec = null; setTimeout(syncWake, 400); };
    wakeRec.onerror = () => {};
    try { wakeRec.start(); } catch { wakeRec = null; }
  } else if (!shouldRun && wakeRec) {
    const r = wakeRec; wakeRec = null;
    try { r.onend = null; r.stop(); } catch {}
  }
}
const origSetState = setState;
setState = (s) => { origSetState(s); syncWake(); };
$("wake").classList.toggle("on", wakeOn);
$("wake").classList.toggle("off", !wakeOn);
$("wake").onclick = () => {
  wakeOn = !wakeOn;
  localStorage.setItem("jarvis_wake", wakeOn ? "1" : "0");
  $("wake").classList.toggle("on", wakeOn);
  $("wake").classList.toggle("off", !wakeOn);
  if (wakeOn) addMsg("sys", "wake word armed - say 'jarvis, <request>'");
  syncWake();
};
syncWake();
