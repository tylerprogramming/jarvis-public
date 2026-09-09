/* `jarvis brain` - the walk from "chat does not answer" to "chat answers".
 *
 * doctor covers the whole machine in one screen. This covers the one subsystem
 * people actually get stuck on, and attaches the fix to each way it fails.
 *
 * Every claim here is bought with a real turn. On this repo's own machine
 * `claude auth status` reported loggedIn: true for days while every single
 * inference call came back "OAuth session expired and could not be refreshed",
 * because the CLI reads the macOS keychain and the keychain copy of the
 * credentials had been blanked. A status line, a version, and a `which` are all
 * things that stay true through a login that no longer works, a usage cap, and
 * a model the plan does not include. So: ask it something and see.
 *
 * Nothing in here widens chat.allowed_tools or brain.allowed_commands. A brain
 * that cannot answer is fixed by signing in, switching model, or pointing at
 * another endpoint, never by handing it more of the machine.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { execFileSync } = require("child_process");

const brain = require("./index");
const cfgLib = require("../config");
const { has } = require("../util");

/* The models worth trying when the current one is capped. Sonnet is the daily
 * driver, haiku is usually still available when sonnet is not, opus is last
 * because it burns quota fastest. */
const MODELS = ["sonnet", "haiku", "opus"];
const PROBE_MS = 60000;       // one turn through the real brain
const MODEL_PROBE_MS = 45000; // three of them in a row, so a little tighter
const DEFAULT_LOCAL = "http://localhost:11434/v1"; // Ollama's default

const pad = (s) => String(s).padEnd(18);
const line = (label, value) => console.log(`    ${pad(label)} ${value}`);
const cont = (value) => console.log(`    ${pad("")} ${value}`);
const yn = (b) => (b ? "yes" : "no");

/* ---- prompting -----------------------------------------------------------
 * Same line-queue shape as scripts/setup.js, and for the same reason:
 * rl.question() drops lines that arrive while nothing is waiting, so a piped
 * or scripted run loses its answers and then throws on a closed interface.
 * Built lazily, because creating an interface on stdin holds the process open
 * and most runs of this command never ask anything. */
let rl = null;
const buffered = [];
const waiting = [];
let closed = false;

function prompts() {
  if (rl) return;
  rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (l) => {
    const next = waiting.shift();
    if (next) next(l);
    else buffered.push(l);
  });
  rl.on("close", () => {
    closed = true;
    waiting.splice(0).forEach((fn) => fn(null));
  });
}

function closePrompts() {
  if (rl) rl.close();
  rl = null;
}

const ask = (q, def = "") =>
  new Promise((resolve) => {
    prompts();
    process.stdout.write(def ? `${q} [${def}]: ` : `${q}: `);
    const take = (l) => {
      if (l === null) process.stdout.write("\n");
      resolve(l === null ? def : String(l).trim() || def);
    };
    if (buffered.length) return take(buffered.shift());
    if (closed) return take(null);
    waiting.push(take);
  });

const askYes = async (q, def = false) => /^y/i.test(await ask(`${q} (y/n)`, def ? "y" : "n"));

/* ---- credentials ---------------------------------------------------------
 * macOS only on purpose. `Claude Code-credentials` is a login keychain item;
 * there is no equivalent to check on Linux or Windows, where the CLI keeps its
 * tokens in the file this compares against. Everywhere else this returns null
 * and the caller says nothing at all. */
function keychainOauth() {
  if (process.platform !== "darwin") return null;
  let raw;
  try {
    raw = execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
  } catch {
    return { present: false }; // no entry at all, which is normal for an API-key login
  }
  try {
    const j = JSON.parse(raw);
    return { present: true, oauth: j.claudeAiOauth || null };
  } catch {
    return { present: true, oauth: null, unreadable: true };
  }
}

function fileOauth() {
  const file = path.join(os.homedir(), ".claude", ".credentials.json");
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return { file, present: true, oauth: j.claudeAiOauth || null };
  } catch {
    return { file, present: false };
  }
}

