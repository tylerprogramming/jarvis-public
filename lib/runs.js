/* The run ledger, and the health model built on it.
 *
 * Until this existed the HUD decided an agent's "last run" from the mtime of
 * its log file, so a crash, a skip, a run that wrote no report, and a restore
 * from backup all rendered as DONE. Twelve days went by with zero scheduled
 * jobs loaded and nothing on screen said so. Now every run writes one row to
 * data/runs.json and everything that claims to know what ran reads that row.
 *
 * Nothing here spawns claude. The only external calls are the scheduler
 * queries in loaded(), and those are cached because the HUD polls.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { writeJsonAtomic, readJson } = require("./util");

const KEEP = 200;
const GRACE_MIN = 90;

/* Output lines that mean the run did not really happen, in the order the
 * logs taught us to look for them. The first matching line is kept verbatim
 * so the HUD tooltip and doctor say what claude said, not a paraphrase. */
const FAILURE_SIGNATURES = [
  /went to sleep mid-response/i,
  /Connection closed/i,
  /Failed to authenticate/i,
  /OAuth/i,
  /rate limit/i,
  /permission prompt/i,
];

/* Only these are worth a second attempt: they are the machine or the link
 * dropping out, not the agent being wrong. Retrying an auth failure or a
 * permission prompt just burns another slot on the same answer. */
const RETRYABLE = [/went to sleep mid-response/i, /Connection closed/i];

function ledgerFile(cfg) {
  return path.join(cfg.paths.data, "runs.json");
}

function read(cfg) {
  const rows = readJson(ledgerFile(cfg), []);
  return Array.isArray(rows) ? rows : [];
}

/* Insert or replace one row, matched on agent + started, and keep the file
 * bounded. The open "started" record and the final record share a key on
 * purpose: the second write replaces the first, so a run that never gets to
 * its second write leaves the open one behind as evidence. */
function record(cfg, row) {
  const rows = read(cfg).filter((r) => !(r.agent === row.agent && r.started === row.started));
  rows.push(row);
  rows.sort((a, b) => String(a.started).localeCompare(String(b.started)));
  writeJsonAtomic(ledgerFile(cfg), rows.slice(-KEEP));
  return row;
}

function firstError(text) {
  for (const line of String(text || "").split("\n")) {
    if (FAILURE_SIGNATURES.some((re) => re.test(line))) return line.trim().slice(0, 300);
  }
  return null;
}

function retryable(error) {
  return Boolean(error) && RETRYABLE.some((re) => re.test(String(error)));
}

/* The newest run of one agent. The ledger wins; before it existed the only
 * witness was data/logs/<name>.log, so that is read as a fallback and marked
 * source: "log". A log-sourced row has no artifact information, which is why
 * health() does not judge staleness on it. */
function last(cfg, agent) {
  const name = typeof agent === "string" ? agent : agent.name;
  const rows = read(cfg).filter((r) => r.agent === name);
  if (rows.length) return { ...rows[rows.length - 1], source: "ledger" };
  return lastFromLog(cfg, agent);
}

/* Agents that were renamed in the repo's history. Their old logs are the only
 * run record from before the ledger, and "never ran" for an agent that ran
 * every day under its previous name would be the kind of wrong this file
 * exists to stop. */
const OLD_NAMES = { brief: ["morning"], journal: ["nightly"], review: ["weekly-review"] };

function lastFromLog(cfg, agent) {
  const name = typeof agent === "string" ? agent : agent.name;
  const dir = path.join(cfg.paths.data, "logs");
  const candidates = [agent && agent.log ? agent.log : path.join(dir, `${name}.log`)]
    .concat((OLD_NAMES[name] || []).map((n) => path.join(dir, `${n}.log`)));
  let text = "";
  for (const log of candidates) {
    try { text = fs.readFileSync(log, "utf8"); break; } catch {}
  }
  if (!text) return null;
  const lines = text.split("\n");
  // walk backwards to the last run header; everything after it is that run
  let i = lines.length - 1;
  for (; i >= 0; i--) if (/^=== \S+ \d{4}-\d{2}-\d{2} \d{2}:\d{2} ===/.test(lines[i])) break;
  if (i < 0) return null;
  const h = lines[i].match(/^=== \S+ (\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}) ===/);
  const started = new Date(`${h[1]}T${h[2]}:${h[3]}:00`);
  let exit = null, skipped = false;
  for (const l of lines.slice(i + 1)) {
    const d = l.match(/^=== done \(exit (-?\d+)\) ===/);
    if (d) { exit = Number(d[1]); break; }
    if (/^skipped:/.test(l)) { exit = 0; skipped = true; break; }
  }
  return {
    agent: typeof agent === "string" ? agent : agent.name,
    started: started.toISOString(), ended: null, exit, skipped,
    artifact: undefined, error: null, source: "log",
  };
}

