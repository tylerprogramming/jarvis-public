#!/usr/bin/env node

/* ES5 only, and before anything is required - an old Node has to reach this
 * message rather than a SyntaxError from a module it could not parse. Same
 * check as bin/jarvis, for people who run `node server.js` directly. */
var MIN_NODE = parseInt(String((require("./package.json").engines || {}).node || "18").replace(/[^0-9]/g, ""), 10) || 18;
if (parseInt(process.versions.node.split(".")[0], 10) < MIN_NODE) {
  console.error("\n  Jarvis needs Node " + MIN_NODE + " or newer. This is Node " + process.versions.node +
    ".\n  Run `node bin/jarvis doctor` for the fix.\n");
  process.exit(1);
}

/* Jarvis server - zero npm dependencies.
 *
 * Serves the HUD, exposes vitals and agents, and routes chat to headless
 * Claude Code. Everything personal comes from config.json (see config.js).
 *
 * Security posture: /api/chat spawns a coding agent with write access to this
 * machine, so the server binds to loopback only. Exposing it on a LAN address
 * requires an explicit token - see docs/SECURITY.md.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const { load, expand, merge } = require("./lib/config");
const { writeJsonAtomic } = require("./lib/util");
const tts = require("./lib/tts");
const stt = require("./lib/stt");
const brain = require("./lib/brain");
const agentsLib = require("./lib/agents");
const runs = require("./lib/runs");
const playbook = require("./lib/playbook");
const memory = require("./lib/memory");

let CFG = load(); // reassigned when settings are saved, see apiPutConfig
const ROOT = CFG.paths.root;
const PORT = CFG.server.port || 4747;
const HOST = CFG.server.host || "127.0.0.1";
const TOKEN = CFG.server.token || null;

const MAX_JSON = 1 * 1024 * 1024; // 1 MB
const MAX_AUDIO = 25 * 1024 * 1024; // 25 MB

const readJson = (p, fb) => {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; }
};

const isLoopback = (h) =>
  h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "0:0:0:0:0:0:0:1";

// ---------- documents trail ----------
function docDirs() {
  return [...new Set([
    CFG.paths.reports, CFG.paths.drafts, CFG.paths.journal,
    ...CFG.documents_dirs.map(expand),
  ])];
}

/* Prefer the frontmatter title over the filename.
 * A trail reading "2026-08-01-morning" tells you nothing you did not already
 * know from the date; "Nine days without an upload" is the reason to click. */
function docTitle(file, fallback) {
  let head = "";
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(1024);
    const n = fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);
    head = buf.slice(0, n).toString("utf8");
  } catch {
    return fallback;
  }
  const fm = head.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const t = fm[1].match(/^\s*title\s*:\s*(.+)$/im);
    if (t) return t[1].trim().replace(/^["']|["']$/g, "");
  }
  const h1 = head.match(/^#\s+(.+)$/m);
  return h1 ? h1[1].trim() : fallback;
}

/* Folder furniture, not documents.
 *
 * index.md is navigation, README/CLAUDE label the folder, and *.example.md
 * shows the shape on a fresh clone. The trail holds nine slots and sorts by
 * mtime, so on a new install these four would fill half of it and stay there,
 * burying the reports the panel exists to surface. Same list is applied by
 * scripts/index.py. */
function isFolderMeta(name) {
  const n = name.toLowerCase();
  return n === "index.md" || n === "readme.md" || n === "claude.md" ||
    /\.example\.(md|txt)$/.test(n);
}

function documents() {
  const out = [];
  for (const dir of docDirs()) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      if (isFolderMeta(name)) continue;
      const full = path.join(dir, name);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        // research runs are folders with a report.md inside
        const rep = path.join(full, "report.md");
        if (fs.existsSync(rep)) { out.push({ name, file: rep, mtime: fs.statSync(rep).mtimeMs }); continue; }
        // month folders (2026-08/) - reports are filed by month once the month
        // is closed, so the trail has to look one level down or it goes empty
        if (!/^\d{4}-\d{2}$/.test(name)) continue;
        let inner = [];
        try { inner = fs.readdirSync(full); } catch { continue; }
        for (const f of inner) {
          if (f.startsWith(".") || isFolderMeta(f) || !/\.(md|txt)$/i.test(f)) continue;
          const fp = path.join(full, f);
          try { out.push({ name: f.replace(/\.(md|txt)$/i, ""), file: fp, mtime: fs.statSync(fp).mtimeMs }); } catch {}
        }
        continue;
      }
      if (!/\.(md|txt)$/i.test(name)) continue;
      out.push({ name: name.replace(/\.(md|txt)$/i, ""), file: full, mtime: st.mtimeMs });
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, 9).map((d) => ({
    name: docTitle(d.file, d.name),
    file: d.file,
    age: relAge(d.mtime),
    // The raw timestamp as well as the rendered age. The panel groups by
    // today/earlier, and deriving that by parsing "2h" back into a duration
    // would be reverse-engineering a string this function already threw away.
    mtime: d.mtime,
  }));
}

