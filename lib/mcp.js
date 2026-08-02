/* MCP servers.
 *
 * The Claude Code brain inherits whatever MCP servers the operator has already
 * configured, so Jarvis does not have to connect to anything itself. What it
 * does have to do is allow them, because headless `claude -p` runs against an
 * explicit --allowedTools list and anything absent is rejected before it ever
 * reaches the server. The failure looks like a broken connection and is not:
 * the server is connected, the call is refused locally.
 *
 * Allowing every server by default would be wrong. These are the tools that
 * send email, post to channels, and delete records, so the operator opts in per
 * server. What Jarvis owes them is to make that opt-in obvious rather than
 * something they discover after a request silently fails.
 */
const { execFile } = require("child_process");

/* Claude Code derives a tool prefix from the server name by replacing anything
 * that is not alphanumeric or underscore. "claude.ai Supabase" becomes
 * mcp__claude_ai_Supabase, "plugin:resend:resend" becomes
 * mcp__plugin_resend_resend. Get this wrong and the allow entry silently
 * matches nothing, which looks exactly like not allowing it at all. */
function prefix(name) {
  return `mcp__${String(name).replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/* `claude mcp list` prints "<name>: <url> - <status>" per server, plus a
 * health-check header we skip. */
function parse(out) {
  const servers = [];
  for (const raw of String(out).split("\n")) {
    const line = raw.trim();
    if (!line || !line.includes(":")) continue;
    const m = line.match(/^(.+?):\s+(\S+)\s*(?:\((\w+)\))?\s*-\s*(.+)$/);
    if (!m) continue;
    const [, name, url, , status] = m;
    if (/^checking/i.test(name)) continue;
    servers.push({
      name,
      url,
      connected: /✔|connected/i.test(status),
      status: status.replace(/^[✔!✗×]\s*/, "").trim(),
      prefix: prefix(name),
    });
  }
  return servers;
}

/* Returns { servers, error }, not a bare array.
 *
 * `claude mcp list` health-checks every server over the network, which takes
 * seconds and can time out. An empty array on failure would be reported as
 * "you have no MCP servers", which is a confident lie to someone who has ten
 * and a slow connection. So failure is a distinct state that callers must say
 * out loud rather than render as absence. */
let cache = null;
function discover({ timeout = 25000, fresh = false } = {}) {
  if (cache && !fresh) return Promise.resolve(cache);
  return new Promise((resolve) => {
    execFile("claude", ["mcp", "list"], { timeout, maxBuffer: 4 << 20 }, (err, stdout) => {
      const servers = parse(stdout || "");
      let error = null;
      if (!servers.length && err) {
        if (err.code === "ENOENT") error = "the `claude` CLI is not installed";
        else if (err.killed || err.signal) error = `timed out after ${Math.round(timeout / 1000)}s`;
        else error = err.message.split("\n")[0];
      }
      cache = { servers, error };
      resolve(cache);
    });
  });
}

/* Which servers the operator has turned on. "all" is accepted for people who
 * genuinely want everything and know what that means. */
function enabledNames(cfg) {
  const v = (cfg.chat && cfg.chat.mcp_servers) || [];
  if (v === "all") return "all";
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

/* The tokens to append to --allowedTools. */
async function allowTokens(cfg) {
  const want = enabledNames(cfg);
  if (!want.length) return [];
  const { servers } = await discover();
  if (want === "all") return servers.map((s) => s.prefix);
  // Match on the configured name, but fall back to the derived prefix so both
  // "clickup" and "mcp__clickup" work in config. The fallback matters when
  // discovery failed: an enabled server should still be allowed rather than
  // silently dropped because we could not reach the CLI to confirm it.
  const byName = new Map(servers.map((s) => [s.name.toLowerCase(), s]));
  return want.map((w) => {
    const hit = byName.get(String(w).toLowerCase());
    return hit ? hit.prefix : (String(w).startsWith("mcp__") ? String(w) : prefix(w));
  });
}

/* For doctor and the persona: what exists, and whether it is usable. */
async function status(cfg) {
  const { servers, error } = await discover();
  const want = enabledNames(cfg);
  const on = (s) => want === "all" ||
    want.some((w) => String(w).toLowerCase() === s.name.toLowerCase() || w === s.prefix);
  return { servers: servers.map((s) => ({ ...s, enabled: on(s) })), error };
}

module.exports = { discover, allowTokens, enabledNames, status, prefix, parse };
