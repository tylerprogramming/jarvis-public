#!/usr/bin/env node
/* Guided setup for chat delivery, and for the phone inbox that comes with it.
 *
 * docs/NOTIFY.md is the written version of this, and the two have to stay in
 * step: the clicks printed here are the clicks in that file, and a failure is
 * explained with the same table as its "when it does not work" section. This
 * exists because that page asks a person to hold four things at once - a
 * secret in .env, a channel in config.json, a test command, an agent to point
 * at it - and the usual outcome is a webhook that exists and a channel nobody
 * ever proved works.
 *
 * Nothing here guesses. The Telegram chat id is read from the bot's own
 * updates, never invented, and a platform is only called done after a real
 * message left the machine and the platform answered.
 *
 * Re-runnable on purpose. Every write is idempotent: an .env line is replaced
 * where it already sits, a channel is merged into config.json, so a second run
 * finds the channel already there and offers to test it, replace it, or leave
 * it alone rather than adding a second copy of everything.
 *
 * Secrets: written to .env, never to config.json, and never printed back in
 * full. Everything the operator pastes is masked on the way out, including
 * inside the platform's own reply, because notify.py happily echoes an ntfy
 * topic in its success line.
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execFileSync } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const { load, save, loadEnvFile } = require(path.join(ROOT, "lib", "config"));
const notifyLib = require(path.join(ROOT, "lib", "notify"));
const inboxLib = require(path.join(ROOT, "lib", "inbox"));

/* A line queue rather than rl.question(), the same shape as scripts/setup.js.
 * readline.question only captures a line while a question is outstanding, so
 * piped input loses everything that arrives in between and then closes early.
 * Buffering makes a scripted run behave like a typed one, and a closed stdin
 * yields defaults instead of a stack trace. */
const rl = readline.createInterface({ input: process.stdin });
const buffered = [];
const waiting = [];
let closed = false;

rl.on("line", (line) => {
  const next = waiting.shift();
  if (next) next(line);
  else buffered.push(line);
});
rl.on("close", () => {
  closed = true;
  waiting.splice(0).forEach((fn) => fn(null));
});

const ask = (q, def = "") =>
  new Promise((resolve) => {
    process.stdout.write(def ? `${q} [${def}]: ` : `${q}: `);
    const take = (line) => {
      if (line === null) process.stdout.write("\n");
      resolve(line === null ? def : String(line).trim() || def);
    };
    if (buffered.length) return take(buffered.shift());
    if (closed) return take(null);
    waiting.push(take);
  });

const askYes = async (q, def = true) => /^y/i.test(await ask(`${q} (y/n)`, def ? "y" : "n"));

/* ---------- secrets ---------- */

/* First 6 and last 4 at most, and less than that when the secret is short
 * enough that those would be all of it. Used on everything the operator
 * pastes, everywhere it could be printed. */
function mask(s) {
  const v = String(s == null ? "" : s);
  if (!v) return "(empty)";
  if (v.length <= 12) return v.slice(0, 2) + "*".repeat(Math.max(v.length - 4, 3)) + v.slice(-2);
  return v.slice(0, 6) + "*".repeat(6) + v.slice(-4);
}

/* Replace every collected secret in a platform's reply with its masked form.
 * notify.py scrubs the vars it knows are secrets, but not NTFY_TOPIC, which
 * it prints in full on success. A terminal that gets pasted into an issue
 * should not hand over the channel. */
function scrub(text, secrets) {
  let out = String(text == null ? "" : text);
  for (const v of secrets)
    if (v && String(v).length >= 4) out = out.split(String(v)).join(mask(v));
  return out;
}

const ENV_FILE = path.join(ROOT, ".env");

/* Create .env from .env.example when it is missing, so the first line written
 * lands in a file that still explains every other key. */