function relAge(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m";
  if (s < 86400) return Math.round(s / 3600) + "h";
  return Math.round(s / 86400) + "d";
}

// ---------- api handlers ----------
function vitalsAge() {
  const v = readJson(path.join(CFG.paths.data, "vitals.json"), {});
  const staleHours = Number((CFG.vitals || {}).stale_hours) || 36;
  const at = v.updated_at ? new Date(v.updated_at).getTime() : null;
  const hours = at ? (Date.now() - at) / 3600000 : null;
  return { updated_at: v.updated_at || null, hours: hours === null ? null : Math.round(hours * 10) / 10,
    stale: hours === null ? true : hours > staleHours, stale_hours: staleHours };
}

function apiData(res) {
  const p = CFG.profile || {};
  sendJson(res, {
    config: {
      name: CFG.name,
      tagline: CFG.tagline,
      primary_cards: CFG.primary_cards,
      speak_replies: CFG.chat.speak_replies,
      vitals_show: (CFG.vitals || {}).show || [],
      channels: p.channels || {},
      community_label: (p.community || {}).label || "Community",
      calendar_enabled: (CFG.calendar || {}).enabled !== false,
      configured: CFG.configured,
      owner: p.owner || "",
    },
    vitals: readJson(path.join(CFG.paths.data, "vitals.json"), {}),
    // How old the numbers are, decided here so every card agrees. The
    // collector only bumps updated_at when a fetch succeeded, so this is
    // "when were these numbers last true", not "when did something run".
    vitals_age: vitalsAge(),
    history: readJson(path.join(CFG.paths.data, "history.json"), []),
    calendar: readJson(path.join(CFG.paths.data, "calendar.json"), null),
    radar: readJson(path.join(CFG.paths.data, "radar.json"), null),
    directives: readJson(path.join(CFG.paths.data, "directives.json"), { directives: [] }).directives,
    documents: documents(),
    // What the agents have concluded, newest first. The panel shows a few;
    // the count is what tells you the loop is actually running.
    playbook: { rules: playbook.read(CFG, { limit: 12 }), ...playbook.summary(CFG) },
    // The knowledge base: which areas Jarvis knows anything about, and how much.
    knowledge: { areas: playbook.areas(CFG), documents: documents().length },
  });
}

/* Every rule in one knowledge area.
 *
 * Unlimited on purpose. /api/data caps the playbook at 12 so the poll stays
 * small, but this is the "show me everything you know about titles" request and
 * truncating it would quietly answer a different question. Reads the same files
 * the panel does and never writes - agents own the playbook. */
function apiPlaybook(res, q) {
  const section = (q.get("section") || "").trim();
  const all = playbook.read(CFG);
  const rules = section
    ? all.filter((r) => (r.section || "").toLowerCase() === section.toLowerCase())
    : all;
  sendJson(res, { section, count: rules.length, rules });
}

/* Only serves files that genuinely live inside a configured documents dir,
 * checked after resolving symlinks so ../ and link tricks cannot escape. */
