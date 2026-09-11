/* Claude Code brain — the default, and the most capable option.
 *
 * Spawns the `claude` CLI headless. It brings its own tools, its own session
 * store, and any skills the operator has installed, so Jarvis does not have to
 * supply a tool surface here. If the user has a Claude subscription, this is
 * strictly better than the API-backed brains.
 */
const { spawn } = require("child_process");
const { chatCwd } = require("../config");
const persona = require("../persona");
const { has } = require("../util");
const mcp = require("../mcp");
const limits = require("./limits");

function available() {
  return has("claude");
}

/* One turn. Resuming a conversation the CLI no longer has is the one failure
 * that is worth retrying, and only by starting over: the id came from the
 * HUD's localStorage or data/session.json, and nothing the person does with
 * the message will make it exist. So the first no-session failure spawns
 * again without --resume, and the new session id reaches the HUD through the
 * normal `session` event, replacing the stale one. Once, not in a loop: a
 * second failure without a session is a different problem. */
async function chat(cfg, { message, sessionId, on }) {
  let current = null;
  const handle = { kill: () => { if (current) current.kill(); } };
  const turn = (sid, retried) => spawnTurn(cfg, {
    message, sessionId: sid, on,
    onNoSession: retried || !sid ? null : () => {
      on.log(`session ${sid} no longer exists, starting a new conversation`);
      current = turn(undefined, true);
    },
  });
  current = turn(sessionId, false);
  await current.ready;
  return handle;
}

function spawnTurn(cfg, { message, sessionId, on, onNoSession }) {
  /* MCP tools have to be named here or the call is rejected locally, before it
   * ever reaches the server. That failure reads as "the server is down" when
   * the server is fine, so the servers the operator enabled are appended to the
   * allow list rather than left to be discovered the hard way. */
  const state = { child: null, kill: () => { state.killed = true; if (state.child) state.child.kill("SIGTERM"); } };
  state.ready = (async () => {
  const mcpTokens = await mcp.allowTokens(cfg).catch(() => []);
  const allowed = [cfg.chat.allowed_tools, ...mcpTokens].filter(Boolean).join(" ");

  const args = [
    "-p", message,
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--permission-mode", cfg.chat.permission_mode,
    "--allowedTools", allowed,
    "--append-system-prompt", persona.build(cfg, { mcp: mcpTokens }),
  ];
  /* With no server allowed, the CLI would still connect to every MCP server
   * the operator has - thirteen OAuth handshakes on one machine measured
   * here, three seconds on every "hello" - for tools this turn is not
   * permitted to call. An empty strict config skips them. When some are
   * allowed, the CLI's own config is the only source of their definitions,
   * so it is left alone and the unallowed ones are the price of the rest. */
  if (!mcpTokens.length) args.push("--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}');
  if (cfg.chat.disallowed_tools) args.push("--disallowedTools", cfg.chat.disallowed_tools);
  if (cfg.chat.model) args.push("--model", cfg.chat.model);
  if (sessionId) args.push("--resume", sessionId);

  /* Empty or missing cwd means the repo root (chatCwd in config.js). It used
   * to default to ~, and `claude -p` silently loads ~/.claude/CLAUDE.md and
   * the operator's personal ~/.claude/projects/<home>/memory/ from wherever it
   * starts, so every Jarvis chat carried their global instructions and notes
   * while the scheduled agents, which run at the repo root, saw none of it.
   * Both now start in the same place and get the same context. */
  const cwd = chatCwd(cfg);

  if (state.killed) { on.end(); return; }
  let child;
  try {
    child = spawn("claude", args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    on.error(limits.classify(String(e), "spawn"));
    on.end();
    return;
  }
  state.child = child;

  let buf = "";
  let failed = false;
  let stderr = "";
  /* Fails this turn, or hands it to the retry when the reason is a stale
   * session and the caller offered one. The CLI reports that case with an
   * empty `result` and the sentence on stderr, so stderr is the message. */
  const fail = (text, fallbackKind) => {
    failed = true;
    const e = limits.classify(String(text || "").trim() || stderr.trim(), fallbackKind);
    if (e.kind === "no-session" && onNoSession) { handedOff = true; return; }
    on.error(e);
  };
  let handedOff = false;
  let deferred = false;
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }

      if (ev.type === "system" && ev.subtype === "init") {
        on.session(ev.session_id);
      } else if (ev.type === "stream_event") {
        const d = ev.event || {};
        if (d.type === "content_block_delta" && d.delta && d.delta.type === "text_delta")
          on.delta(d.delta.text);
      } else if (ev.type === "assistant" && ev.message) {
        for (const block of ev.message.content || [])
          if (block.type === "tool_use") on.tool(block.name);
      } else if (ev.type === "result") {
        /* `is_error` marks a turn that failed inside the CLI - a usage cap, an
         * expired login, an overloaded server. It arrives shaped exactly like
         * a successful result (subtype is even "success"), so without this
         * check the failure text renders as the model's reply. */
        if (limits.isFailure(ev)) {
          /* An empty failure means the reason went to stderr, which may not
           * have arrived yet; the close handler classifies it once it has. */
          if (String(ev.result || "").trim()) fail(ev.result); else deferred = true;
        } else {
          on.done({ result: ev.result || "", cost: ev.total_cost_usd, sessionId: ev.session_id });
        }
      }
    }
  });

  child.stderr.on("data", (c) => {
    const text = c.toString();
    stderr = (stderr + text).slice(-2000);
    on.log(text.slice(0, 500));
  });
  child.on("error", (err) => { on.error(limits.classify(String(err), "spawn")); on.end(); });
  child.on("close", (code) => {
    /* A non-zero exit with no classified failure already reported. When the
     * result event named the reason, that reason is the useful one and this
     * would only bury it under an exit code. stderr is checked first for the
     * same reason: "No conversation found" beats "claude exited 1". */
    if ((code !== 0 || deferred) && !failed) fail(stderr.trim() || `claude exited ${code}`, "exit");
    if (handedOff && !state.killed) { onNoSession(); return; }
    on.end();
  });
  })();

  return state;
}

module.exports = { chat, available, label: "Claude Code" };
