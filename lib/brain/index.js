/* Brain dispatcher: which model actually answers the command bar.
 *
 *   claude-code  the `claude` CLI, headless. Default. Brings its own tools and
 *                skills, and needs no API key beyond what Claude Code already
 *                has. This is the best option and the one Jarvis assumes.
 *   openai       any OpenAI-compatible /v1/chat/completions endpoint. Covers
 *                both "I have an OpenAI key" and "I run Ollama locally", since
 *                they speak the same protocol. Jarvis supplies the tool loop.
 *
 * Same fallback-chain shape as voice and speech: try each in order, use the
 * first that is actually available.
 */
const claudeCode = require("./claude-code");
const openai = require("./openai");

const PROVIDERS = { "claude-code": claudeCode, openai };

async function resolve(cfg) {
  const chain = (cfg.brain && cfg.brain.chain) || ["claude-code"];
  for (const name of chain) {
    const p = PROVIDERS[name];
    if (!p) continue;
    try {
      if (await p.available(cfg)) return { name, provider: p };
    } catch {
      // an unavailable provider must not block the chain
    }
  }
  return null;
}

/* Runs one turn. `on` receives: session, delta, tool, log, done, error, end.
 * Returns a handle with kill(), for when the client disconnects mid-answer. */
async function chat(cfg, { message, sessionId, on }) {
  const resolved = await resolve(cfg);
  if (!resolved) {
    on.error({
      kind: "no-brain",
      label: "no brain configured",
      message: "no brain available",
      hint: "Install Claude Code (`npm install -g @anthropic-ai/claude-code`, then `claude`),"
          + " or set OPENAI_API_KEY, or point brain.openai.base_url at a local model server.",
    });
    on.end();
    return { kill() {} };
  }
  on.log(`brain: ${resolved.name}`);
  return resolved.provider.chat(cfg, { message, sessionId, on });
}

async function status(cfg) {
  const out = {};
  for (const [name, p] of Object.entries(PROVIDERS)) {
    try { out[name] = await p.available(cfg); } catch { out[name] = false; }
  }
  const active = await resolve(cfg);
  return { providers: out, active: active ? active.name : null };
}

/* Spends one real turn to prove the brain can actually answer.
 *
 * `available()` only says the binary is there or the key is set, which stays
 * true through an expired login, an exhausted usage cap, and a model the plan
 * does not include - every one of which leaves chat silently broken. Resolves
 * to {ok:true, ms} or the classified failure, and never throws. */
async function probe(cfg, { timeoutMs = 60000 } = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; clearTimeout(timer); try { handle && handle.kill(); } catch {} resolve(v); } };
    const timer = setTimeout(
      () => finish({ ok: false, kind: "timeout", label: "timed out", message: `no answer in ${Math.round(timeoutMs / 1000)}s`, hint: "The brain is reachable but slow. Try again, or check the provider's status page." }),
      timeoutMs,
    );
    let text = "";
    let handle;
    chat(cfg, {
      message: "Reply with the single word: online",
      on: {
        session() {}, tool() {}, log() {},
        delta: (t) => { text += t; },
        done: (p) => { text = (p && p.result) || text; },
        error: (e) => finish(Object.assign({ ok: false }, typeof e === "string" ? { message: e } : e)),
        end: () => finish(text.trim() ? { ok: true, ms: Date.now() - started, text: text.trim().slice(0, 80) }
                                      : { ok: false, kind: "empty", label: "answered nothing", message: "the brain returned an empty reply", hint: "Run `claude -p hi` in a terminal to see what it says." }),
      },
    }).then((h) => { handle = h; }).catch((e) => finish({ ok: false, kind: "spawn", label: "could not start", message: String(e) }));
  });
}

module.exports = { chat, status, resolve, probe, PROVIDERS };