const tokenLen = (o) => String((o && o.accessToken) || "").length;

/* Why an expired login can survive a successful `claude auth login`.
 *
 * The CLI reads the keychain and only the keychain. Several long-lived `claude`
 * sessions write that one entry, and a losing writer can leave it holding empty
 * strings while ~/.claude/.credentials.json still has the real tokens. Every
 * call then fails to authenticate with nothing on disk looking wrong. Prints
 * lengths and emptiness only, never token material. */
function reportCredentials() {
  const kc = keychainOauth();
  if (!kc) return; // not macOS; nothing to compare
  const fl = fileOauth();
  const kcLen = tokenLen(kc.oauth);
  const flLen = tokenLen(fl.oauth);

  console.log("");
  if (!kc.present) {
    line("keychain", "no 'Claude Code-credentials' entry in the login keychain");
    cont("Sign in once and the CLI will create it:");
    cont("  claude auth login --claudeai");
    return;
  }
  if (kc.unreadable) {
    line("keychain", "'Claude Code-credentials' is there but is not readable JSON");
    cont("Sign in again to rewrite it:  claude auth login --claudeai");
    return;
  }

  line("keychain", `'Claude Code-credentials' accessToken ${kcLen ? `${kcLen} chars` : "EMPTY"}`);
  line("~/.claude", fl.present ? `.credentials.json accessToken ${flLen ? `${flLen} chars` : "empty"}` : ".credentials.json not on disk");

  if (kcLen === 0) {
    cont("");
    cont("The CLI reads the keychain and nothing else, so an empty entry there");
    cont(flLen ? "is a signed-out CLI even though the file still holds valid tokens." : "is a signed-out CLI.");
    cont("The usual cause is several long-lived `claude` sessions competing for");
    cont("that one entry; the last writer can leave it blank.");
    cont("");
    cont("Quit every other `claude` session, then run this once:");
    cont("  claude auth login --claudeai");
    cont("Then `jarvis brain` again - it is the turn that proves it, not the login.");
  } else {
    cont("");
    cont("The keychain entry has a token, so this is an ordinary expiry rather");
    cont("than the empty-entry case. Sign in again:  claude auth login --claudeai");
  }
}

/* ---- probing -------------------------------------------------------------
 * A copy of the config with one model forced, pinned to claude-code. Without
 * the pin the chain falls through to openai on a Claude failure and reports
 * that "opus answered" when what answered was a completely different brain. */
function withModel(cfg, model) {
  return {
    ...cfg,
    chat: { ...cfg.chat, model },
    brain: { ...cfg.brain, chain: ["claude-code"] },
  };
}

async function probeModels(cfg, models = MODELS, { timeoutMs = MODEL_PROBE_MS } = {}) {
  const out = [];
  for (const model of models) {
    // Only when a person is watching. Piped into a file or a log, the carriage
    // return does not erase anything and every line arrives doubled.
    const live = Boolean(process.stdout.isTTY);
    if (live) process.stdout.write(`    ${pad(model)} asking...`);
    const r = await brain
      .probe(withModel(cfg, model), { timeoutMs })
      .catch((e) => ({ ok: false, label: "probe failed", message: String(e) }));
    if (live) process.stdout.write("\r");
    line(model, r.ok ? `answers   (${r.ms}ms)` : `no   ${r.label || r.kind || "failed"}`);
    if (!r.ok && r.message) cont(String(r.message).split("\n")[0].slice(0, 110));
    out.push({ model, ...r });
  }
  return out;
}

function reportFailure(answer) {
  line("answers", `NO   ${answer.label || answer.kind || "failed"}`);
  if (answer.message) {
    // The runner's own words, not a paraphrase. That text is the only thing
    // that distinguishes "wrong model name" from "out of quota".
    String(answer.message).split("\n").slice(0, 4).forEach((l) => cont(l.slice(0, 160)));
  }
  if (answer.hint) cont(`-> ${answer.hint}`);
}

