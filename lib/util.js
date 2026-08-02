/* Small shared helpers.
 *
 * `has` was copy-pasted into tts.js, stt.js, and brain/claude-code.js, and
 * `writeJsonAtomic` fixes a real hazard: several agents and the HUD all write
 * data/directives.json, and a plain writeFileSync leaves a window where a
 * reader sees a truncated file.
 */
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

/* True when a command is on PATH. */
const has = (cmd) =>
  new Promise((resolve) => execFile("which", [cmd], (err) => resolve(!err)));

/* Write to a temp file in the same directory, then rename. Rename is atomic on
 * the same filesystem, so a concurrent reader gets either the old file or the
 * new one, never a half-written one. */
function writeJsonAtomic(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

module.exports = { has, writeJsonAtomic, readJson };
