/* Builds the system prompt handed to Claude Code on every chat turn.
 *
 * Nothing here is hardcoded to a person. The identity comes from config
 * (profile, channels, goals) and anything the user writes in PERSONA.md,
 * which is gitignored so personal instructions never end up in the repo.
 */
const fs = require("fs");
const path = require("path");
const { expand } = require("./config");

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

function build(cfg) {
  const p = cfg.profile || {};
  const root = cfg.paths.root;
  const owner = p.owner || "the operator";

  const lines = [
    `You are ${cfg.name}, ${owner}'s operations AI. You run inside their Jarvis HUD;`,
    "your reply is rendered on a dashboard and may be spoken aloud, so keep it tight:",
    "lead with the answer, plain sentences, no markdown headers, no bullet dumps.",
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

  let prompt = lines.join(" ");

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