/* ---- config writes -------------------------------------------------------
 * Every write goes through cfgLib.save, which patches config.json only and
 * leaves config.default.json alone. Writing the same value twice produces the
 * same file, so all of this is safe to re-run. */
function setModel(name) {
  const value = /^(default|none|clear|cli)$/i.test(name) ? null : name;
  cfgLib.save({ chat: { model: value } });
  return value;
}

/* ---- jarvis brain --------------------------------------------------------*/
async function diagnose(cfg) {
  const chain = (cfg.brain && cfg.brain.chain) || [];
  console.log(`\n  BRAIN (${chain.join(" -> ") || "empty chain"})`);

  const st = await brain.status(cfg);
  line("claude-code", yn(st.providers["claude-code"]));
  line("openai", `${yn(st.providers.openai)}   ${(cfg.brain.openai || {}).base_url || "(no base_url)"}`);
  line("active", st.active || "NONE - chat cannot answer");
  /* Each provider reads a different key, and printing chat.model while openai
   * is active names a setting that has no effect on the next reply. */
  if (st.active === "openai") line("model", `${(cfg.brain.openai || {}).model || "(unset)"}   (brain.openai.model)`);
  else line("model", `${cfg.chat.model || "(the CLI default)"}   (chat.model)`);

  /* Installed is a separate question from usable, and it is the one with a
   * completely different fix, so it gets asked before anything is spent. */
  const installed = await has("claude");
  if (!installed) {
    line("claude CLI", "not installed");
    console.log(`
  Chat and every agent go through the \`claude\` CLI by default. Install it:

    npm install -g @anthropic-ai/claude-code
    claude auth login --claudeai

  Then run \`jarvis brain\` again. If you have no Claude subscription, run
  \`jarvis brain local\` instead and point Jarvis at a local model.`);
  } else {
    let version = "installed";
    try {
      version = execFileSync("claude", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 }).trim();
    } catch {}
    line("claude CLI", version);
  }

  if (!st.active) {
    console.log(`
  No provider in the chain is available, so chat has nothing to send to.
  Install Claude Code as above, or run \`jarvis brain local\`.\n`);
    return 1;
  }

  console.log(`
  Now the only question that matters: does it answer? A version, a \`which\`,
  and \`claude auth status\` all stay true through an expired login and an
  exhausted cap, so this spends one real turn.`);

  const answer = await brain
    .probe(cfg, { timeoutMs: PROBE_MS })
    .catch((e) => ({ ok: false, kind: "probe", label: "probe crashed", message: String(e) }));

  console.log("");
  if (answer.ok) {
    line("answers", `yes   (${answer.ms}ms)`);
    if (answer.text) cont(`it said: ${answer.text}`);
    console.log(`
  Chat works. If the HUD still shows nothing, that is the server or the
  browser, not the brain: \`jarvis doctor\` covers the rest.\n`);
    return 0;
  }

  reportFailure(answer);

  if (answer.kind === "auth-expired") reportCredentials();

  if (answer.kind === "usage-limit") {
    console.log(`
  A cap is usually per model, so another one is often still answering.
  Trying each with one cheap turn.\n`);
    const results = await probeModels(cfg);
    const working = results.filter((r) => r.ok);
    if (!working.length) {
      console.log(`
  None of them answered, so this is the account rather than the model. Wait for
  the window to reset, or run \`jarvis brain local\` to keep working offline.\n`);
      return 1;
    }
    const pick = working[0].model;
    if (pick === cfg.chat.model) {
      console.log(`\n  chat.model is already ${pick}, which answered just now. Nothing to change.\n`);
      return 0;
    }
    console.log("");
    if (await askYes(`  Set chat.model to ${pick} in config.json`, true)) {
      setModel(pick);
      line("chat.model", `${pick}   written to config.json`);
      cont(`put it back with: jarvis brain model ${cfg.chat.model || "default"}`);
    } else {
      console.log(`  Left alone. When you want it: jarvis brain model ${pick}`);
    }
    console.log("");
    return 1;
  }

  console.log("");
  return 1;
}

