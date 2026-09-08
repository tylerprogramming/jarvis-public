/* The experiments ledger, read side.
 *
 * scripts/experiments.py is the writer and the authority on the format; this
 * file reads the same data/decisions.jsonl back for prompts, the HUD, the CLI
 * and doctor. Two kinds matter here, beside the decision rows lib/memory.js
 * writes into the same file:
 *
 *   {date, kind: "experiment", id, text: hypothesis, metric, target, deadline, status: "open", source}
 *   {date, kind: "result", experiment: id, text, verdict: confirmed|refuted|unmeasured, source}
 *
 * The file is append only, so status is derived: the latest result line for
 * an id closes it, and an experiment with no result is open. Keep the rules
 * here in step with experiments() in the script; the verification for this
 * branch runs both against the same file and compares the answers.
 *
 * Nothing here writes. The model records an experiment by running the
 * script, which refuses past the cap; the HUD only looks.
 */
const fs = require("fs");
const path = require("path");

const VERDICTS = ["confirmed", "refuted", "unmeasured"];

const file = (cfg) => path.join(cfg.paths.data, "decisions.jsonl");

function settings(cfg) {
  const e = (cfg && cfg.experiments) || {};
  const n = Number(e.max_open);
  return { maxOpen: n > 0 ? Math.floor(n) : 2 };
}

/* Local calendar day as YYYY-MM-DD, the same way lib/memory.js dates things,
 * so a deadline compares against the operator's day, not UTC's. */
const dayString = (d) => (d instanceof Date ? d : new Date(d)).toLocaleDateString("sv-SE");

function daysBetween(fromDay, toDay) {
  const a = new Date(fromDay + "T00:00:00");
  const b = new Date(toDay + "T00:00:00");
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function rows(cfg) {
  let raw = "";
  try { raw = fs.readFileSync(file(cfg), "utf8"); } catch { return []; }
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r === "object") out.push(r);
    } catch { /* one bad line is skipped, same as the recap */ }
  }
  return out;
}

/* Every experiment with its derived status, in the order added. `now` is a
 * Date or a YYYY-MM-DD string, defaulting to today, so the HUD and doctor
 * agree with `experiments.py due --today`. */
function read(cfg, now) {
  const today = typeof now === "string" ? now.slice(0, 10) : dayString(now || new Date());
  const byId = new Map();
  for (const r of rows(cfg)) {
    if (r.kind === "experiment" && r.id) {
      byId.set(String(r.id), {
        id: String(r.id),
        date: r.date || "",
        hypothesis: String(r.text || ""),
        metric: String(r.metric || ""),
        target: String(r.target || ""),
        deadline: String(r.deadline || ""),
        source: String(r.source || ""),
        status: "open",
        verdict: null,
        result: null,
        closed: null,
      });
    }
  }
  for (const r of rows(cfg)) {
    if (r.kind !== "result" || !byId.has(String(r.experiment))) continue;
    const e = byId.get(String(r.experiment));
    e.status = "closed";
    e.verdict = VERDICTS.includes(r.verdict) ? r.verdict : "unmeasured";
    e.result = String(r.text || "");
    e.closed = r.date || "";
  }
  const out = [];
  for (const e of byId.values()) {
    e.days_left = e.deadline ? daysBetween(today, e.deadline) : null;
    e.overdue = e.status === "open" && e.days_left !== null && e.days_left < 0;
    out.push(e);
  }
  return out;
}

const open = (cfg, now) => read(cfg, now).filter((e) => e.status === "open");
const due = (cfg, now) => open(cfg, now).filter((e) => e.overdue);
const closed = (cfg, now) => read(cfg, now).filter((e) => e.status === "closed");

function daysWord(e) {
  if (e.days_left === null) return "no deadline";
  if (e.status === "closed") return `closed ${e.closed || ""}`.trim();
  if (e.days_left < 0) return `OVERDUE by ${-e.days_left} day${e.days_left === -1 ? "" : "s"}`;
  if (e.days_left === 0) return "due today";
  return `${e.days_left} day${e.days_left === 1 ? "" : "s"} left`;
}

/* One experiment as a prompt line: everything the model needs to close it,
 * including the id it must pass to the script. */
function line(e) {
  const tail = e.status === "closed"
    ? `${e.verdict}: ${e.result}`
    : `deadline ${e.deadline || "none"}, ${daysWord(e)}`;
  return `- ${e.id}: ${e.hypothesis} (metric: ${e.metric}; target: ${e.target}; ${tail})`;
}

/* Prompt text for {{experiments_open}}: "none open" rather than an empty
 * string so a sentence that ends in the placeholder does not trail off. */
function openText(cfg, now) {
  const list = open(cfg, now);
  return list.length ? list.map(line).join("\n") : "none open";
}

function dueText(cfg, now) {
  const list = due(cfg, now);
  return list.length ? list.map(line).join("\n") : "none overdue";
}

/* A short summary for doctor and the CLI: counts plus the open list. */
function summary(cfg, now) {
  const all = read(cfg, now);
  const o = all.filter((e) => e.status === "open");
  const d = o.filter((e) => e.overdue);
  const c = all.filter((e) => e.status === "closed");
  const { maxOpen } = settings(cfg);
  const head = `${o.length} open (cap ${maxOpen}), ${d.length} overdue, ${c.length} closed`;
  return { open: o.length, overdue: d.length, closed: c.length, maxOpen, head, text: `${head}\n${openText(cfg, now)}` };
}

module.exports = { VERDICTS, file, settings, read, open, due, closed, line, daysWord, openText, dueText, summary };
