/* The operator memory tier: facts the operator told Jarvis, kept by code.
 *
 * Three files, all under data/ and all gitignored:
 *
 *   memory.md        one line per durable fact, under four fixed headings
 *   decisions.jsonl  dated decisions and experiment results, for the recap
 *   chat.log         every chat turn, one JSON line each, when enabled
 *
 * plus session.json, which remembers the Claude Code session between page
 * loads so a refresh does not start the conversation over.
 *
 * The model never writes any of this. /api/chat intercepts "remember that ..."
 * and "/forget ..." before the brain is spawned and calls append/forget here,
 * so what persists is exactly what the operator typed, dated by the machine.
 * A model that decides for itself what is worth keeping fills the file with
 * its own paraphrases, and the operator stops trusting it. The budget exists
 * for the same reason: the whole file goes into every prompt, so it has to
 * stay small, and refusing an append is the only honest way to say so.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SECTIONS = ["Preferences", "Corrections", "Decisions", "Standing rules"];
const KINDS = ["decision", "experiment", "result"];

const today = () => new Date().toLocaleDateString("sv-SE");

function settings(cfg) {
  const m = (cfg && cfg.memory) || {};
  return {
    budget: Number(m.operator_budget) > 0 ? Number(m.operator_budget) : 3000,
    recapDays: Number(m.recap_days) > 0 ? Number(m.recap_days) : 14,
    recapChars: Number(m.recap_chars) > 0 ? Number(m.recap_chars) : 1500,
    chatLog: m.chat_log !== false,
  };
}

const files = (cfg) => ({
  memory: path.join(cfg.paths.data, "memory.md"),
  decisions: path.join(cfg.paths.data, "decisions.jsonl"),
  chatLog: path.join(cfg.paths.data, "chat.log"),
  session: path.join(cfg.paths.data, "session.json"),
});

/* Same hazard writeJsonAtomic in util.js guards against: the server and the
 * CLI can both write memory.md, and a reader must never see a half-written
 * file. Temp file in the same directory, then rename. */
function writeTextAtomic(file, text) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function readText(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

/* A short stable id for one line, so the HUD can delete exactly that line
 * without sending the text back and matching on it. */
const lineHash = (section, date, text) =>
  crypto.createHash("sha1").update(`${section}\n${date}\n${text}`).digest("hex").slice(0, 10);

/* Parse the file into lines. Tolerant of hand edits: an unknown heading is
 * kept under its own name, a bullet without a date gets today's. */
function parse(raw) {
  const lines = [];
  let section = SECTIONS[0];
  for (const l of String(raw || "").split("\n")) {
    const h = l.match(/^##\s+(.+?)\s*$/);
    if (h) { section = h[1]; continue; }
    const b = l.match(/^-\s+(?:\[(\d{4}-\d{2}-\d{2})\]\s*)?(.+?)\s*$/);
    if (!b) continue;
    const date = b[1] || today();
    const text = b[2];
    lines.push({ section, date, text, hash: lineHash(section, date, text) });
  }
  return lines;
}

/* Render lines back to the file. Only sections that hold something, always in
 * the canonical order, so the file and the prompt text are the same bytes and
 * the budget measures what the model actually receives. */
function render(lines) {
  const order = [...SECTIONS];
  for (const l of lines) if (!order.includes(l.section)) order.push(l.section);
  const out = [];
  for (const s of order) {
    const mine = lines.filter((l) => l.section === s);
    if (!mine.length) continue;
    out.push(`## ${s}`);
    for (const l of mine) out.push(`- [${l.date}] ${l.text}`);
    out.push("");
  }
  return out.join("\n").trim() + (out.length ? "\n" : "");
}

function read(cfg) {
  const { budget } = settings(cfg);
  const file = files(cfg).memory;
  const raw = readText(file);
  const lines = parse(raw);
  const text = render(lines);
  return { file, text, chars: text.length, budget, lines, sections: SECTIONS };
}

/* Which heading a "remember that ..." line belongs under. Tiny on purpose:
 * a few leading words, nothing clever, so the operator can predict it and
 * fix a miss with /forget plus a rephrase. */
function classify(text) {
  const t = String(text).trim().toLowerCase();
  if (/^(we decided|decision:)/.test(t)) return "Decisions";
  if (/^(never|always|rule:)/.test(t)) return "Standing rules";
  if (/^(correction:|actually)/.test(t)) return "Corrections";
  return "Preferences";
}

function append(cfg, { section, text }) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return { ok: false, reason: "nothing to remember" };
  const sec = SECTIONS.includes(section) ? section : classify(clean);
  const cur = read(cfg);
  if (cur.lines.some((l) => l.text.toLowerCase() === clean.toLowerCase()))
    return { ok: false, reason: "already remembered" };
  const date = today();
  const next = [...cur.lines, { section: sec, date, text: clean, hash: lineHash(sec, date, clean) }];
  const out = render(next);
  if (out.length > cur.budget) {
    return {
      ok: false,
      reason: `memory is full (${cur.chars} of ${cur.budget} chars); forget something first`,
    };
  }
  writeTextAtomic(cur.file, out);
  // A decision is also a dated event, so the recap can show it in order
  // beside the experiment results agents record.
  if (sec === "Decisions") recordDecision(cfg, { kind: "decision", text: clean, source: "chat" });
  return { ok: true, section: sec, line: `[${date}] ${clean}`, chars: out.length, budget: cur.budget };
}

/* Remove every line containing the needle, case-insensitive. Returns what
 * went, so the reply can show it and a wrong guess is visible at once. */
function forget(cfg, needle) {
  const n = String(needle || "").trim().toLowerCase();
  if (!n) return { removed: [], count: 0 };
  const cur = read(cfg);
  const removed = cur.lines.filter((l) => l.text.toLowerCase().includes(n));
  if (!removed.length) return { removed: [], count: 0 };
  const keep = cur.lines.filter((l) => !removed.includes(l));
  writeTextAtomic(cur.file, render(keep));
  return { removed: removed.map((l) => `[${l.date}] ${l.text}`), count: removed.length };
}

/* Remove exactly one line by the hash read() handed out. */
function removeByHash(cfg, hash) {
  const cur = read(cfg);
  const hit = cur.lines.find((l) => l.hash === hash);
  if (!hit) return { ok: false, reason: "no such line" };
  writeTextAtomic(cur.file, render(cur.lines.filter((l) => l !== hit)));
  return { ok: true, removed: `[${hit.date}] ${hit.text}` };
}

// ---------- decisions and the recap ----------
function recordDecision(cfg, { kind, text, source, date }) {
  const k = KINDS.includes(kind) ? kind : "decision";
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return false;
  const row = { date: date || today(), kind: k, text: clean, source: source || "chat" };
  fs.mkdirSync(path.dirname(files(cfg).decisions), { recursive: true });
  fs.appendFileSync(files(cfg).decisions, JSON.stringify(row) + "\n");
  return true;
}

function decisions(cfg, days) {
  const { recapDays } = settings(cfg);
  const window = Number(days) > 0 ? Number(days) : recapDays;
  const since = new Date();
  since.setDate(since.getDate() - window);
  const cutoff = since.toLocaleDateString("sv-SE");
  const rows = [];
  for (const line of readText(files(cfg).decisions).split("\n")) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r || !r.text || !r.date || r.date < cutoff) continue;
    // Experiment and result rows from scripts/experiments.py carry extra
    // fields (id, metric, target, deadline, verdict). The recap keeps the
    // ones that make the line readable on its own and ignores the rest.
    let text = String(r.text);
    if (r.kind === "experiment" && r.id) text = `${r.id}: ${text}${r.deadline ? ` (by ${r.deadline})` : ""}`;
    if (r.kind === "result" && r.experiment) text = `${r.experiment} ${r.verdict || "unmeasured"}: ${text}`;
    rows.push({ date: r.date, kind: KINDS.includes(r.kind) ? r.kind : "decision", text, source: r.source || "" });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { rows, days: window };
}

