/* Agents are markdown files, not shell scripts.
 *
 * Each file in agents/ has a frontmatter block (name, label, schedule, tools)
 * and a prompt body with {{placeholders}} filled from config. One runner
 * executes all of them, so adding an agent means dropping in a .md file - no
 * code, no new launchd plist written by hand.
 */
const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { expand } = require("./config");

/* Deliberately tiny frontmatter parser: scalars, inline [a, b] arrays, and
 * "- item" lists. Enough for agent metadata, no YAML dependency. */
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta = {};
  let key = null;
  for (const line of m[1].split("\n")) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && key) {
      if (!Array.isArray(meta[key])) meta[key] = [];
      meta[key].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const val = kv[2].trim();
    if (val === "") meta[key] = [];
    else if (val.startsWith("[") && val.endsWith("]"))
      meta[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
    else if (val === "true" || val === "false") meta[key] = val === "true";
    else meta[key] = unquote(val);
  }
  return { meta, body: m[2].trim() };
}

function unquote(s) {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  )
    return s.slice(1, -1);
  return s;
}

function list(cfg) {
  let files = [];
  try {
    files = fs.readdirSync(cfg.paths.agents).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const enabled = cfg.agents.enabled || [];
  return files
    .map((f) => {
      const raw = fs.readFileSync(path.join(cfg.paths.agents, f), "utf8");
      const { meta, body } = parseFrontmatter(raw);
      const name = meta.name || f.replace(/\.md$/, "");
      return {
        ...meta,
        name,
        body,
        file: path.join(cfg.paths.agents, f),
        label: meta.label || name.toUpperCase(),
        enabled: enabled.includes(name),
        log: path.join(cfg.paths.data, `${name}.log`),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function get(cfg, name) {
  return list(cfg).find((a) => a.name === name) || null;
}

/* Template variables available to every agent prompt. */
function vars(cfg) {
  const p = cfg.profile || {};
  const ch = p.channels || {};
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD, local time
  const targets = (cfg.primary_cards || [])
    .filter((c) => c.target)
    .map((c) => `${c.label} ${c.money ? "$" : ""}${c.target.toLocaleString("en-US")}`)
    .join(", ");
  return {
    owner: p.owner || "the operator",
    about: p.about || "",
    working_hours: p.working_hours || "no working hours configured",
    youtube: ch.youtube || "",
    instagram: ch.instagram || "",
    tiktok: ch.tiktok || "",
    linkedin: ch.linkedin || "",
    x: ch.x || "",
    community_label: (p.community || {}).label || "the community",
    community_url: (p.community || {}).url || "",
    targets: targets || "no targets configured",
    root: cfg.paths.root,
    data: cfg.paths.data,
    reports: cfg.paths.reports,
    drafts: cfg.paths.drafts,
    today,
    brain_files: (cfg.knowledge.brain_files || []).map(expand).join(", ") || "none configured",
    context_dirs: (cfg.knowledge.context_dirs || []).map(expand).join(", ") || "none configured",
    radar_channels: (cfg.radar.channels || []).join(", ") || "none configured",
    lanes: ((cfg.research || {}).lanes || []).join(", ") || "none configured",
  };
}

function render(body, cfg) {
  const v = vars(cfg);
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in v ? String(v[k]) : ""));
}

/* True when the agent's `requires:` list is satisfied by the config, so an
 * agent that needs a YouTube handle skips cleanly instead of hallucinating. */
function unmetRequirements(agent, cfg) {
  const ch = (cfg.profile || {}).channels || {};
  const checks = {
    youtube: () => Boolean(ch.youtube),
    radar: () => (cfg.radar.channels || []).length > 0,
    brain: () => (cfg.knowledge.brain_files || []).length > 0,
  };
  return (agent.requires || []).filter((r) => checks[r] && !checks[r]());
}

function runShell(cmd, cwd) {
  return new Promise((resolve) => {
    execFile("/bin/bash", ["-lc", cmd], { cwd, timeout: 600000 }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: (stdout || "") + (stderr || "") }),
    );
  });
}

/* Runs one agent end to end: pre-commands, then headless Claude Code with the
 * rendered prompt. Everything is appended to data/<name>.log. */
async function run(cfg, name, { onLog } = {}) {
  const agent = get(cfg, name);
  if (!agent) throw new Error(`unknown agent: ${name}`);

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  fs.mkdirSync(cfg.paths.data, { recursive: true });
  const logStream = fs.createWriteStream(agent.log, { flags: "a" });
  const say = (line) => {
    logStream.write(line.endsWith("\n") ? line : line + "\n");
    if (onLog) onLog(line);
  };

  say(`=== ${agent.name} ${stamp} ===`);

  const missing = unmetRequirements(agent, cfg);
  if (missing.length) {
    say(`skipped: config is missing ${missing.join(", ")}`);
    logStream.end();
    return { skipped: true, missing };
  }

  for (const cmd of agent.pre || []) {
    const { ok, out } = await runShell(cmd, cfg.paths.root);
    say(`$ ${cmd}\n${out.trim().split("\n").slice(-3).join("\n")}`);
    if (!ok) say(`(pre-command failed, continuing)`);
  }

  const args = [
    "-p",
    render(agent.body, cfg),
    "--permission-mode",
    agent.permission_mode || "acceptEdits",
    "--allowedTools",
    agent.tools || cfg.chat.allowed_tools,
    "--output-format",
    "text",
  ];
  const disallowed = agent.disallowed_tools || cfg.chat.disallowed_tools;
  if (disallowed) args.push("--disallowedTools", disallowed);
  if (cfg.chat.model) args.push("--model", cfg.chat.model);

  const code = await new Promise((resolve) => {
    const child = spawn("claude", args, { cwd: cfg.paths.root, env: process.env });
    child.stdout.on("data", (c) => say(c.toString().trimEnd()));
    child.stderr.on("data", (c) => say(c.toString().trimEnd()));
    child.on("error", (e) => { say(`runner error: ${e.message}`); resolve(1); });
    child.on("close", resolve);
  });

  // Agents write reports; the index has to keep up or it goes stale and the
  // next agent greps instead of reading it.
  const { ok: indexed } = await runShell("python3 scripts/index.py", cfg.paths.root);
  if (!indexed) say("(index refresh failed)");

  say(`=== done (exit ${code}) ===`);
  logStream.end();
  return { skipped: false, code };
}

module.exports = { list, get, run, render, vars, parseFrontmatter, unmetRequirements };