function ensureEnvFile() {
  if (fs.existsSync(ENV_FILE)) return false;
  const example = path.join(ROOT, ".env.example");
  if (fs.existsSync(example)) fs.copyFileSync(example, ENV_FILE);
  else fs.writeFileSync(ENV_FILE, "# Secrets. Gitignored. Never put keys in config.json.\n");
  return true;
}

const quote = (v) => (/[\s#"']/.test(v) ? JSON.stringify(v) : v);

/* Set one key in .env without disturbing anything else.
 *
 * Idempotent three ways, which is what makes a second run safe: an existing
 * live line is rewritten where it sits, a commented placeholder (.env.example
 * ships one per provider) is uncommented in place so the key stays under its
 * own explanation, and only a key that appears nowhere is appended. Returns
 * what happened so the caller can say it out loud. */
function envSet(key, value) {
  ensureEnvFile();
  const raw = fs.readFileSync(ENV_FILE, "utf8");
  const lines = raw.split("\n");
  const line = `${key}=${quote(value)}`;
  const live = new RegExp(`^\\s*${key}\\s*=`);
  const commented = new RegExp(`^\\s*#\\s*${key}\\s*=`);

  let at = lines.findIndex((l) => live.test(l));
  if (at >= 0) {
    const before = lines[at];
    lines[at] = line;
    fs.writeFileSync(ENV_FILE, lines.join("\n"));
    return before === line ? "unchanged" : "updated";
  }
  at = lines.findIndex((l) => commented.test(l));
  if (at >= 0) {
    lines[at] = line;
    fs.writeFileSync(ENV_FILE, lines.join("\n"));
    return "added";
  }
  fs.appendFileSync(ENV_FILE, (raw && !raw.endsWith("\n") ? "\n" : "") + line + "\n");
  return "added";
}

/* Keep this process in step with the file it just wrote. load() read .env
 * before these lines existed, and everything downstream (notify.py's env, the
 * inbox check, resolve()) reads process.env. */
function envApply(key, value) {
  const how = envSet(key, value);
  process.env[key] = value;
  return how;
}

/* ---------- the platforms ---------- */
/* steps are docs/NOTIFY.md's clicks, in its order. effort is what the menu
 * shows, so a person picks by how much of their evening it costs. */
const PLATFORMS = {
  ntfy: {
    label: "ntfy",
    effort: "about a minute, no account",
    channel: "push",
    provider: "ntfy",
    steps: [
      "install the ntfy app on your phone (iPhone or Android), free, no account",
      "tap +, then Subscribe to topic",
      "type a topic name. Anyone who knows the name can read it, so pick",
      "  something nobody would guess; there is a suggestion below",
    ],
    secrets: [{
      var: "NTFY_TOPIC",
      prompt: "  the topic you subscribed to",
      suggest: () => `jarvis-${crypto.randomBytes(4).toString("hex")}`,
    }],
    note: "self-hosting ntfy? put NTFY_URL=https://ntfy.yourdomain.com in .env too",
  },
  discord: {
    label: "Discord",
    effort: "about thirty seconds",
    channel: "team",
    provider: "discord",
    steps: [
      "open the Discord channel you want the reports in",
      "click the gear (Edit Channel), then Integrations, then Webhooks",
      "click New Webhook, name it Jarvis",
      "click Copy Webhook URL",
    ],
    secrets: [{
      var: "DISCORD_WEBHOOK_URL",
      prompt: "  paste the webhook URL",
      looksWrong: (v) => (v.includes("discord.com/api/webhooks") || v.includes("discordapp.com/api/webhooks")
        ? "" : "that does not look like a Discord webhook URL (they start with https://discord.com/api/webhooks/)"),
    }],
    note: "the URL is the secret: anyone with it can post to that channel",
  },
  slack: {
    label: "Slack",
    effort: "about five minutes",
    channel: "slack",
    provider: "slack",
    steps: [
      "go to https://api.slack.com/apps and click Create New App, then From scratch",
      "name it Jarvis, pick your workspace, Create App",
      "in the app sidebar click Incoming Webhooks, switch it On",
      "click Add New Webhook to Workspace, choose the channel, Allow",
      "copy the webhook URL it shows you",
    ],
    secrets: [{
      var: "SLACK_WEBHOOK_URL",
      prompt: "  paste the webhook URL",
      looksWrong: (v) => (v.includes("hooks.slack.com/services/")
        ? "" : "that does not look like a Slack webhook URL (they start with https://hooks.slack.com/services/)"),
    }],
  },
  telegram: {
    label: "Telegram",
    effort: "about five minutes, the fiddly part is the chat id",
    channel: "phone",
    provider: "telegram",
    steps: [
      "in Telegram, open a chat with @BotFather and send /newbot",
      "answer its two questions: a display name, then a username ending in bot",
      "it replies with a token that looks like 123456789:AAF...",
    ],
    secrets: [{
      var: "TELEGRAM_BOT_TOKEN",
      prompt: "  paste the bot token",
      looksWrong: (v) => (/^\d+:[\w-]{20,}$/.test(v)
        ? "" : "that does not look like a bot token (they look like 123456789:AAF...)"),
    }],
    note: "the chat id comes next, and it is found rather than typed",
  },
  webhook: {
    label: "webhook",
    effort: "a minute, if you already have the URL",
    channel: "hook",
    provider: "webhook",
    steps: [
      "point this at n8n, Zapier, Make, or your own server",
      'Jarvis POSTs JSON: {"title", "text", "file", "mode"}, with no auth header',
      "if the receiver needs a secret, put it in the URL path",
    ],
    secrets: [{
      var: "NOTIFY_WEBHOOK_URL",
      prompt: "  paste the URL Jarvis should POST to",
      looksWrong: (v) => (/^https?:\/\//.test(v) ? "" : "that is not a URL; it has to start with http:// or https://"),
    }],
  },
};

const ALIASES = { tg: "telegram", hook: "webhook", push: "ntfy", ntfy: "ntfy" };

/* docs/NOTIFY.md's "when it does not work" table, matched against what the
 * platform actually said. Same rows, same order; a new row belongs in both. */
const FIXES = [
  [/not configured: set ([A-Z0-9_, ]+)/,
    "the key is not in .env, or the line is commented out with #. Re-enter it below."],
  [/refused it \(401\)/,
    "the bot token is wrong or was revoked in @BotFather. Get a fresh one and re-enter it."],
  [/chat not found|chat_id is empty/,
    "the chat id is wrong, or you never messaged the bot. Pick the chat again below."],
  [/refused it \(403\)|Invalid Webhook Token/,
    "the webhook was deleted. Make a new one in the channel and re-enter the URL."],
  [/no_service|refused it \(404\)/,
    "the webhook was removed from the app, or the app was uninstalled. Add a new one."],
  [/could not reach/,
    "no network from this machine, or a self-hosted URL is wrong."],
];

function fixFor(output) {
  for (const [re, advice] of FIXES) if (re.test(output)) return advice;
  return "";
}

/* ---------- doing the thing ---------- */

const NOTIFY_PY = path.join(ROOT, "scripts", "notify.py");

/* Really send. Returns the platform's own words either way, because a webhook
 * that exists is not a webhook that works and the reply is the diagnosis. */
function testSend(provider, env) {
  try {
    const out = execFileSync("python3", [NOTIFY_PY, "--via", provider, "--test"], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env, timeout: 30000,
    });
    return { ok: true, output: String(out).trim() };
  } catch (e) {
    const lines = String((e.stdout || "") + (e.stderr || "")).trim().split("\n").filter(Boolean);
    const said = lines.find((l) => l.startsWith(`FAIL ${provider}:`)) || lines[0] || String(e.message || "");
    return { ok: false, output: said.replace(`FAIL ${provider}: `, "") };
  }
}

/* Prove one channel, and let a failure retry the step that failed. Starting
 * over would mean re-reading BotFather. Returns true when the platform
 * accepted a message. */
async function proveIt(name, secrets, reask) {
  for (;;) {
    const r = notifyLib.resolve(load(), name);
    if (!r.ok) {
      console.log(`\n  cannot send yet: ${r.reason}`);
      return false;
    }
    /* Mask this channel's own secrets whether or not they were typed in this
     * run. Testing an already-configured channel collects nothing, and ntfy's
     * success line quotes the topic in full, so reading the values back out of
     * the environment is what keeps a re-test from leaking one. */
    const hide = [...secrets, ...(r.slots || []).map((s) => process.env[s.from]).filter(Boolean)];
    process.stdout.write(`\n  sending a real test message to ${name} (${r.provider})... `);
    const res = testSend(r.provider, notifyLib.envFor(r));
    const said = scrub(res.output, hide);
    if (res.ok) {
      console.log("sent");
      console.log(`  ${r.provider} said: ${said || "accepted, no body"}`);
      return true;
    }
    console.log("failed");
    console.log(`  ${r.provider} said: ${said}`);
    const advice = fixFor(res.output);
    console.log(`  that means: ${advice || "no known cause for that one; the line above is the platform's own answer"}`);
    const what = (await ask("\n  [r] retry the send, [e] re-enter the secret, [l] leave it for now", "r")).toLowerCase();
    if (what.startsWith("l")) return false;
    if (what.startsWith("e")) {
      if (!reask) return false;
      const again = await reask();
      if (!again) return false;
      secrets = again;
    }
  }
}

/* Ask for one secret, refuse the obviously wrong shape, never print it back
 * in full. */
async function askSecret(spec) {
  for (;;) {
    const def = spec.suggest ? spec.suggest() : "";
    const v = await ask(spec.prompt, def);
    if (!v) {
      console.log("  nothing entered, so nothing was written.");
      return "";
    }
    const wrong = spec.looksWrong ? spec.looksWrong(v) : "";
    if (wrong) {
      console.log(`  ${wrong}`);
      if (!(await askYes("  use it anyway", false))) continue;
    }
    return v;
  }
}

/* Telegram's chat id is the one secret no settings page has: a bot learns a
 * chat only when someone writes to it. Same lookup as `jarvis notify
 * telegram-id`, through lib/notify, so the two can never disagree. */
async function telegramChatId() {
  for (;;) {
    console.log("\n  now open your new bot in Telegram (BotFather gave you a link) and send");
    console.log("  it any message, hi is fine. For a group, add the bot to the group and");
    console.log("  post there instead.");
    await ask("  press enter once you have sent it", " ");
    process.stdout.write("  asking Telegram who has messaged the bot... ");
    const r = await notifyLib.telegramChats(process.env.TELEGRAM_BOT_TOKEN);
    if (!r.ok) {
      console.log("refused");
      console.log(`  telegram said: ${r.error}`);
      const advice = fixFor(`refused it (${r.status || 0}): ${r.error}`);
      if (advice) console.log(`  that means: ${advice}`);
      if (await askYes("\n  re-enter the token", true)) {
        const t = await askSecret(PLATFORMS.telegram.secrets[0]);
        if (!t) return null;
        envApply("TELEGRAM_BOT_TOKEN", t);
        console.log(`  wrote TELEGRAM_BOT_TOKEN=${mask(t)} to .env`);
        continue;
      }
      return null;
    }
    if (!r.chats.length) {
      console.log("nothing yet");
      console.log("\n  nobody has messaged this bot yet, so Telegram has no chat to name.");
      console.log("  It is not a mistake in what you typed; the id simply does not exist");
      console.log("  until someone writes to the bot. Telegram also drops updates after");
      console.log("  24 hours, so an old message does not count.");
      if (await askYes("\n  send it a message now and try again", true)) continue;
      return null;
    }
    console.log(`found ${r.chats.length}`);
    console.log("");
    r.chats.forEach((c, i) => {
      console.log(`  ${String(i + 1).padStart(2)}) ${String(c.id).padEnd(16)} ${(c.type || "").padEnd(11)} ${c.who}`);
    });
    const pick = await ask(`\n  which one should Jarvis post to (1-${r.chats.length})`, "1");
    const chosen = r.chats[(parseInt(pick, 10) || 1) - 1] || r.chats[0];
    return String(chosen.id);
  }
}

/* ---------- follow-ups ---------- */

/* An agent that names a channel is the whole point; a channel nothing
 * delivers to is a test message and then silence. Written to config.json
 * under agents.<name>, never into agents/*.md, which a pull overwrites. */
async function attachToAgent(channel) {
  const cfg = load();
  const agents = require(path.join(ROOT, "lib", "agents")).list(cfg);
  if (!agents.length) return;
  const already = agents.filter((a) => (a.notify || []).includes(channel)).map((a) => a.name);
  if (already.length) {
    console.log(`\n  already delivering to ${channel}: ${already.join(", ")}`);
  }
  console.log("\n  which agent should send its reports to this channel?");
  console.log("    radar     only pings when something broke out");
  console.log("    watchdog  only pings when an agent failed or went quiet");
  console.log("    nightly   the day's recap, every night");
  console.log(`    all of them: ${agents.map((a) => a.name).join(", ")}`);
  const name = await ask("\n  agent name (blank to skip)", "");
  if (!name) return;
  const agent = agents.find((a) => a.name === name);
  if (!agent) {
    console.log(`  no agent called "${name}". Skipping; add agents.${name}.notify to config.json yourself if it exists.`);
    return;
  }
  const list = Array.from(new Set([...(agent.notify || []), channel]));
  save({ agents: { [name]: { notify: list } } });
  console.log(`  config.json: agents.${name}.notify = [${list.join(", ")}]`);
  console.log(`  it delivers when the run writes a new file. Check it with: jarvis agents check`);
}

/* The Telegram bot works in both directions, and nobody discovers the second
 * one from a config key. Verified the same way as everything else here: start
 * it, then wait for the poller to actually poll. */
async function offerInbox() {
  const s = inboxLib.status();
  if (!s.configured) return;
  console.log("\n  the same bot works the other way: you message it, Jarvis answers, so");
  console.log("  you can run agents and ask questions from your phone. It opens no port");
  console.log(`  and only answers chat ${s.allowed.join(", ")}; anything else is ignored.`);
  if (s.running) {
    console.log(`  it is already running (pid ${s.pid}).`);
    return;
  }
  if (!(await askYes("\n  turn it on now", true))) {
    console.log("  fine. Turn it on later with: jarvis inbox start");
    return;
  }
  try {
    execFileSync(process.execPath, [path.join(ROOT, "bin", "jarvis"), "inbox", "start"], {
      cwd: ROOT, stdio: "inherit", env: process.env, timeout: 40000,
    });
  } catch {
    console.log("  it did not start. jarvis inbox start shows the error again.");
    return;
  }
  /* A pid is not a working bridge. Wait for a real poll to land in
   * data/inbox.json, which is the thing doctor calls "running". */
  process.stdout.write("  waiting for its first poll... ");
  const until = Date.now() + 20000;
  let now = inboxLib.status();
  while (Date.now() < until && !(now.running && now.pollAgeMs !== null && now.pollAgeMs < 60000)) {
    await new Promise((r) => setTimeout(r, 1000));
    now = inboxLib.status();
  }
  if (now.running && now.pollAgeMs !== null && now.pollAgeMs < 60000) {
    console.log(`polling${now.bot ? ` as @${now.bot}` : ""} (pid ${now.pid})`);
    console.log("  message your bot and it answers. jarvis inbox stop turns it off.");
  } else {
    console.log("no poll yet");
    console.log(`  it may still be starting. Check with: jarvis inbox status`);
    console.log(`  and read ${path.relative(ROOT, inboxLib.LOG_FILE)} if it stays quiet.`);
  }
}

/* ---------- one platform, start to finish ---------- */

async function runPlatform(key) {
  const p = PLATFORMS[key];
  console.log(`\n  ${p.label.toUpperCase()}  (${p.effort})`);
  console.log("  " + "-".repeat(Math.max(p.label.length + p.effort.length + 4, 20)));

  const cfg = load();
  const chans = notifyLib.channels(cfg);
  const mine = Object.keys(chans).filter(
    (n) => String((chans[n] || {}).provider || "").toLowerCase() === p.provider);

  let name = p.channel;
  if (mine.length) {
    console.log("");
    for (const n of mine) {
      const r = notifyLib.resolve(cfg, n);
      console.log(`  "${n}" is already set up for ${p.provider}: ${r.ok ? "its secret is in .env" : r.reason}`);
    }
    name = mine[0];
    const what = (await ask(`\n  [t] test "${name}", [r] replace its secret, [l] leave it alone`, "t")).toLowerCase();
    if (what.startsWith("l")) return;
    /* Only an explicit r replaces. Anything unrecognised tests instead,
     * because the destructive branch is the wrong place for a typo to land:
     * a stray answer used to walk straight into overwriting a working
     * secret. */
    if (!what.startsWith("r")) {
      const ok = await proveIt(name, [], null);
      if (ok) await followUps(key, name);
      return;
    }
  } else {
    console.log("");
    p.steps.forEach((s, i) => console.log(`  ${s.startsWith(" ") ? "   " : `${i + 1}. `}${s.trim()}`));
    if (p.note) console.log(`\n  (${p.note})`);
    console.log("");
  }

  const secrets = [];
  const collect = async () => {
    const got = [];
    for (const spec of p.secrets) {
      const v = await askSecret(spec);
      if (!v) return null;
      const how = envApply(spec.var, v);
      console.log(`  .env ${how}: ${spec.var}=${mask(v)}`);
      got.push(v);
    }
    if (p.provider === "telegram") {
      const id = await telegramChatId();
      if (!id) {
        console.log("\n  stopping here. The token is saved, so `jarvis connect telegram` picks up");
        console.log("  where this left off once someone has messaged the bot.");
        return null;
      }
      const how = envApply("TELEGRAM_CHAT_ID", id);
      console.log(`  .env ${how}: TELEGRAM_CHAT_ID=${id}`);   // a chat id is not a secret, it is useless without the token
      got.push(id);
    }
    return got;
  };

  const got = await collect();
  if (!got) return;
  secrets.push(...got);

  name = await ask("\n  name this channel (agents refer to it by this name)", name);
  save({ notify: { channels: { [name]: { provider: p.provider } } } });
  console.log(`  config.json: notify.channels.${name}.provider = ${p.provider}   (no secret goes in this file)`);

  const ok = await proveIt(name, secrets, async () => {
    const again = await collect();
    if (again) secrets.splice(0, secrets.length, ...again);
    return again;
  });
  if (!ok) {
    console.log(`\n  nothing is broken on disk: the channel is in config.json and the secret is`);
    console.log(`  in .env. Re-run \`jarvis connect ${key}\` when you have fixed the platform side.`);
    return;
  }
  await followUps(key, name);
}

async function followUps(key, name) {
  console.log(`\n  ${name} works. Two things worth doing now.`);
  await attachToAgent(name);
  if (key === "telegram") await offerInbox();
  console.log(`\n  see what is hooked up any time:  jarvis connect --status\n`);
}

/* ---------- the menu ---------- */

async function menu() {
  console.log(`
  Chat delivery: Jarvis posts what an agent wrote to a channel you already
  look at. Pick one; you can add another later by running this again.
`);
  const keys = Object.keys(PLATFORMS);
  keys.forEach((k, i) => {
    console.log(`  ${i + 1}) ${PLATFORMS[k].label.padEnd(10)} ${PLATFORMS[k].effort}`);
  });
  const a = (await ask(`\n  which one (1-${keys.length}, or a name)`, "1")).toLowerCase();
  const byNumber = keys[parseInt(a, 10) - 1];
  const key = byNumber || ALIASES[a] || (PLATFORMS[a] ? a : null);
  if (!key) {
    console.log(`  no such platform: ${a}`);
    return;
  }
  await runPlatform(key);
}

/* ---------- --status ---------- */

/* One screen answering "what is hooked up right now". Reads .env from disk
 * rather than the process environment, so it can tell a key that will survive
 * a reboot from one that came from this shell. Prints no secret values. */
function status() {
  const cfg = load();
  const fileEnv = loadEnvFile(ENV_FILE);
  const chans = notifyLib.channels(cfg);
  const names = Object.keys(chans);
  const agents = require(path.join(ROOT, "lib", "agents")).list(cfg);

  console.log("\n  CHANNELS");
  if (!names.length) {
    console.log("    none. `jarvis connect` sets the first one up in about a minute.");
  } else {
    for (const n of names) {
      const r = notifyLib.resolve(cfg, n);
      const users = agents.filter((a) => (a.notify || []).includes(n)).map((a) => a.name);
      console.log(`    ${r.ok ? "ON " : "off"}  ${n.padEnd(12)} ${(r.provider || "?").padEnd(9)} ${users.length ? `-> ${users.join(", ")}` : "no agent sends to it"}`);
      for (const s of r.slots || []) {
        const where = fileEnv[s.from] !== undefined ? "in .env"
          : process.env[s.from] ? "in this shell only, not in .env"
          : "MISSING";
        console.log(`         ${s.from.padEnd(24)} ${where}`);
      }
      if (!r.ok) console.log(`         ${r.reason}`);
    }
  }

  console.log("\n  AGENTS THAT DELIVER");
  const senders = agents.filter((a) => (a.notify || []).length);
  if (!senders.length) {
    console.log("    none. Add one with `jarvis connect`, or agents.<name>.notify in config.json.");
  } else {
    for (const a of senders) {
      const bad = a.notify.filter((n) => !chans[n]);
      console.log(`    ${a.name.padEnd(12)} ${a.notify.join(", ").padEnd(20)} ${a.notify_when}, ${a.notify_mode}${bad.length ? `   <- no such channel: ${bad.join(", ")}` : ""}`);
    }
  }

  const s = inboxLib.status();
  console.log("\n  PHONE INBOX");
  console.log(`    ${inboxLib.line(s)}`);
  if (s.configured)
    console.log(`    allowed chats  ${s.allowed.join(", ")}; anything else is ignored`);

  const first = names.find((n) => !notifyLib.resolve(cfg, n).ok);
  console.log(first
    ? `\n  next: jarvis connect ${String((chans[first] || {}).provider || "")}   (finishes "${first}")\n`
    : names.length
      ? `\n  prove one again any time: jarvis notify test ${names[0]}\n`
      : `\n  start here: jarvis connect\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  load();  // puts .env into process.env, same as every other command
  if (argv.includes("--status") || argv[0] === "status") {
    status();
    return;
  }
  const raw = String(argv[0] || "").toLowerCase();
  if (raw && raw.startsWith("-")) {
    console.error("usage: jarvis connect [ntfy | discord | slack | telegram | webhook | --status]");
    process.exitCode = 1;
    return;
  }
  if (!raw) return menu();
  const key = ALIASES[raw] || (PLATFORMS[raw] ? raw : null);
  if (!key) {
    console.error(`  no such platform: ${raw}`);
    console.error(`  known: ${Object.keys(PLATFORMS).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  return runPlatform(key);
}

main()
  .then(() => rl.close())
  .catch((e) => {
    console.error(`  ${e && e.message ? e.message : e}`);
    rl.close();
    process.exit(1);
  });
