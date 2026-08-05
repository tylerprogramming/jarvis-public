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
    social_actors: Object.entries(((cfg.social || {}).actors) || {})
      .map(([k, v]) => `${k}: ${v}`).join("\n    ") || "(none pinned)",
    post_window_days: String((cfg.social || {}).post_window_days ?? 30),
    max_posts: String((cfg.social || {}).max_posts_per_platform ?? 25),
    max_directives: String(((cfg.directives || {}).max) || 6),
    doc_convention: docConvention(cfg),
    journal_dir: cfg.paths.journal,
    journal_day: journalDay(),
    journal_delivery: journalDelivery(cfg),
  };
}

/* Which day the nightly agent is closing out - not necessarily today.
 *
 * An evening agent that slips past midnight would otherwise review a day that
 * is minutes old, find nothing in it, and report that the whole system has
 * died. That is not hypothetical: the first unattended run fired at 00:01,
 * because launchd was holding a stale timezone, and wrote exactly that.
 *
 * Anything before 04:00 is treated as still finishing yesterday. Past that you
 * really are in a new day and the entry should say so, even if it is thin.
 */
function journalDay(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("sv-SE");
}

/* What the nightly agent should do with the entry once it is written.
 *
 * Spelled out here rather than left to the agent, because "send the recap"
 * is the one instruction in this whole system that touches the outside world.
 * An agent improvising a delivery method is an agent mailing something you did
 * not agree to, so the prompt gets an exact instruction and the default is to
 * do nothing at all.
 */
function journalDelivery(cfg) {
  const j = cfg.journal || {};
  const to = (j.to || "").trim();
  const how = (j.deliver || "none").trim();

  if (how === "none" || !how)
    return [
      "DELIVERY: none. Write the file and stop. Do not email anything, do not",
      "create a draft, do not post it anywhere. The entry shows up in the",
      "documents trail on the HUD, which is where the operator will read it.",
    ].join(" ");

  if (!to)
    return [
      `DELIVERY: misconfigured. journal.deliver is "${how}" but journal.to is`,
      "empty, so there is no recipient. Write the file, then say plainly in",
      "your final line that delivery was skipped because no address is set.",
      "Do not guess an address.",
    ].join(" ");

  if (how === "gmail")
    return [
      `DELIVERY: create a Gmail DRAFT to ${to} with the entry as the body and`,
      "the entry's title as the subject. A draft, not a send - the Gmail",
      "connector cannot send, and that is the right default anyway. If the",
      "Gmail tools are not available to you, do not substitute another method:",
      "say in your final line that the draft was skipped and why.",
    ].join(" ");

  if (how === "resend")
    return [
      `DELIVERY: send it. Run: python3 scripts/mail.py --to ${to}`,
      `--subject "<the entry's title>" --file <the file you just wrote>`,
      "That actually sends, so run it exactly once and only after the file is",
      "written and correct. The script exits non-zero with a reason if it",
      "fails; report that reason rather than claiming it went out.",
    ].join(" ");

  return [
    `DELIVERY: unknown method "${how}". Valid values are none, gmail, resend.`,
    "Write the file and report the bad setting. Do not improvise a delivery.",
  ].join(" ");
}

/* MCP servers an agent asked for, narrowed to the ones the operator enabled.
 *
 * Agents used to name a server token outright (mcp__claude_ai_Apify), which
 * only worked for people whose server happened to be named the same as the
 * author's. An agent declares what it needs - `mcp: [gmail]` - and the actual
 * token is resolved from whatever that person called it. Still least
 * privilege: an agent gets only the kinds it declared, never every enabled
 * server, so turning on Gmail for the nightly recap does not hand the morning
 * agent the ability to email people.
 */
async function mcpTokensFor(agent, cfg) {
  const want = (Array.isArray(agent.mcp) ? agent.mcp : [])
    .map((s) => String(s).toLowerCase()).filter(Boolean);
  if (!want.length) return [];
  try {
    const tokens = await require("./mcp").allowTokens(cfg);
    return tokens.filter((t) => want.some((w) => t.toLowerCase().includes(w)));
  } catch {
    return [];
  }
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
    // At least one non-YouTube handle to look up. Without this the agent runs,
    // finds nothing to do, and spends a scraper call saying so.
    social: () => Boolean(ch.instagram || ch.tiktok || ch.x || ch.linkedin),
    // Reads config rather than the network on purpose. unmetRequirements runs
    // on every `jarvis agents` listing, and a live MCP health check costs
    // seconds. This answers "did the operator enable it", which is the gate
    // that actually stops the agent. Reachability is the agent's own problem.
    apify: () => {
      const v = (cfg.chat || {}).mcp_servers || [];
      return v === "all" || (Array.isArray(v) && v.some((n) => /apify/i.test(String(n))));
    },
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

  // MCP tokens are appended rather than written into the frontmatter, so the
  // agent file stays portable across people who named their servers differently.
  const mcpTokens = await mcpTokensFor(agent, cfg);
  if ((agent.mcp || []).length)
    say(mcpTokens.length
      ? `mcp: ${mcpTokens.join(", ")}`
      : `mcp: none of [${agent.mcp.join(", ")}] are enabled, continuing without them`);

  const args = [
    "-p",
    render(agent.body, cfg),
    "--permission-mode",
    agent.permission_mode || "acceptEdits",
    "--allowedTools",
    [agent.tools || cfg.chat.allowed_tools, ...mcpTokens].join(" ").trim(),
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
    // stdin closed on purpose. A scheduled agent has nobody typing at it, so
    // leaving the pipe open only earns a "no stdin data received in 3s"
    // warning in every log, every run. Measured: the wait overlaps startup
    // rather than adding to it, so this buys a clean log, not speed.
    const child = spawn("claude", args, {
      cwd: cfg.paths.root, env, stdio: ["ignore", "pipe", "pipe"],
    });
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

    // an agent that asked for an MCP server nobody turned on. Not a problem:
    // it runs and skips that step. But it should be visible here rather than
    // discovered as a missing email three days later.
    const wantMcp = Array.isArray(a.mcp) ? a.mcp : [];
    if (wantMcp.length) {
      const enabled = require("./mcp").enabledNames(cfg);
      const missing = enabled === "all" ? [] : wantMcp.filter(
        (w) => !enabled.some((n) => String(n).toLowerCase().includes(String(w).toLowerCase())),
      );
      if (missing.length)
        notes.push(`mcp not enabled: ${missing.join(", ")} (jarvis mcp allow <name>)`);
    }

    // delivery is the one step that leaves the machine, so a half-set config
    // is worth saying out loud before it silently delivers nothing
    if (/journal_delivery/.test(a.body)) {
      const j = cfg.journal || {};
      const how = (j.deliver || "none").trim();
      if (how !== "none" && !(j.to || "").trim())
        problems.push(`journal.deliver is "${how}" but journal.to is empty`);
      else if (!["none", "gmail", "resend"].includes(how))
        problems.push(`journal.deliver "${how}" is not one of none, gmail, resend`);
      else if (how === "resend" && !process.env.RESEND_API_KEY)
        notes.push("journal delivery is resend but RESEND_API_KEY is not set");
      else if (how !== "none") notes.push(`journal delivery: ${how} to ${j.to}`);
    }

    return { name: a.name, enabled: a.enabled, problems, notes };
  });
}

module.exports = {
  list, get, run, render, vars, parseFrontmatter, unmetRequirements, check, mcpTokensFor,
};