/* ---- jarvis brain model --------------------------------------------------*/
async function modelCommand(cfg, name) {
  if (!(await has("claude"))) {
    console.log(`
  chat.model names a Claude model, and the \`claude\` CLI is not installed, so
  there is nothing to set it on. Install it first:

    npm install -g @anthropic-ai/claude-code

  For a local model instead:  jarvis brain local\n`);
    return 1;
  }

  if (!name) {
    console.log(`\n  MODELS (current: ${cfg.chat.model || "the CLI default"})\n`);
    const results = await probeModels(cfg);
    const working = results.filter((r) => r.ok);
    console.log(working.length
      ? `\n  Set one with:  jarvis brain model <name>\n`
      : `\n  None of them answered. \`jarvis brain\` will say why.\n`);
    return working.length ? 0 : 1;
  }

  const previous = cfg.chat.model || null;
  const value = setModel(name);
  console.log(`\n  chat.model         ${previous || "(the CLI default)"} -> ${value || "(the CLI default)"}   written to config.json`);

  /* Reloaded from disk rather than patched in memory: the point of this
   * command is to prove what the next chat will actually use, and that comes
   * from the file. */
  const next = cfgLib.load();
  console.log(`  proving it with one real turn...\n`);
  const answer = await brain
    .probe(withModel(next, next.chat.model), { timeoutMs: PROBE_MS })
    .catch((e) => ({ ok: false, kind: "probe", label: "probe crashed", message: String(e) }));

  if (answer.ok) {
    line("answers", `yes   (${answer.ms}ms)`);
    if (answer.text) cont(`it said: ${answer.text}`);
    console.log("");
    return 0;
  }

  reportFailure(answer);
  /* Left in place deliberately. The failure is often the account rather than
   * the name, and silently reverting would hide a setting the person chose. */
  cont("");
  cont(`chat.model is still ${value || "the CLI default"}. To undo:`);
  cont(`  jarvis brain model ${previous || "default"}`);
  console.log("");
  return 1;
}

/* ---- jarvis brain local --------------------------------------------------*/
const isLocalUrl = (u) => /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(String(u || ""));
const normalizeBase = (u) => String(u || "").trim().replace(/\/+$/, "");

/* Ask the endpoint what it has. Doubles as the reachability check, since a
 * base_url that resolves but speaks nothing OpenAI-shaped is not usable and
 * should not be written into config. */
