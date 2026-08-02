/* Claude Code brain — the default, and the most capable option.
 *
 * Spawns the `claude` CLI headless. It brings its own tools, its own session
 * store, and any skills the operator has installed, so Jarvis does not have to
 * supply a tool surface here. If the user has a Claude subscription, this is
 * strictly better than the API-backed brains.
 */
const { spawn } = require("child_process");
const { expand } = require("../config");
const persona = require("../persona");
const { has } = require("../util");

function available() {
  return has("claude");
}

function chat(cfg, { message, sessionId, on }) {
  const args = [
    "-p", message,
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--permission-mode", cfg.chat.permission_mode,
    "--allowedTools", cfg.chat.allowed_tools,
    "--append-system-prompt", persona.build(cfg),
  ];
  if (cfg.chat.disallowed_tools) args.push("--disallowedTools", cfg.chat.disallowed_tools);
  if (cfg.chat.model) args.push("--model", cfg.chat.model);
  if (sessionId) args.push("--resume", sessionId);

  let child;
  try {
    child = spawn("claude", args, {
      cwd: expand(cfg.chat.cwd),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    on.error(String(e));
    on.end();
    return { kill() {} };
  }

  let buf = "";
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
        on.done({ result: ev.result || "", cost: ev.total_cost_usd, sessionId: ev.session_id });
      }
    }
  });

  child.stderr.on("data", (c) => on.log(c.toString().slice(0, 500)));
  child.on("error", (err) => { on.error(String(err)); on.end(); });
  child.on("close", (code) => {
    if (code !== 0) on.error(`claude exited ${code}`);
    on.end();
  });

  return { kill: () => child.kill("SIGTERM") };
}

module.exports = { chat, available, label: "Claude Code" };
