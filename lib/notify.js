/* Chat delivery: named channels, resolved to a provider and its secrets.
 *
 * The sending itself is scripts/notify.py. This file is the part Node needs
 * without spawning Python: which providers exist, which env vars each one
 * reads, and how a channel in config.notify.channels maps onto them. It is
 * read by the agent runner (post-run delivery), by `jarvis agents check`
 * (preflight) and by `jarvis doctor` / `jarvis notify` (status), so the
 * three never disagree about what "configured" means.
 *
 * Nothing here sends. Delivery is opt-in per agent (`notify:` frontmatter or
 * agents.<name>.notify in config) and is run by code after the agent exits,
 * never by the model. The model cannot pick a channel, cannot send twice and
 * cannot paste the wrong file, because it is not involved.
 */
const path = require("path");

/* Mirror of PROVIDERS in scripts/notify.py: the env vars that make a provider
 * configured. The first one is the "main" secret, which is what a channel's
 * `env` key overrides when given as a plain string. */
const PROVIDERS = {
  discord: ["DISCORD_WEBHOOK_URL"],
  telegram: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
  slack: ["SLACK_WEBHOOK_URL"],
  ntfy: ["NTFY_TOPIC"],
  webhook: ["NOTIFY_WEBHOOK_URL"],
};

const MODES = ["summary", "full", "link"];
const WHENS = ["always", "report"];

function channels(cfg) {
  const c = ((cfg || {}).notify || {}).channels;
  return c && typeof c === "object" && !Array.isArray(c) ? c : {};
}

/* Which env var each of a provider's slots reads for this channel.
 *
 * `env` is optional and lets two channels share a provider with different
 * secrets - a second Discord webhook for alerts, say. As a string it renames
 * the main var ({"provider": "discord", "env": "DISCORD_WEBHOOK_URL_ALERTS"});
 * as an object it renames any of them ({"TELEGRAM_CHAT_ID": "TELEGRAM_CHAT_ID_ALERTS"}).
 * Returns [{ slot, from }] where `slot` is what notify.py reads and `from` is
 * the var that actually has to be set. */
function envSlots(channel) {
  const provider = String((channel || {}).provider || "").toLowerCase();
  const slots = PROVIDERS[provider] || [];
  const env = (channel || {}).env;
  return slots.map((slot, i) => {
    let from = slot;
    if (typeof env === "string" && env.trim() && i === 0) from = env.trim();
    else if (env && typeof env === "object" && typeof env[slot] === "string" && env[slot].trim())
      from = env[slot].trim();
    return { slot, from };
  });
}

/* Resolve a channel name against config. Never throws: the caller decides
 * whether a missing channel is a preflight problem or a log line. */
function resolve(cfg, name) {
  const all = channels(cfg);
  const channel = all[name];
  if (!channel || typeof channel !== "object")
    return { name, ok: false, reason: `channel "${name}" is not in notify.channels` };
  const provider = String(channel.provider || "").toLowerCase();
  if (!PROVIDERS[provider])
    return {
      name, provider, ok: false,
      reason: `channel "${name}" has provider "${channel.provider || ""}", not one of ${Object.keys(PROVIDERS).join(", ")}`,
    };
  const slots = envSlots(channel);
  const missing = slots.filter((s) => !process.env[s.from]).map((s) => s.from);
  return { name, provider, slots, missing, ok: missing.length === 0,
    reason: missing.length ? `channel "${name}" needs ${missing.join(", ")} in .env` : "" };
}

/* The environment notify.py should see for this channel: the process env
 * with any renamed secret copied into the slot the script reads. */
function envFor(resolved, base = process.env) {
  const env = { ...base };
  for (const { slot, from } of resolved.slots || [])
    if (from !== slot && base[from] !== undefined) env[slot] = base[from];
  return env;
}

/* Normalise the three agent-level keys, whether they came from frontmatter
 * or from agents.<name> in config. Frontmatter is the shipped default, config
 * wins, so a user can turn delivery on for a shipped agent without editing
 * the file that `git pull` will overwrite. */
function agentSettings(meta, override) {
  const o = override && typeof override === "object" ? override : {};
  const pick = (k) => (o[k] !== undefined ? o[k] : meta[k]);
  let notify = pick("notify");
  if (typeof notify === "string") notify = notify.split(",");
  notify = (Array.isArray(notify) ? notify : []).map((s) => String(s).trim()).filter(Boolean);
  const when = String(pick("notify_when") || "report").trim().toLowerCase();
  const mode = String(pick("notify_mode") || "summary").trim().toLowerCase();
  return { notify, notify_when: when, notify_mode: mode };
}

/* The command line for one delivery. Quoting goes through lib/shell.js so
 * the same string runs under sh, zsh or PowerShell. */
function command(cfg, { provider, title, file, mode }) {
  const shell = require("./shell");
  const script = path.join(cfg.paths.root, "scripts", "notify.py");
  return ["python3", shell.quote(script), "--via", provider,
    "--title", shell.quote(title), "--file", shell.quote(file), "--mode", mode].join(" ");
}

module.exports = { PROVIDERS, MODES, WHENS, channels, envSlots, resolve, envFor, agentSettings, command };