async function listModels(base, key) {
  try {
    const r = await fetch(`${normalizeBase(base)}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(4000),
    });
    if (r.status === 401 || r.status === 403) return { ok: false, status: r.status, needsKey: true, error: `${r.status}, needs an API key` };
    if (!r.ok) return { ok: false, status: r.status, error: `HTTP ${r.status}` };
    const j = await r.json().catch(() => ({}));
    const names = ((j && j.data) || []).map((m) => m.id).filter(Boolean);
    return { ok: true, names };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/* Keys go to .env, never config.json, and only when the file does not already
 * name one. */
function writeEnvKey(key) {
  const file = path.join(cfgLib.ROOT, ".env");
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (/^\s*OPENAI_API_KEY\s*=/m.test(existing)) return "already in .env, left alone";
  fs.appendFileSync(file, (existing && !existing.endsWith("\n") ? "\n" : "") + `OPENAI_API_KEY=${key}\n`);
  return "written to .env";
}

async function localCommand(cfg) {
  console.log(`
  LOCAL MODEL

  Points the brain at any OpenAI-compatible /v1 endpoint: Ollama, LM Studio,
  llama.cpp, or a gateway. Nothing here needs a Claude subscription.`);

  const configured = ((cfg.brain || {}).openai || {}).base_url || "";
  let base = normalizeBase(isLocalUrl(configured) ? configured : DEFAULT_LOCAL);
  let key = process.env.OPENAI_API_KEY || process.env.BRAIN_API_KEY || "";

  console.log("");
  let found = await listModels(base, key);
  if (!found.ok) {
    line("endpoint", `${base}   not reachable (${found.error})`);
    if (base === DEFAULT_LOCAL) {
      cont("That is Ollama's default. If you meant Ollama:");
      cont("  ollama serve        (in another terminal)");
      cont("  ollama pull llama3.2");
      cont("LM Studio is usually http://localhost:1234/v1");
    }
    console.log("");
    base = normalizeBase(await ask("  base_url of an OpenAI-compatible endpoint", base));
    found = await listModels(base, key);
  }

  if (!found.ok && found.needsKey) {
    console.log(`\n  ${base} needs an API key. It goes in .env, never config.json.`);
    const typed = await ask("  OPENAI_API_KEY (blank to skip)", "");
    if (typed) {
      key = typed;
      process.env.OPENAI_API_KEY = key; // so the probe below uses it this run
      line("api key", writeEnvKey(key));
      found = await listModels(base, key);
    }
  }

  if (!found.ok) {
    console.log(`
    ${pad("endpoint")} ${base}   still not reachable (${found.error})

  Nothing was written. Start the server, then run \`jarvis brain local\` again.\n`);
    return 1;
  }

  line("endpoint", `${base}   reachable`);
  line("models", found.names.length ? found.names.slice(0, 8).join(", ") + (found.names.length > 8 ? ", ..." : "") : "(the endpoint listed none)");

  const currentModel = ((cfg.brain || {}).openai || {}).model || "";
  const suggested = found.names.includes(currentModel) ? currentModel : (found.names[0] || currentModel || "llama3.2");
  console.log("");
  const model = (await ask("  Model to use", suggested)).trim();

  /* openai first, or claude-code keeps winning the chain and the local model
   * never gets a turn. claude-code stays behind it when it is installed, so
   * this is a preference rather than a removal. */
  const claudeInstalled = await has("claude");
  const chain = claudeInstalled ? ["openai", "claude-code"] : ["openai"];
  cfgLib.save({ brain: { chain, openai: { base_url: base, model } } });

  console.log("");
  line("brain.chain", chain.join(" -> "));
  line("openai.base_url", base);
  line("openai.model", model);
  cont("written to config.json (no key in it; keys live in .env)");

  const next = cfgLib.load();
  console.log(`\n  Proving it with one real turn...\n`);
  const answer = await brain
    .probe(next, { timeoutMs: PROBE_MS })
    .catch((e) => ({ ok: false, kind: "probe", label: "probe crashed", message: String(e) }));

  if (answer.ok) {
    line("answers", `yes   (${answer.ms}ms)`);
    if (answer.text) cont(`it said: ${answer.text}`);
    console.log(`\n  Chat now goes to ${model} at ${base}.\n`);
    return 0;
  }
  reportFailure(answer);
  /* The generic bad-model hint talks about chat.model, which is the Claude
   * setting and the wrong knob here. Name the one that was just written. */
  if (answer.kind === "bad-model") {
    cont("");
    cont(`For this brain the model lives at brain.openai.model, currently ${model}.`);
    cont("Run `jarvis brain local` again and pick one the endpoint listed.");
  }
  console.log("");
  return 1;
}

async function run(cfg, args = []) {
  const [sub, ...rest] = args;
  try {
    switch (sub) {
      case undefined:
        return await diagnose(cfg);
      case "model":
        return await modelCommand(cfg, rest[0]);
      case "local":
        return await localCommand(cfg);
      default:
        console.error("usage: jarvis brain [model [<name>] | local]");
        return 1;
    }
  } finally {
    closePrompts();
  }
}

module.exports = { run, diagnose, modelCommand, localCommand, probeModels, withModel, MODELS };
