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

/* The house style for anything written into reports/ or drafts/.
 *
 * Defined once here rather than restated in six agent prompts, which is how
 * they drifted apart in the first place (morning-report vs radar vs
 * weekly-review). Filenames sort chronologically; everything a reader or an
 * index needs is in the frontmatter, so nothing has to be parsed out of a
 * filename and files can be renamed without losing meaning.
 */
function docConvention(cfg) {
  return [
    "FILE NAMING AND FRONTMATTER, follow exactly:",
    "Name the file YYYY-MM-DD-<kind>[-<subject>].md - date first so the folder",
    "sorts chronologically, kind second so related files group. Add <subject>",
    "only when one kind can recur within a single day.",
    "<subject> must be READABLE: a few words from the title, lowercased and",
    "hyphenated, about 4 or 5 words, stopwords dropped. Never an opaque id.",
    "A filename should tell someone what the file is about without opening it,",
    "so 'dont-edit-videos-anymore' and never 'cdvi2ooarDc'. Identifiers belong in",
    "the frontmatter, where they are still machine-readable but not in the way:",
    "add video_id, channel, or url as extra frontmatter fields when relevant.",
    "Lowercase, hyphens, no spaces, no underscores.",
    "Begin EVERY file with this frontmatter block:",
    "---",
    "title: <a real sentence a human would recognise, not the filename>",
    `date: ${new Date().toLocaleDateString("sv-SE")}`,
    "kind: <morning|radar|postmortem|scout|study|weekly|note|draft>",
    "agent: <the agent writing it, or 'chat' if a person asked for it>",
    "status: <final for a report, draft for anything awaiting approval>",
    "---",
    "The title is what shows in the documents trail and the folder index, so",
    "write it for someone skimming: 'Subs flat, latest video underpacing' beats",
    "'Morning report'. Then a first line that stands alone as a summary, since",
    "the index shows it as the one-line gist.",
  ].join(" ");
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
    max_directives: String(((cfg.directives || {}).max) || 6),
    doc_convention: docConvention(cfg),
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

  // local time, so log entries line up with the local dates used in filenames
  const now = new Date();
  const stamp = `${now.toLocaleDateString("sv-SE")} ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
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
    // bin/ first so an agent's yt-dlp call gets the copy Jarvis vouches for,
    // not whatever stale one happens to be earlier on the user's PATH
    const env = {
      ...process.env,
      PATH: `${path.join(cfg.paths.root, "bin")}:${process.env.PATH || ""}`,
    };
    const child = spawn("claude", args, { cwd: cfg.paths.root, env });
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

/* Preflight: would each agent actually work here?
 *
 * The failure modes are quiet ones. A mistyped {{placeholder}} renders as an
 * empty string, so the agent runs with a hole in its instructions and nobody
 * finds out until the report is wrong. A pre-command whose binary is missing
 * fails and the run continues anyway. So check both before trusting a schedule.
 */
function check(cfg) {
  const known = new Set(Object.keys(vars(cfg)));
  return list(cfg).map((a) => {
    const problems = [];
    const notes = [];

    // placeholders that will silently render empty
    const used = [...a.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const unknown = [...new Set(used)].filter((v) => !known.has(v));
    if (unknown.length) problems.push(`unknown placeholder: ${unknown.join(", ")}`);

    // pre-commands: does the binary exist?
    for (const cmd of a.pre || []) {
      const bin = String(cmd).trim().split(/\s+/)[0];
      try {
        require("child_process").execFileSync("which", [bin], { stdio: "ignore" });
      } catch {
        problems.push(`pre-command not found: ${bin}`);
      }
    }

    if (!a.schedule) notes.push("no schedule, on demand only");
    if (!a.description) notes.push("no description");

    const unmet = unmetRequirements(a, cfg);
    if (unmet.length) notes.push(`will skip: missing ${unmet.join(", ")}`);

    // an agent that writes learnings needs somewhere to write them
    if (/brain_files/.test(a.body) && !(cfg.knowledge.brain_files || []).length)
      notes.push("no playbook configured, will fall back to writing rules in the report");

    return { name: a.name, enabled: a.enabled, problems, notes };
  });
}

module.exports = { list, get, run, render, vars, parseFrontmatter, unmetRequirements, check };