function apiDoc(res, q) {
  let requested = q.get("f") || "";
  // A relative path is taken against the repo, which is how a notification's
  // link names the file. The allow-list below still decides whether it opens.
  if (requested && !path.isAbsolute(requested)) requested = path.join(ROOT, requested);
  let real;
  try { real = fs.realpathSync(requested); } catch { return sendJson(res, { error: "not found" }, 404); }
  // The playbook is allowed by exact path, not by directory. It usually lives
  // outside every documents dir - often in a notes vault - and opening it from
  // the panel should not mean whitelisting whatever folder it happens to be in.
  const playbookOk = playbook.playbookFiles(CFG).some((f) => {
    try { return fs.realpathSync(f) === real; } catch { return false; }
  });
  const allowed = playbookOk || docDirs().some((dir) => {
    let realDir;
    try { realDir = fs.realpathSync(dir); } catch { return false; }
    return real === realDir || real.startsWith(realDir + path.sep);
  });
  if (!allowed) return sendJson(res, { error: "not found" }, 404);
  sendJson(res, { name: path.basename(real), content: fs.readFileSync(real, "utf8") });
}

function apiRefresh(res) {
  execFile("python3", [path.join(ROOT, "scripts/collect.py"), "--fetch"], { timeout: 300000 },
    (err, stdout, stderr) => {
      if (err) return sendJson(res, { error: String(stderr || err).slice(0, 500) }, 500);
      apiData(res);
    });
}

function apiDirectives(res, body) {
  const p = path.join(CFG.paths.data, "directives.json");
  const cur = readJson(p, { directives: [] });
  if (typeof body.toggle === "number" && cur.directives[body.toggle])
    cur.directives[body.toggle].done = !cur.directives[body.toggle].done;
  if (body.add) cur.directives.push({ text: String(body.add).slice(0, 200), done: false });
  if (typeof body.remove === "number" && cur.directives[body.remove])
    cur.directives.splice(body.remove, 1);
  cur.updated_at = new Date().toLocaleDateString("sv-SE");
  // agents rewrite this file too; atomic replace so neither side can read a
  // half-written directives list
  writeJsonAtomic(p, cur);
  sendJson(res, { directives: cur.directives });
}

// ---------- chat: route to the configured brain ----------

/* Memory commands are answered here, before any brain is spawned.
 *
 * "remember that ..." writes exactly what was typed into data/memory.md, and
 * "/forget ..." removes it; the model is never in the loop, so what persists is
 * what the operator said, not a paraphrase of it. The same SSE shape the brain
 * uses (done, then end) keeps the HUD code path identical. Returns null when
 * the message is not a memory command. */
const REMEMBER = /^(?:remember(?: that)?|\/remember)\s*[:,-]?\s+([\s\S]+)$/i;
const FORGET = /^\/forget\s+([\s\S]+)$/i;

function memoryCommand(message) {
  let m;
  if ((m = message.match(REMEMBER))) {
    const r = memory.append(CFG, { text: m[1] });
    return r.ok
      ? `Remembered under ${r.section}: ${r.line} (${r.chars} / ${r.budget} chars)`
      : `Not remembered: ${r.reason}.`;
  }
  if ((m = message.match(FORGET))) {
    const r = memory.forget(CFG, m[1]);
    return r.count
      ? `Forgot ${r.count} line(s): ${r.removed.join("; ")}`
      : `Nothing in memory matches "${m[1].trim()}".`;
  }
  if (/^\/memory\s*$/i.test(message)) {
    const r = memory.read(CFG);
    return r.text ? `${r.text.trim()}\n(${r.chars} / ${r.budget} chars)` : "Memory is empty. Say \"remember that ...\" to add a line.";
  }
  return null;
}

async function apiChat(req, res, body) {
  const message = (body.message || "").trim();
  if (!message) return sendJson(res, { error: "empty message" }, 400);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);

  // The page keeps the session in localStorage; the server keeps it in
  // data/session.json, so a fresh tab or a cleared browser resumes the same
  // conversation until New conversation is pressed.
  const sessionId = body.sessionId || memory.getSession(CFG).sessionId || undefined;
  memory.logChat(CFG, { role: "you", text: message, sessionId });

  const local = memoryCommand(message);
  if (local !== null) {
    memory.logChat(CFG, { role: "jarvis", text: local, sessionId });
    send("done", { result: local, sessionId: sessionId || null, local: true });
    res.end();
    return;
  }

  let finished = false;
  const handle = await brain.chat(CFG, {
    message,
    sessionId,
    on: {
      session: (id) => { memory.setSession(CFG, id); send("session", { sessionId: id }); },
      delta: (text) => send("delta", { text }),
      tool: (name) => send("tool", { name }),
      log: (text) => send("log", { text: String(text).slice(0, 500) }),
      done: (payload) => {
        memory.logChat(CFG, { role: "jarvis", text: (payload && payload.result) || "", sessionId: (payload && payload.sessionId) || sessionId });
        send("done", payload);
      },
      error: (err) => {
        /* Brain failures arrive classified (kind/label/message/hint) so the
         * HUD can show why chat stopped and what fixes it. Older callers that
         * pass a bare string still work. */
        const e = typeof err === "string" ? { kind: "unknown", label: "the brain failed", message: err } : (err || {});
        memory.logChat(CFG, { role: "jarvis", text: `[${e.label || "error"}] ${e.message || ""}`.trim(), sessionId });
        send("error", { code: e.message || e.kind || "error", kind: e.kind || "unknown", label: e.label || "the brain failed", message: e.message || "", hint: e.hint || "" });
      },
      end: () => { finished = true; res.end(); },
    },
  });

  // client aborted mid-answer - stop the model rather than burning tokens
  res.on("close", () => { if (!finished) handle.kill(); });
}

