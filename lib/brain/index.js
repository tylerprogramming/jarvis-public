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
    on.error(
      "no brain available - install Claude Code, or set OPENAI_API_KEY, or point brain.openai.base_url at a local model server",
    );
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

module.exports = { chat, status, resolve, PROVIDERS };
