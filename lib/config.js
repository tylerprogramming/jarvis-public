/* Config loading: config.default.json <- config.json <- environment.
 * The default file ships with the repo; config.json is the user's and is
 * gitignored, so pulling updates never clobbers a personal setup.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const HOME = os.homedir();

const expand = (p) =>
  typeof p === "string" && p.startsWith("~") ? path.join(HOME, p.slice(1)) : p;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

/* Deep merge: objects merge key by key, arrays and scalars replace wholesale.
 * Arrays replacing (not concatenating) is deliberate - a user who sets
 * radar.channels should get exactly their list, not theirs plus ours. */
function merge(base, over) {
  if (!isPlainObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

/* Minimal .env reader so we have zero npm dependencies. */
function loadEnvFile(file) {
  const out = {};
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

function load() {
  const defaults = readJson(path.join(ROOT, "config.default.json"), {});
  const user = readJson(path.join(ROOT, "config.json"), {});
  const cfg = merge(defaults, user);

  // .env values fill in only where the process environment is silent, so a
  // real env var always wins over the file.
  const fileEnv = loadEnvFile(path.join(ROOT, ".env"));
  for (const [k, v] of Object.entries(fileEnv)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }

  // Environment overrides for the handful of things people script against.
  if (process.env.JARVIS_PORT) cfg.server.port = Number(process.env.JARVIS_PORT);
  if (process.env.JARVIS_HOST) cfg.server.host = process.env.JARVIS_HOST;
  if (process.env.JARVIS_TOKEN) cfg.server.token = process.env.JARVIS_TOKEN;

  // Derived from where the repo actually is, never from a "~/jarvis" string.
  // People clone this anywhere; a hardcoded home path sends the documents trail
  // and the indexer looking at a folder that does not exist on their machine.
  cfg.paths = {
    root: ROOT,
    home: HOME,
    data: path.join(ROOT, "data"),
    reports: path.join(ROOT, "reports"),
    drafts: path.join(ROOT, "drafts"),
    journal: expand((cfg.journal || {}).dir) || path.join(ROOT, "journal"),
    agents: path.join(ROOT, cfg.agents.dir || "agents"),
    plugins: path.join(ROOT, "plugins"),
  };

  cfg.configured = Boolean(user && Object.keys(user).length);
  return cfg;
}

/* Write a patch into config.json, leaving everything else alone.
 *
 * Touches the USER file only, never the shipped defaults, so a later update to
 * config.default.json still flows through. Arrays replace wholesale, same rule
 * as load(), so setting a list means exactly that list. */
function save(patch) {
  const file = path.join(ROOT, "config.json");
  const next = merge(readJson(file, {}), patch);
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  return next;
}

module.exports = { load, merge, readJson, expand, save, ROOT, HOME };
