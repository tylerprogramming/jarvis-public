/* OpenAI-compatible brain — for people without a Claude subscription.
 *
 * Talks to any /v1/chat/completions endpoint: OpenAI itself, Ollama, LM Studio,
 * llama.cpp, OpenRouter, Groq. The only difference between them is the base URL
 * and whether a key is required, so one implementation covers "bring your own
 * OpenAI key" and "run it entirely locally" alike.
 *
 * Claude Code arrives with its own tools; a chat endpoint does not. This module
 * runs the agent loop itself against the tool surface in ./tools.js, which is
 * what lets an OpenAI-backed Jarvis actually read vitals and edit directives
 * rather than just talk about them.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const persona = require("../persona");
const tools = require("./tools");

const MAX_STEPS = 12; // tool-call rounds before we stop and answer with what we have

function sessionFile(cfg, id) {
  return path.join(cfg.paths.data, "sessions", `${id}.json`);
}

function loadSession(cfg, id) {
  if (!id) return null;
  try { return JSON.parse(fs.readFileSync(sessionFile(cfg, id), "utf8")); } catch { return null; }
}

function saveSession(cfg, id, messages) {
  const file = sessionFile(cfg, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // keep the transcript bounded; the system prompt is rebuilt every turn
  const trimmed = messages.filter((m) => m.role !== "system").slice(-60);
  fs.writeFileSync(file, JSON.stringify({ id, updated: new Date().toISOString(), messages: trimmed }));
}

function settings(cfg) {
  const o = (cfg.brain && cfg.brain.openai) || {};
  return {
    baseUrl: (o.base_url || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: o.model || "gpt-4.1",
    key: process.env.OPENAI_API_KEY || process.env.BRAIN_API_KEY || "",
    temperature: o.temperature,
    maxTokens: o.max_tokens,
  };
}

async function available(cfg) {
  const s = settings(cfg);
  // A local server needs no key; a hosted one does. Probe local, trust the key
  // for hosted rather than spending a request on it.
  if (s.key) return true;
  if (/(127\.0\.0\.1|localhost|0\.0\.0\.0)/.test(s.baseUrl)) {
    try {
      const r = await fetch(`${s.baseUrl}/models`, { signal: AbortSignal.timeout(1500) });
      return r.ok;
    } catch {
      return false;
    }
  }
  return false;
}

/* One streamed completion. Emits text deltas as they arrive and accumulates any
 * tool calls, which arrive in fragments that have to be stitched by index. */
async function streamOnce(s, body, { onDelta, signal }) {
  const r = await fetch(`${s.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(s.key ? { Authorization: `Bearer ${s.key}` } : {}),
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`${r.status} ${detail.slice(0, 300)}`);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  const calls = []; // index -> {id, name, args}

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;

      let ev;
      try { ev = JSON.parse(payload); } catch { continue; }
      const delta = ((ev.choices || [])[0] || {}).delta || {};

      if (delta.content) {
        content += delta.content;
        onDelta(delta.content);
      }

      for (const tc of delta.tool_calls || []) {
        const i = tc.index ?? 0;
        calls[i] = calls[i] || { id: "", name: "", args: "" };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function && tc.function.name) calls[i].name += tc.function.name;
        if (tc.function && tc.function.arguments) calls[i].args += tc.function.arguments;
      }
    }
  }

  return { content, calls: calls.filter(Boolean) };
}

function chat(cfg, { message, sessionId, on }) {
  const s = settings(cfg);
  const controller = new AbortController();

  (async () => {
    try {
      const id = sessionId || "oa_" + crypto.randomBytes(8).toString("hex");
      const prior = loadSession(cfg, id);
      on.session(id);

      const messages = [
        { role: "system", content: persona.build(cfg) },
        ...((prior && prior.messages) || []),
        { role: "user", content: message },
      ];

      let finalText = "";

      for (let step = 0; step < MAX_STEPS; step++) {
        const { content, calls } = await streamOnce(
          s,
          {
            model: s.model,
            messages,
            tools: tools.openaiSchema(),
            ...(s.temperature != null ? { temperature: s.temperature } : {}),
            ...(s.maxTokens != null ? { max_tokens: s.maxTokens } : {}),
          },
          { onDelta: on.delta, signal: controller.signal },
        );

        finalText = content || finalText;

        if (!calls.length) {
          messages.push({ role: "assistant", content });
          break;
        }

        messages.push({
          role: "assistant",
          content: content || null,
          tool_calls: calls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: c.args || "{}" },
          })),
        });

        for (const c of calls) {
          on.tool(c.name);
          let args = {};
          try { args = JSON.parse(c.args || "{}"); } catch {}
          const result = await tools.call(cfg, c.name, args);
          messages.push({ role: "tool", tool_call_id: c.id, content: String(result) });
        }

        if (step === MAX_STEPS - 1) {
          on.log("tool-call limit reached; answering with what is known so far");
        }
      }

      saveSession(cfg, id, messages);
      on.done({ result: finalText, sessionId: id });
    } catch (e) {
      if (e.name !== "AbortError") on.error(e.message || String(e));
    } finally {
      on.end();
    }
  })();

  return { kill: () => controller.abort() };
}

module.exports = { chat, available, settings, label: "OpenAI-compatible" };