function apiChatReset(res) {
  memory.resetSession(CFG);
  sendJson(res, { ok: true });
}

function apiMemory(res) {
  const r = memory.read(CFG);
  sendJson(res, { lines: r.lines, chars: r.chars, budget: r.budget, sections: r.sections });
}

/* The experiments ledger, read only. The HUD never writes it: an experiment
 * is opened and closed by the review agent through scripts/experiments.py,
 * so this is exactly what that script would print. */
function apiExperiments(res) {
  const ex = require("./lib/experiments");
  const all = ex.read(CFG);
  const s = ex.summary(CFG);
  sendJson(res, { experiments: all, open: s.open, overdue: s.overdue, closed: s.closed, max_open: s.maxOpen });
}

function apiMemoryDelete(res, q) {
  const hash = (q.get("hash") || "").trim();
  if (!hash) return sendJson(res, { error: "hash required" }, 400);
  const r = memory.removeByHash(CFG, hash);
  if (!r.ok) return sendJson(res, { error: r.reason }, 404);
  sendJson(res, { ok: true, removed: r.removed });
}

// ---------- agents ----------
const RUNNING = new Set();

/* Everything the ring and the NOW bar say about an agent comes from the run
 * ledger (lib/runs.js), not from the mtime of its log. The mtime version
 * showed DONE for a crash, a skip, a run that wrote nothing, and a restore
 * from backup, and showed it for twelve days while no job was loaded. */
function apiAgents(res) {
  const defined = agentsLib.list(CFG);
  execFile("ps", ["ax", "-o", "command"], (err, stdout) => {
    const procs = err ? "" : stdout;
    const out = defined.map((a) => {
      const h = runs.health(CFG, a);
      return {
        id: a.name,
        label: a.label,
        tag: a.schedule ? cronLabel(a.schedule) : "ON DEMAND",
        description: a.description || "",
        enabled: a.enabled,
        running: RUNNING.has(a.name) || procs.includes(`agents/${a.name}.md`),
        unmet: agentsLib.unmetRequirements(a, CFG),
        // the raw expression too, so the HUD can say "every day at 07:00"
        // rather than only the compact tag that fits on the ring
        schedule: a.schedule || "",
        lastRun: h.lastRun,
        lastExit: h.lastExit,
        health: { state: h.state, detail: h.detail, expectedAt: h.expectedAt, loaded: h.loaded },
      };
    });
    out.push({ id: "runner", label: "RUNNER", tag: "ON DEMAND", enabled: true, running: false, unmet: [], lastRun: null, lastExit: null, health: { state: "ok", detail: "" } });
    sendJson(res, { agents: out });
  });
}

/* "0 7 * * *" -> "07:00", "0 15 * * 5" -> "FRI 15:00" */
function cronLabel(expr) {
  const [min, hour, , , dow] = String(expr).split(/\s+/);
  const pad = (n) => String(n).padStart(2, "0");
  const time = `${pad(hour)}:${pad(min)}`;
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  if (dow && dow !== "*" && days[Number(dow)]) return `${days[Number(dow)]} ${time}`;
  return time;
}

