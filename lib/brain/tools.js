/* The tool surface given to non-Claude-Code brains.
 *
 * Claude Code brings its own tools. A raw chat API does not — without these it
 * can only talk, not read the vitals file or edit a directive. These are the
 * minimum set that makes Jarvis useful on an OpenAI-compatible model.
 *
 * Every path is resolved and checked against an allowlist of roots before any
 * read or write. The model picks the path; it does not get to pick the root.
 */
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { expand } = require("../config");

function allowedRoots(cfg) {
  return [
    cfg.paths.root,
    expand(cfg.chat.cwd),
    ...(cfg.documents_dirs || []).map(expand),
    ...((cfg.knowledge || {}).context_dirs || []).map(expand),
    ...((cfg.knowledge || {}).brain_files || []).map((f) => path.dirname(expand(f))),
  ].filter(Boolean);
}

/* Resolves a model-supplied path and refuses anything outside the allowlist.
 * Checks the resolved parent for writes, since the file may not exist yet. */
/* A second gate, inside the allowlist.
 *
 * chat.cwd defaults to the home directory, which is the right working scope for
 * an agent but also contains credentials the model has no reason to open. That
 * matters more here than it does for Claude Code: whatever a tool reads gets
 * sent to whichever API is serving the brain. These patterns are refused even
 * when the path is otherwise allowed. Override with brain.denied_patterns.
 */
const DEFAULT_DENIED = [
  "\\.ssh/", "\\.aws/", "\\.gnupg/", "\\.kube/", "\\.docker/config",
  "\\.netrc", "\\.npmrc", "\\.pypirc", "\\.git-credentials",
  "(^|/)\\.env($|\\.)", "credentials\\.json", "\\.pem$", "\\.key$", "\\.p12$",
  "id_rsa", "id_ed25519", "Keychains/", "\\.password-store/",
];

function denied(cfg, resolved) {
  const patterns = (cfg.brain && cfg.brain.denied_patterns) || DEFAULT_DENIED;
  return patterns.some((p) => new RegExp(p, "i").test(resolved));
}

function withinAllowed(cfg, resolved, forWrite) {
  const check = forWrite ? path.dirname(resolved) : resolved;
  let real;
  try {
    real = fs.realpathSync(check);
  } catch {
    if (!forWrite) return false;
    real = check; // parent does not exist yet; still prefix-test it
  }
  return allowedRoots(cfg).some((root) => {
    let realRoot;
    try { realRoot = fs.realpathSync(root); } catch { return false; }
    return real === realRoot || real.startsWith(realRoot + path.sep);
  });
}

function safePath(cfg, p, { forWrite = false } = {}) {
  if (!p || typeof p !== "string") throw new Error("path required");

  // An absolute path means exactly itself. A relative one is ambiguous: the
  // model may mean the working directory or the Jarvis root ("data/vitals.json"
  // is the natural thing to type), so try both rather than failing on the guess.
  const candidates =
    path.isAbsolute(p) || p.startsWith("~")
      ? [expand(p)]
      : [path.join(expand(cfg.chat.cwd), p), path.join(cfg.paths.root, p)];

  let outside = false;
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (denied(cfg, resolved))
      throw new Error(`refused: ${p} matches a protected pattern (brain.denied_patterns)`);
    if (!withinAllowed(cfg, resolved, forWrite)) {
      if (fs.existsSync(resolved) || forWrite) outside = true;
      continue;
    }
    if (forWrite || fs.existsSync(resolved)) return resolved;
  }

  if (outside) throw new Error(`path is outside the allowed directories: ${p}`);
  throw new Error(`no such file: ${p}`);
}

/* Shell access is opt-in and prefix-matched. Without an allowlist entry the
 * tool refuses rather than running. */
function commandAllowed(cfg, command) {
  const allow = (cfg.brain && cfg.brain.allowed_commands) || [];
  const bin = String(command).trim().split(/\s+/)[0];
  return allow.some((a) => a === bin || bin.endsWith("/" + a));
}

const DEFINITIONS = [
  {
    name: "read_file",
    description: "Read a UTF-8 text file. Use this before answering anything about the operator's numbers, reports, or notes.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "File path, absolute or relative to the working directory." } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write a UTF-8 text file, creating parent directories as needed. Overwrites existing content.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_dir",
    description: "List the entries in a directory.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: "Search for a string in files under a directory. Returns matching lines with their file and line number.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        path: { type: "string", description: "Directory to search. Defaults to the Jarvis root." },
      },
      required: ["query"],
    },
  },
  {
    name: "run_command",
    description: "Run an allowlisted shell command and return its output. Only commands the operator has permitted will run.",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
];

const MAX_OUTPUT = 60000;
const clip = (s) =>
  s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + `\n[truncated at ${MAX_OUTPUT} characters]` : s;

const HANDLERS = {
  read_file(cfg, args) {
    return clip(fs.readFileSync(safePath(cfg, args.path), "utf8"));
  },

  write_file(cfg, args) {
    const file = safePath(cfg, args.path, { forWrite: true });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, String(args.content ?? ""));
    return `wrote ${file}`;
  },

  list_dir(cfg, args) {
    const dir = safePath(cfg, args.path || ".");
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
      .join("\n") || "(empty)";
  },

  search_files(cfg, args) {
    const root = safePath(cfg, args.path || cfg.paths.root);
    const needle = String(args.query || "");
    if (!needle) return "empty query";
    const hits = [];
    const walk = (dir, depth) => {
      if (depth > 4 || hits.length > 200) return;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full, depth + 1); continue; }
        if (!/\.(md|txt|json|js|py|sh|csv|ya?ml)$/i.test(e.name)) continue;
        let body;
        try { body = fs.readFileSync(full, "utf8"); } catch { continue; }
        body.split("\n").forEach((line, i) => {
          if (hits.length <= 200 && line.includes(needle))
            hits.push(`${full}:${i + 1}: ${line.trim().slice(0, 200)}`);
        });
      }
    };
    walk(root, 0);
    return hits.length ? clip(hits.join("\n")) : "no matches";
  },

  run_command(cfg, args) {
    const command = String(args.command || "");
    if (!commandAllowed(cfg, command))
      return `refused: "${command.split(/\s+/)[0]}" is not in brain.allowed_commands`;
    return new Promise((resolve) => {
      execFile("/bin/bash", ["-lc", command], {
        cwd: expand(cfg.chat.cwd),
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
      }, (err, stdout, stderr) =>
        resolve(clip(((stdout || "") + (stderr || "")).trim() || (err ? String(err) : "(no output)"))));
    });
  },
};

async function call(cfg, name, args) {
  const fn = HANDLERS[name];
  if (!fn) return `unknown tool: ${name}`;
  try {
    return await fn(cfg, args || {});
  } catch (e) {
    return `error: ${e.message}`;
  }
}

/* OpenAI chat-completions tool schema. */
const openaiSchema = () => DEFINITIONS.map((d) => ({ type: "function", function: d }));

module.exports = { DEFINITIONS, call, openaiSchema, safePath };
