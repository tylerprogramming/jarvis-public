/* The Telegram bridge's state, read the same way everywhere.
 *
 * Two files hold it: data/inbox.pid (who to stop) and data/inbox.json (what
 * the poller last did). `jarvis inbox`, `jarvis doctor` and `jarvis connect`
 * all report on the bridge, and they have to agree about the word "running",
 * which is why the rule lives here rather than in each of them. A pid whose
 * process is gone counts as not running: a stale pid file after a crash or a
 * reboot is the normal case, not an error.
 */
const fs = require("fs");
const path = require("path");
const { readJson } = require("./util");

const ROOT = path.join(__dirname, "..");
const PID_FILE = path.join(ROOT, "data", "inbox.pid");
const STATE_FILE = path.join(ROOT, "data", "inbox.json");
const LOG_FILE = path.join(ROOT, "data", "logs", "inbox.log");
const STUCK_MS = 3 * 60 * 1000; // a 50 s long poll that has not returned in 3 min is wedged

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

/* Allowed chat ids as the bridge computes them, from the loaded env. */
function allowed() {
  const out = [];
  for (const raw of [process.env.TELEGRAM_CHAT_ID, process.env.TELEGRAM_ALLOWED_CHAT_IDS])
    for (const p of String(raw || "").split(","))
      if (p.trim() && !out.includes(p.trim())) out.push(p.trim());
  return out;
}

function status() {
  const missing = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"].filter((k) => !process.env[k]);
  let pid = null;
  try { pid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10) || null; } catch {}
  const running = pid !== null && alive(pid);
  const st = readJson(STATE_FILE) || {};
  const lastPoll = st.last_poll ? new Date(st.last_poll).getTime() : null;
  const pollAgeMs = lastPoll ? Date.now() - lastPoll : null;
  return {
    configured: missing.length === 0, missing, pid, running,
    allowed: allowed(), bot: st.bot || "", lastPoll, pollAgeMs,
    stuck: running && (pollAgeMs === null || pollAgeMs > STUCK_MS),
    offset: st.offset || 0,
  };
}

const ago = (ms) => ms === null ? "never" : ms < 60000 ? `${Math.round(ms / 1000)} s ago` : ms < 3600000 ? `${Math.round(ms / 60000)} min ago` : `${(ms / 3600000).toFixed(1)} h ago`;

/* One line for doctor, `jarvis inbox` and `jarvis connect --status`: off /
 * configured but not running / running (pid, last poll age), with the stuck
 * warning, because a wedged poller reads as fine everywhere else. */
function line(s) {
  if (!s.configured) return `off   (set ${s.missing.join(", ")} in .env to talk to Jarvis from your phone; docs/NOTIFY.md)`;
  if (!s.running) return `configured but not running   (jarvis inbox start)`;
  const who = s.bot ? `@${s.bot}, ` : "";
  return `running   pid ${s.pid}, ${who}last poll ${ago(s.pollAgeMs)}${s.stuck ? "   <- poller looks stuck (no poll in 3 min); jarvis inbox stop, then start" : ""}`;
}

module.exports = { PID_FILE, STATE_FILE, LOG_FILE, STUCK_MS, allowed, status, line, ago };