async function apiAgentRun(res, body) {
  const name = String(body.name || "");
  const agent = agentsLib.get(CFG, name);
  if (!agent) return sendJson(res, { error: "unknown agent" }, 404);
  if (RUNNING.has(name)) return sendJson(res, { error: "already running" }, 409);
  RUNNING.add(name);
  sendJson(res, { started: name });
  agentsLib.run(CFG, name).catch(() => {}).finally(() => RUNNING.delete(name));
}

// ---------- voice ----------
async function apiTts(res, body) {
  const text = String(body.text || "").slice(0, 2000);
  if (!text) return sendJson(res, { error: "no text" }, 400);
  const out = await tts.speak(text, CFG);
  if (out.browser) return sendJson(res, { browser: true }, 503);
  res.writeHead(200, { "Content-Type": out.mime, "X-Jarvis-Voice": out.provider });
  res.end(out.buffer);
}

async function apiStt(res, buf, mime) {
  if (!buf || !buf.length) return sendJson(res, { error: "no audio" }, 400);
  const out = await stt.transcribe(buf, mime || "audio/webm", CFG);
  if (out.browser) return sendJson(res, { browser: true }, 503);
  sendJson(res, { text: out.text, provider: out.provider });
}

async function apiStatus(res) {
  sendJson(res, {
    voice: await tts.status(CFG),
    stt: await stt.status(CFG),
    stt_server_side: await stt.serverSideAvailable(CFG),
    brain: await brain.status(CFG),
    mcp: await require("./lib/mcp").status(CFG).catch((e) => ({ servers: [], error: e.message })),
    configured: CFG.configured,
  });
}

// ---------- settings panel ----------
const SECRET_KEYS = /token|key|secret/i;

function apiGetConfig(res) {
  const user = readJson(path.join(ROOT, "config.json"), {});
  sendJson(res, {
    user,
    effective: {
      name: CFG.name,
      tagline: CFG.tagline,
      profile: CFG.profile,
      primary_cards: CFG.primary_cards,
      radar: CFG.radar,
      research: CFG.research,
      knowledge: CFG.knowledge,
      voice: { chain: CFG.voice.chain },
      stt: { chain: CFG.stt.chain },
      brain: { chain: CFG.brain.chain, openai: CFG.brain.openai },
      agents: CFG.agents,
      documents_dirs: CFG.documents_dirs,
      server: { host: CFG.server.host, port: CFG.server.port, token: CFG.server.token ? "set" : null },
    },
  });
}

/* Writes the user's config.json. Secrets belong in .env, never here, so any
 * key that looks like a credential is refused rather than silently stored. */
function apiPutConfig(res, body) {
  const patch = body && body.patch;
  if (!patch || typeof patch !== "object") return sendJson(res, { error: "no patch" }, 400);
  const offending = [];
  (function scan(o, trail) {
    for (const [k, v] of Object.entries(o || {})) {
      if (SECRET_KEYS.test(k) && v) offending.push([...trail, k].join("."));
      if (v && typeof v === "object" && !Array.isArray(v)) scan(v, [...trail, k]);
    }
  })(patch, []);
  if (offending.length)
    return sendJson(res, { error: `put secrets in .env, not config.json: ${offending.join(", ")}` }, 400);

  const file = path.join(ROOT, "config.json");
  const current = readJson(file, {});
  const next = merge(current, patch);
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");

  /* Saving used to write the file and tell you to restart, which meant every
   * settings change cost a restart even though almost nothing here is read at
   * boot. Reload in place instead, and only ask for a restart for the two
   * things that genuinely cannot change under a running server: the address it
   * is bound to and the port it is listening on. */
  const before = { host: CFG.server.host, port: CFG.server.port };
  try {
    CFG = load();
  } catch (e) {
    return sendJson(res, { error: `saved, but could not reload: ${e.message}` }, 500);
  }
  // discovery is cached per process, so a changed server list must re-read
  try { require("./lib/mcp").discover({ fresh: true }); } catch {}

  const restart_required =
    CFG.server.host !== before.host || CFG.server.port !== before.port;
  sendJson(res, { saved: true, restart_required });
}

// ---------- plumbing ----------
function sendJson(res, obj, code = 200) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2",
  ".ico": "image/x-icon", ".json": "application/json",
};

/* Token gate. Only engaged when a token is configured, which is required for
 * any non-loopback bind. A token in the query string sets a cookie so the page
 * and its fetches work from a bookmark. */
