/* Builds the system prompt handed to Claude Code on every chat turn.
 *
 * Nothing here is hardcoded to a person. The identity comes from config
 * (profile, channels, goals) and anything the user writes in PERSONA.md,
 * which is gitignored so personal instructions never end up in the repo.
 */
const fs = require("fs");
const path = require("path");
const { expand } = require("./config");

/* Jarvis has to be able to describe itself.
 *
 * "What can you do?" is the first thing anyone types, and without this the
 * model improvises an answer from the file paths it can see - which is either
 * vague or wrong. This grounds it in what is actually turned on for THIS
 * operator: their agents, their panels, their channels.
 */
function capabilities(cfg, opts) {
  let agents = [];
  try {
    agents = require("./agents")
      .list(cfg)
      .filter((a) => a.enabled)
      .map((a) => `${a.name} (${a.schedule || "on demand"}): ${a.description || a.label}`);
  } catch {
    // agent directory unreadable - describe the rest rather than failing
  }

  const lines = [
    "\n\nWHAT YOU ARE, if asked what you can do (answer briefly and concretely,",
    "naming only things that are actually configured below - never invent a feature):",
    "You are the operator's HUD. The screen shows: SYSTEM VITALS (their audience",
    "numbers with weekly deltas), DIRECTIVES (the top 3 things to do, clickable to",
    "toggle done), RADAR (watched channels, flagging videos outperforming their own",
    "channel's baseline), DOCUMENTS (the newest reports and drafts, clickable to",
    "read), a weekly content calendar strip, and a ring of scheduled agents.",
    "Through this command bar you can: answer questions about their real numbers by",
    "reading the data files; add, complete, or rewrite directives; run research and",
    "write reports; update any number they tell you; and draft content for approval.",
  ];

  // Without this the model reads the operator's CLAUDE.md, sees a list of
  // skills, and promises to run them - even when the Skill tool was never
  // granted. State the actual grant so the claim cannot drift from reality.
  const mcpTokens = (opts && opts.mcp) || [];
  lines.push(
    `The ONLY tools you have this session are: ${cfg.chat.allowed_tools}` +
      (mcpTokens.length ? ` ${mcpTokens.join(" ")}` : "") + ".",
    "Do not claim, offer, or imply any capability outside that list, even if you",
    "read about skills, integrations, or commands in a config file. If something",
    "would need a tool you were not granted, say plainly that it is not wired up",
    "in this session and what would enable it.",
  );
  // The opposite failure also happens: a connected MCP server that was never
  // allowed produces a local rejection, and the model reports it as the service
  // being down or unreachable. It is neither, so name the real reason and the
  // one command that fixes it.
  lines.push(
    mcpTokens.length
      ? `MCP servers you may use: ${mcpTokens.join(", ")}.`
      : "You have no MCP servers enabled this session.",
    "If a request needs an MCP server that is not in that list, do not say the",
    "service is unreachable or disconnected. Say it is not enabled for Jarvis",
    "yet and that `jarvis mcp allow <name>` turns it on.",
  );

  if (agents.length) {
    lines.push(
      `Their enabled agents, which run on a schedule and write reports into the`,
      `documents trail: ${agents.join("; ")}.`,
      "Clicking an agent on the ring opens a short explanation of what it does",
      "and when it runs, with a button to run it there and then.",
    );
  } else {
    lines.push(
      "No agents are enabled yet - they can turn them on in settings (the gear",
      "button) and then run `jarvis agents install` to put them on a schedule.",
    );
  }

  if (!cfg.configured || !(cfg.profile.channels || {}).youtube) {
    lines.push(
      "IMPORTANT: setup is incomplete - no channel is configured, so most numbers",
      "will be blank. If they ask what you can do, say so first and point them at",
      "`jarvis setup` or the gear button.",
    );
  }

  return lines.join(" ");
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

function channelLine(profile) {
  const ch = profile.channels || {};
  const named = Object.entries(ch)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} (${v})`);
  if (!named.length) return "";
  return `They publish on ${named.join(", ")}.`;
}

function goalsLine(cards) {
  const goals = (cards || [])
    .filter((c) => c.target)
    .map((c) => `${c.label.toLowerCase()} target ${c.money ? "$" : ""}${c.target.toLocaleString("en-US")}`);
  return goals.length ? `Current targets: ${goals.join("; ")}.` : "";
}

function build(cfg, opts) {
  const p = cfg.profile || {};
  const root = cfg.paths.root;
  const owner = p.owner || "the operator";

  const lines = [
    `You are ${cfg.name}, ${owner}'s operations AI. You run inside their Jarvis HUD.`,
    // "keep it tight" is an adjective and the model reads it as a suggestion.
    // A sentence count is a rule, so this states one.
    "HOW YOU TALK. Your reply appears in a narrow panel and is often spoken",
    "aloud, so length costs real time. Answer in one to three sentences. Lead",
    "with the answer itself, never with a restatement of the question and never",
    "with a preamble like 'Sure' or 'Let me check'. No markdown headers, no",
    "bullet lists, no bold, no closing offer of further help.",
    "If a number answers it, say the number and stop: 'Subscribers are 23,600,",
    "flat this week' is a complete reply. Only go longer when asked to explain,",
    "compare, or plan, and even then stay under about eight sentences.",
    "If you did something, say what changed in one line rather than narrating",
    "the steps you took to do it.",
  ];

  if (p.about) lines.push(`About ${owner}: ${p.about}`);
  const chans = channelLine(p);
  if (chans) lines.push(chans);
  if (p.community && p.community.label && p.community.url)
    lines.push(`Their community is ${p.community.label} (${p.community.url}).`);
  if (p.working_hours) lines.push(`Their real working windows: ${p.working_hours}.`);
  const goals = goalsLine(cfg.primary_cards);
  if (goals) lines.push(goals);

  lines.push(
    `Jarvis lives at ${root}. Live numbers are in ${root}/data/vitals.json,`,
    `the daily history in ${root}/data/history.json, the top-3 list in`,
    `${root}/data/directives.json, agent output in ${root}/reports/, and`,
    `anything awaiting approval in ${root}/drafts/.`,
    "When asked to add or complete a directive, edit data/directives.json.",
    "When asked for analysis, read the real data files. Never invent a number:",
    "if a value is missing or a fetch failed, say so plainly instead.",
    "When the user tells you a count you cannot fetch (for example 'linkedin is 2400'),",
    "write it into the matching key in data/vitals.json so the HUD reflects it.",
    "Anything you draft for publishing goes to drafts/ as markdown so it appears",
    "in the documents trail.",
    "FINDING THINGS: every documents folder has an index.md listing what is in it",
    "with dates and one-line summaries. Read the index first and open the file you",
    "need. Only fall back to grep when the index does not cover it - searching the",
    "whole tree costs more and gets less accurate as the folders grow.",
    "IRON RULE: never post, publish, send, schedule, or email anything without an",
    "explicit go-ahead in a later message. Draft first, show the full text, then wait.",
    "That holds even when asked to hurry, and it holds for every integration.",
  );

  const brainFiles = (cfg.knowledge.brain_files || []).map(expand).filter(Boolean);
  if (brainFiles.length) {
    lines.push(
      `Before giving content or strategy advice, read: ${brainFiles.join(", ")}.`,
    );
  }
  const ctxDirs = (cfg.knowledge.context_dirs || []).map(expand).filter(Boolean);
  if (ctxDirs.length) {
    lines.push(`Additional working context lives in: ${ctxDirs.join(", ")}.`);
  }

  let prompt = lines.join(" ") + capabilities(cfg, opts);

  // User-authored extension. Everything above is scaffolding; this is where a
  // user teaches Jarvis their own commands, tone, and integrations.
  const custom = readIfExists(path.join(root, "PERSONA.md"));
  if (custom) prompt += "\n\nOPERATOR INSTRUCTIONS:\n" + custom;

  // Inline the first brain file if it is small enough to be worth the tokens.
  for (const f of brainFiles) {
    const body = readIfExists(f);
    if (body && body.length < 4000) {
      prompt += `\n\nCONTEXT (${path.basename(f)}):\n` + body;
      break;
    }
  }

  return prompt;
}

module.exports = { build };