/* The last N days of decisions as prompt text, newest last so the model reads
 * them in order, cut from the front when over the cap: the oldest are the
 * ones least worth the tokens. */
function recap(cfg, days) {
  const { recapChars } = settings(cfg);
  const { rows } = decisions(cfg, days);
  if (!rows.length) return "";
  let lines = rows.map((r) => `- [${r.date}] ${r.kind}: ${r.text}`);
  let text = lines.join("\n");
  while (text.length > recapChars && lines.length > 1) {
    lines = lines.slice(1);
    text = lines.join("\n");
  }
  if (text.length > recapChars) text = text.slice(0, recapChars);
  return text;
}

// ---------- chat log ----------
function logChat(cfg, { role, text, sessionId }) {
  if (!settings(cfg).chatLog) return false;
  const row = {
    ts: new Date().toISOString(),
    role: role === "jarvis" ? "jarvis" : "you",
    sessionId: sessionId || null,
    text: String(text || ""),
  };
  try {
    fs.mkdirSync(path.dirname(files(cfg).chatLog), { recursive: true });
    fs.appendFileSync(files(cfg).chatLog, JSON.stringify(row) + "\n");
    return true;
  } catch {
    return false;
  }
}

// ---------- session ----------
function getSession(cfg) {
  try {
    const s = JSON.parse(fs.readFileSync(files(cfg).session, "utf8"));
    return s && s.sessionId ? s : { sessionId: null, started: null, turns: 0 };
  } catch {
    return { sessionId: null, started: null, turns: 0 };
  }
}

/* Called on every brain `session` event. Claude reports the id each turn, so
 * the same id means one more turn on the running conversation. */
function setSession(cfg, id) {
  if (!id) return getSession(cfg);
  const cur = getSession(cfg);
  const next = cur.sessionId === id
    ? { ...cur, turns: (cur.turns || 0) + 1 }
    : { sessionId: id, started: new Date().toISOString(), turns: 1 };
  writeTextAtomic(files(cfg).session, JSON.stringify(next, null, 2) + "\n");
  return next;
}

function resetSession(cfg) {
  const empty = { sessionId: null, started: null, turns: 0 };
  writeTextAtomic(files(cfg).session, JSON.stringify(empty, null, 2) + "\n");
  return empty;
}

// ---------- brain file heading index ----------
/* The ## and ### headings of a markdown file, one per line, capped. This is
 * what the persona lists instead of the file body: the model sees what the
 * file covers and reads the section it needs, rather than every prompt paying
 * for a 4 KB file it mostly does not use. */
function headingIndex(file, cap = 600) {
  const raw = readText(file);
  if (!raw) return "";
  const heads = [];
  for (const l of raw.split("\n")) {
    const m = l.match(/^(##|###)\s+(.+?)\s*$/);
    if (!m) continue;
    heads.push((m[1] === "###" ? "  " : "") + m[2].trim());
  }
  if (!heads.length) return "";
  let out = heads.join("\n");
  if (out.length > cap) out = out.slice(0, cap).replace(/\n[^\n]*$/, "") + "\n...";
  return out;
}

module.exports = {
  SECTIONS, KINDS, settings, files,
  read, append, forget, removeByHash, classify,
  recordDecision, decisions, recap,
  logChat, getSession, setSession, resetSession,
  headingIndex,
};