function authorized(req, res, url) {
  if (!TOKEN) return true;
  const header = req.headers["x-jarvis-token"];
  const query = url.searchParams.get("token");
  const cookie = (req.headers.cookie || "").match(/jarvis_token=([^;]+)/);
  const given = header || query || (cookie && decodeURIComponent(cookie[1]));
  if (given === TOKEN) {
    if (query) res.setHeader("Set-Cookie", `jarvis_token=${encodeURIComponent(TOKEN)}; Path=/; HttpOnly; SameSite=Strict`);
    return true;
  }
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "unauthorized" }));
  return false;
}

function collectBody(req, res, limit, cb) {
  const chunks = [];
  let size = 0;
  let aborted = false;
  req.on("data", (c) => {
    if (aborted) return;
    size += c.length;
    if (size > limit) {
      aborted = true;
      sendJson(res, { error: "payload too large" }, 413);
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => { if (!aborted) cb(Buffer.concat(chunks)); });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (!authorized(req, res, url)) return;

  if (req.method === "GET") {
    // Browsers and bookmark managers still request this even with a <link>
    // pointing at the SVG. Serve the SVG rather than leaving a 404 in the log.
    if (url.pathname === "/favicon.ico") url.pathname = "/favicon.svg";
    if (url.pathname === "/api/data") return apiData(res);
    if (url.pathname === "/api/agents") return apiAgents(res);
    if (url.pathname === "/api/doc") return apiDoc(res, url.searchParams);
    if (url.pathname === "/api/playbook") return apiPlaybook(res, url.searchParams);
    if (url.pathname === "/api/status") return apiStatus(res);
    if (url.pathname === "/api/config") return apiGetConfig(res);
    if (url.pathname === "/api/memory") return apiMemory(res);
    if (url.pathname === "/api/experiments") return apiExperiments(res);
  }

  if (req.method === "DELETE") {
    if (url.pathname === "/api/memory") return apiMemoryDelete(res, url.searchParams);
    return sendJson(res, { error: "unknown endpoint" }, 404);
  }

  if (req.method === "POST") {
    // audio arrives as a raw body, everything else as JSON
    if (url.pathname === "/api/stt") {
      return collectBody(req, res, MAX_AUDIO, (buf) =>
        apiStt(res, buf, req.headers["content-type"]));
    }
    return collectBody(req, res, MAX_JSON, (raw) => {
      let body = {};
      try { body = JSON.parse(raw.toString() || "{}"); } catch {}
      if (url.pathname === "/api/chat") return apiChat(req, res, body);
      if (url.pathname === "/api/chat/reset") return apiChatReset(res);
      if (url.pathname === "/api/directives") return apiDirectives(res, body);
      if (url.pathname === "/api/tts") return apiTts(res, body);
      if (url.pathname === "/api/refresh") return apiRefresh(res);
      if (url.pathname === "/api/agents/run") return apiAgentRun(res, body);
      if (url.pathname === "/api/config") return apiPutConfig(res, body);
      sendJson(res, { error: "unknown endpoint" }, 404);
    });
  }

  // static
  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.join(ROOT, "public", path.normalize(rel));
  if (!file.startsWith(path.join(ROOT, "public"))) return sendJson(res, { error: "forbidden" }, 403);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile())
    return sendJson(res, { error: "not found" }, 404);
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] || "text/plain",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(file).pipe(res);
});

// A non-loopback bind without a token would hand anyone on the network a shell
// through /api/chat. Refuse rather than warn.
if (!isLoopback(HOST) && !TOKEN && process.env.JARVIS_ALLOW_INSECURE !== "1") {
  console.error(
    `\nRefusing to bind ${HOST} without a token.\n` +
    `/api/chat runs a coding agent with write access to this machine.\n\n` +
    `Fix: put JARVIS_TOKEN=<a long random string> in .env, or set server.host\n` +
    `back to 127.0.0.1. See docs/SECURITY.md.\n`,
  );
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  const shown = isLoopback(HOST) ? "localhost" : HOST;
  console.log(`JARVIS online -> http://${shown}:${PORT}${TOKEN ? "?token=..." : ""}`);
  if (!CFG.configured)
    console.log(`No config.json yet - run \`npm run setup\` to make this yours.`);
});
