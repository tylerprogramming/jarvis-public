/* What Jarvis has worked out about the operator, as structured data.
 *
 * Why this exists
 * ---------------
 * The post-mortem and study agents already write confirmed rules back into a
 * playbook file. That loop is the whole argument for this project - a
 * dashboard shows you numbers, this thing draws conclusions and keeps them -
 * and until now it was completely invisible. It lived in a markdown file the
 * operator had to remember to open, and if they never configured one, every
 * rule an agent learned was written into a report and then buried by the next
 * day's report.
 *
 * The format, which the agents already produce
 * --------------------------------------------
 *     ## Titles [confirmed 2026-08-02]
 *     - Concrete OUTCOME or curiosity gap, never a description.
 *     - Insider names pull like numbers [2026-08-05]: "Karpathy Just Fixed..."
 *
 * A section carries a status and a date; individual bullets may carry their own
 * later date. A rule confirmed on its own line is more current than the section
 * heading above it, so the bullet's date wins when it has one.
 *
 * Nothing here writes. Agents own the file; this only reads it, so a
 * hand-edited playbook is never clobbered by the HUD.
 */
const fs = require("fs");
const path = require("path");

const DATE = "\\d{4}-\\d{2}-\\d{2}";
const HEADING = new RegExp(`^#{2,3}\\s+(.+?)\\s*(?:\\[(confirmed|new|updated)\\s+(${DATE})\\])?\\s*$`);
const INLINE = new RegExp(`\\[(?:confirmed\\s+|updated\\s+)?(${DATE})\\]`);

/* One file to a list of {section, status, date, text}. */
function parse(text, source = "") {
  const out = [];
  let section = "", status = "", date = "";

  for (const raw of String(text || "").split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(HEADING);
    if (h && !line.startsWith("- ")) {
      section = h[1].replace(/\s*\[[^\]]*\]\s*$/, "").trim();
      status = h[2] || "";
      date = h[3] || "";
      continue;
    }
    // Only top-level bullets. Nested ones are evidence for the rule above,
    // not rules in their own right, and listing them reads as noise.
    const b = line.match(/^-\s+(.+)$/);
    if (!b || !section) continue;

    let body = b[1].trim();
    if (!body || body.length < 12) continue;      // headers, stubs, "- TODO"
    const own = body.match(INLINE);
    out.push({
      section,
      status: own ? "confirmed" : status,
      date: own ? own[1] : date,
      text: body,
      source,
    });
  }
  return out;
}

/* Every configured playbook, newest rule first.
 *
 * Undated rules sort last rather than being dropped: a rule with no stamp is
 * still something the operator wrote down, and silently hiding it would make
 * the panel lie about what is in the file. */
function read(cfg, { limit = 0 } = {}) {
  const files = playbookFiles(cfg);
  const rules = [];
  for (const f of files) {
    let text = "";
    try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
    rules.push(...parse(text, f));
  }
  rules.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return limit ? rules.slice(0, limit) : rules;
}

/* The files agents read and write.
 *
 * Falls back to playbook.md beside the repo when nothing is configured, which
 * is the common case. Before this, an operator who never set knowledge.brain_files
 * had every learned rule written into a report and lost the next day. */
function playbookFiles(cfg) {
  const configured = ((cfg.knowledge || {}).brain_files || [])
    .map((p) => String(p).replace(/^~(?=$|\/)/, process.env.HOME || "~"))
    .filter(Boolean);
  return configured.length ? configured : [defaultFile(cfg)];
}

function defaultFile(cfg) {
  return path.join((cfg.paths && cfg.paths.root) || path.join(__dirname, ".."), "playbook.md");
}

/* Counts for the panel header: how many rules, and when anything last moved. */
function summary(cfg) {
  const rules = read(cfg);
  const dates = rules.map((r) => r.date).filter(Boolean).sort();
  return {
    count: rules.length,
    newest: dates[dates.length - 1] || "",
    sections: [...new Set(rules.map((r) => r.section))].length,
  };
}

module.exports = { parse, read, summary, playbookFiles, defaultFile };