/* ---------- cron ----------
 *
 * The five-field form the agents already use: minute hour dom month dow, with
 * numbers, "*", lists and ranges. Steps and names are refused with a message
 * rather than half-understood, because a schedule this code misreads is a
 * schedule whose lateness it can never report. */
function field(text, lo, hi, what) {
  const out = new Set();
  const s = String(text).trim();
  if (s === "*") { for (let i = lo; i <= hi; i++) out.add(i); return out; }
  for (const part of s.split(",")) {
    if (part.includes("/")) throw new Error(`cron ${what} "${part}": step syntax is not supported`);
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`cron ${what} "${part}": expected a number, range or *`);
    const a = Number(m[1]), b = m[2] === undefined ? a : Number(m[2]);
    if (a < lo || b > hi || a > b) throw new Error(`cron ${what} "${part}": out of range ${lo}-${hi}`);
    for (let i = a; i <= b; i++) out.add(i);
  }
  return out;
}

function parseCron(expr) {
  const parts = String(expr || "").trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron "${expr}": expected 5 fields`);
  const [mi, h, dom, mo, dow] = parts;
  const spec = {
    minute: field(mi, 0, 59, "minute"),
    hour: field(h, 0, 23, "hour"),
    dom: field(dom, 1, 31, "day of month"),
    month: field(mo, 1, 12, "month"),
    dow: field(dow, 0, 7, "day of week"),
    anyDom: dom.trim() === "*",
    anyDow: dow.trim() === "*",
  };
  if (spec.dow.has(7)) spec.dow.add(0); // 7 is Sunday too, as in every cron
  return spec;
}

/* Vixie cron's one odd rule, kept: when both day fields are restricted the
 * day matches if EITHER does. */
function dayMatches(spec, d) {
  if (!spec.month.has(d.getMonth() + 1)) return false;
  const domOk = spec.dom.has(d.getDate());
  const dowOk = spec.dow.has(d.getDay());
  if (spec.anyDom && spec.anyDow) return true;
  if (spec.anyDom) return dowOk;
  if (spec.anyDow) return domOk;
  return domOk || dowOk;
}

/* Last fire at or before `now`, in local time. Walks backwards, skipping a
 * whole day or hour at a time when it cannot match, so a weekly schedule
 * costs a few hundred steps rather than ten thousand. Local Date arithmetic
 * so a DST change moves the wall clock the way launchd and cron see it. */
function prevFire(spec, now = new Date()) {
  const t = new Date(now);
  t.setSeconds(0, 0);
  for (let guard = 0; guard < 400000; guard++) {
    if (!dayMatches(spec, t)) { t.setHours(0, 0, 0, 0); t.setMinutes(-1); continue; }
    if (!spec.hour.has(t.getHours())) { t.setMinutes(0, 0, 0); t.setMinutes(-1); continue; }
    if (!spec.minute.has(t.getMinutes())) { t.setMinutes(t.getMinutes() - 1); continue; }
    return t;
  }
  return null;
}

/* First fire strictly after `from`. Same walk, forwards. */
function nextFire(spec, from = new Date()) {
  const t = new Date(from);
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  for (let guard = 0; guard < 400000; guard++) {
    if (!dayMatches(spec, t)) { t.setHours(24, 0, 0, 0); continue; }
    if (!spec.hour.has(t.getHours())) { t.setHours(t.getHours() + 1, 0, 0, 0); continue; }
    if (!spec.minute.has(t.getMinutes())) { t.setMinutes(t.getMinutes() + 1); continue; }
    return t;
  }
  return null;
}

/* When the agent's schedule last said it should have fired. null when the
 * agent has no schedule or the expression cannot be read. */
function expected(cfg, agent, now = new Date()) {
  if (!agent.schedule) return null;
  let spec;
  try { spec = parseCron(agent.schedule); } catch { return null; }
  return prevFire(spec, now);
}

/* ---------- is the OS job actually there ----------
 *
 * The check is deliberately two-part on macOS. `launchctl list` says the job
 * is loaded; it does not say the program it points at exists. Homebrew puts
 * node in a versioned Cellar path and an upgrade removes the old one, so
 * every plist written before the upgrade points at nothing and launchd fails
 * each fire with a line in a log nobody opens. */
const LOADED_TTL_MS = 30000;
const loadedCache = new Map();

function loaded(cfg, agent, { fresh = false } = {}) {
  const hit = loadedCache.get(agent.name);
  if (!fresh && hit && Date.now() - hit.at < LOADED_TTL_MS) return hit.result;
  const result = loadedNow(cfg, agent);
  loadedCache.set(agent.name, { at: Date.now(), result });
  return result;
}

function loadedNow(cfg, agent) {
  const { LABEL_PREFIX } = require("./schedule");
  const label = `${LABEL_PREFIX}${agent.name}`;
  const q = { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 5000 };

  if (process.platform === "darwin") {
    const plist = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
    let body = null;
    try { body = fs.readFileSync(plist, "utf8"); } catch {}
    if (body === null) return { loaded: false, reason: "no launchd job (jarvis agents install)" };
    // the program first: launchd loads a plist whose binary is gone without
    // complaint and then fails every fire, so this is the root cause to name
    const m = body.match(/<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]+)<\/string>/);
    const prog = m ? m[1].trim() : "";
    if (prog && !fs.existsSync(prog))
      return { loaded: false, reason: `plist points at a node that no longer exists: ${prog} (jarvis agents install)` };
    let listed = false;
    try { execFileSync("launchctl", ["list", label], q); listed = true; } catch {}
    if (!listed) return { loaded: false, reason: "plist exists but launchd has not loaded it (jarvis agents install)" };
    return { loaded: true, reason: "" };
  }

  if (process.platform === "win32") {
    try { execFileSync("schtasks", ["/Query", "/TN", label], q); return { loaded: true, reason: "" }; }
    catch { return { loaded: false, reason: "no scheduled task (jarvis agents install)" }; }
  }

  let tab = "";
  try { tab = execFileSync("crontab", ["-l"], q); } catch {}
  const { MARK } = require("./schedule");
  const there = tab.split("\n").some((l) => l.includes(MARK) && l.includes(`bin/jarvis agent ${agent.name} `));
  return there ? { loaded: true, reason: "" } : { loaded: false, reason: "no crontab entry (jarvis agents install)" };
}

/* ---------- health ---------- */

/* Does this prompt promise a file? An agent whose body never mentions the
 * reports or journal dir has nothing to be stale about. */
function writesReports(agent) {
  return /\{\{(reports|journal_dir)\}\}/.test(String(agent.body || ""));
}

function fmtLocal(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.toLocaleDateString("sv-SE")} ${x.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/* One verdict per agent, with the reason in words. Order matters: a job that
 * is not loaded explains every missed fire after it, so it wins; a run that
 * is still open is reported as running until it has outlived the timeout.
 *
 * Returns { state, detail, lastRun, lastExit, expectedAt, artifact, overdue,
 * overdueSince, loaded } where state is one of ok, failed, overdue, stale,
 * never, running, not-loaded. */
function health(cfg, agent, now = new Date()) {
  const nowMs = now.getTime();
  const timeoutMin = Number((cfg.agents || {}).timeout_minutes) || 45;
  const lastRow = last(cfg, agent);
  const lastMs = lastRow ? new Date(lastRow.started).getTime() : null;
  const expectedAt = expected(cfg, agent, now);
  const scheduled = Boolean(agent.schedule && agent.enabled && expectedAt);

  const out = {
    state: "ok", detail: "",
    lastRun: lastMs, lastExit: lastRow ? lastRow.exit : null,
    expectedAt: expectedAt ? expectedAt.getTime() : null,
    artifact: lastRow && lastRow.artifact ? lastRow.artifact : null,
    overdue: false, overdueSince: null, loaded: null,
    trigger: lastRow ? lastRow.trigger || null : null,
  };

  // an open record: still going, or the process died without its second write
  const open = lastRow && lastRow.exit === null;
  if (open && nowMs - lastMs < (timeoutMin + 10) * 60000) {
    out.state = "running";
    out.detail = `started ${fmtLocal(lastMs)}`;
    return out;
  }

  // overdue: the newest fire whose grace has passed, with no run since it
  if (scheduled) {
    let spec = null;
    try { spec = parseCron(agent.schedule); } catch {}
    const graced = spec ? prevFire(spec, new Date(nowMs - GRACE_MIN * 60000)) : null;
    if (graced && (!lastMs || lastMs < graced.getTime() - 5 * 60000)) {
      out.overdue = true;
      // since the first fire after the last run, or the one just missed when
      // there is no run to count from
      const since = lastMs && spec ? nextFire(spec, new Date(lastMs)) : graced;
      out.overdueSince = (since || graced).getTime();
    }
  }

  if (scheduled) {
    const l = loaded(cfg, agent);
    out.loaded = l.loaded;
    if (!l.loaded) {
      out.state = "not-loaded";
      out.detail = l.reason + (out.overdue ? `; overdue since ${fmtLocal(out.overdueSince)}` : "")
        + (!lastRow ? "; never ran" : "");
      return out;
    }
  }

  if (out.overdue) {
    out.state = "overdue";
    out.detail = `expected ${fmtLocal(out.overdueSince)}, ${lastRow ? `last ran ${fmtLocal(lastMs)}` : "never ran"}`;
    return out;
  }

  if (!lastRow) {
    out.state = "never";
    out.detail = agent.schedule ? `not run yet; next ${fmtLocal(nextFireSafe(agent.schedule, now))}` : "not run yet";
    return out;
  }

  if (open) {
    out.state = "failed";
    out.detail = `started ${fmtLocal(lastMs)} and never finished (open the log)`;
    return out;
  }

  if (lastRow.exit !== 0) {
    out.state = "failed";
    out.detail = `exit ${lastRow.exit} at ${fmtLocal(lastMs)}${lastRow.error ? `: ${lastRow.error}` : ""}`;
    return out;
  }

  if (lastRow.skipped) {
    out.detail = `skipped ${fmtLocal(lastMs)}: config is missing ${(lastRow.missing || []).join(", ") || "something"}`;
    return out;
  }

  // ran clean but left nothing behind. Only judged on a ledger row, which
  // knows whether findArtifact saw a file; the log fallback cannot say.
  if (lastRow.source === "ledger" && writesReports(agent) && !lastRow.artifact && !agent.quiet_ok) {
    out.state = "stale";
    out.detail = `ran ${fmtLocal(lastMs)} (exit 0) but wrote no report`;
    return out;
  }

  // a log-sourced row predates the ledger and cannot say what it wrote
  out.detail = `ran ${fmtLocal(lastMs)}${lastRow.source === "log" ? " (from the log, before the ledger)" : lastRow.artifact ? "" : ", nothing to write"}`;
  return out;
}

function nextFireSafe(schedule, now) {
  try { return nextFire(parseCron(schedule), now); } catch { return now; }
}

/* Every enabled scheduled agent's health, for the callers that want the
 * whole picture (doctor, the watchdog line in the HUD). */
function all(cfg, agents, now = new Date()) {
  return agents.map((a) => ({ agent: a.name, schedule: a.schedule || "", ...health(cfg, a, now) }));
}

module.exports = {
  read, record, last, expected, health, all, loaded, parseCron, prevFire, nextFire,
  firstError, retryable, writesReports, ledgerFile, GRACE_MIN, FAILURE_SIGNATURES,
};
