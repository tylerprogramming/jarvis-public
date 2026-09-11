#!/usr/bin/env node
/* First-run wizard. Writes config.json and .env, then offers to fetch a first
 * set of numbers so the HUD has something to draw.
 *
 * Every question has a usable default, and the whole thing is skippable -
 * Jarvis runs on config.default.json alone, it just will not know who you are.
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execFileSync } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
/* A line queue rather than rl.question().
 *
 * readline.question only captures a line while a question is outstanding, so
 * with piped or scripted input the lines arriving in between are dropped on
 * the floor and the interface then closes early - after which question()
 * throws ERR_USE_AFTER_CLOSE rather than returning anything. Buffering every
 * line and handing them out on demand makes a scripted run behave like a typed
 * one, and a closed stdin yields defaults instead of a stack trace.
 */
const rl = readline.createInterface({ input: process.stdin });
const buffered = [];   // lines that arrived with nobody waiting
const waiting = [];    // askers waiting for a line
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

/* Keys are typed without echo.
 *
 * The terminal echoes what readline reads, so a pasted key sat in the
 * scrollback in full, where it is one copy-paste away from a chat log or a
 * screenshot. Raw mode turns the echo off; the line still arrives through the
 * same queue, so scripted and piped input behave exactly as before. Raw mode
 * also hands over backspace and ctrl-c as bytes, so both are handled here. */
const askSecret = async (q) => {
  const tty = process.stdin.isTTY && typeof process.stdin.setRawMode === "function";
  if (!tty) return ask(q, "");
  process.stdin.setRawMode(true);
  let line;
  try { line = await ask(q, ""); } finally { process.stdin.setRawMode(false); }
  process.stdout.write("\n");
  if (line.includes("\u0003")) { rl.close(); process.exit(130); }
  let out = "";
  for (const c of line) out = c === "\u007f" || c === "\b" ? out.slice(0, -1) : out + c;
  return out.trim();
};

const askYes = async (q, def = true) => {
  const a = await ask(`${q} (y/n)`, def ? "y" : "n");
  return /^y/i.test(a);
};

const has = (cmd) => {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

function readJson(file, fb) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fb; }
}

/* Make `jarvis` an actual command.
 *
 * package.json declares a bin, but a git clone is not an npm install, so
 * nothing links it. The README told people to run `jarvis doctor` for weeks
 * and it never once worked on a fresh machine. Telling someone to type
 * `node bin/jarvis doctor` instead is not a fix, it is the same problem
 * written out longer.
 *
 * The npm global bin directory is the right target: anyone who has npm has it,
 * it is already on PATH, and on a Mac that installed node through Homebrew it
 * is user-writable, so no sudo. Falls back to a shell alias, then to printing
 * the command to run by hand. It never silently does nothing.
 */
async function linkCommand() {
  const src = path.join(ROOT, "bin", "jarvis");
  if (has("jarvis")) {
    console.log(`  jarvis cmd  : already on your PATH`);
    return "jarvis";
  }

  let dir = null;
  try {
    dir = path.join(execFileSync("npm", ["prefix", "-g"], { encoding: "utf8" }).trim(), "bin");
  } catch {}

  const onPath = (d) => (process.env.PATH || "").split(":").includes(d);
  const writable = (d) => {
    try { fs.accessSync(d, fs.constants.W_OK); return true; } catch { return false; }
  };

  console.log(`  jarvis cmd  : not on your PATH (cloning does not install it)`);
  if (!(await askYes("  Add a `jarvis` command so you can type `jarvis doctor`", true)))
    return `node ${src}`;

  if (dir && onPath(dir) && writable(dir)) {
    const dest = path.join(dir, "jarvis");
    try {
      fs.rmSync(dest, { force: true });
      fs.symlinkSync(src, dest);
      fs.chmodSync(src, 0o755);
      console.log(`                linked ${dest}`);
      return "jarvis";
    } catch (e) {
      console.log(`                could not link there: ${e.message}`);
    }
  }

  // Nothing writable already on PATH, so fall back to the shell profile.
  const rc = /zsh/.test(process.env.SHELL || "") ? ".zshrc" : ".bashrc";
  const file = path.join(process.env.HOME || "", rc);
  try {
    const line = `alias jarvis='node ${src}'`;
    const cur = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (!cur.includes(line)) fs.appendFileSync(file, `\n# jarvis\n${line}\n`);
    console.log(`                added an alias to ~/${rc}`);
    console.log(`                run \`source ~/${rc}\`, or open a new terminal`);
    return "jarvis";
  } catch (e) {
    console.log(`                could not write ~/${rc}: ${e.message}`);
    console.log(`                add this by hand: alias jarvis='node ${src}'`);
    return `node ${src}`;
  }
}

/* Two of the standard agents need an MCP server the operator may already
 * have: social reads the non-YouTube counts through Apify, calendar reads the
 * publishing strip from Blotato. Without this, the very next step ran the
 * brief, both agents printed "skipped: config is missing apify", and the
 * person had just been shown an Apify server in the list above. Asked, never
 * assumed, one at a time, default no: Apify bills per run. */
async function offerAgentServers(servers, state) {
  const file = path.join(ROOT, "config.json");
  const current = readJson(file, {}).chat?.mcp_servers;
  if (current === "all") return;
  const allowed = Array.isArray(current) ? [...current] : [];
  const wants = [
    { kind: /apify/i, when: state.instagram || state.tiktok || state.linkedin || state.x,
      why: "The social agent pulls your Instagram, TikTok, LinkedIn and X counts\n  through Apify. Apify bills per run, a few cents each morning." },
    { kind: /blotato/i, when: true,
      why: "The calendar agent fills the week's publishing strip from Blotato." },
  ];
  let changed = false;
  for (const w of wants) {
    const hit = servers.find((x) => w.kind.test(x.name));
    if (!hit || !w.when || allowed.some((n) => n.toLowerCase() === hit.name.toLowerCase())) continue;
    console.log(`\n  ${w.why}`);
    if (await askYes(`  Let Jarvis use "${hit.name}"`, false)) { allowed.push(hit.name); changed = true; }
  }
  if (!changed) return;
  require("../lib/config").save({ chat: { mcp_servers: allowed } });
  console.log(`  allowed: ${allowed.join(", ")}`);
}

/* True when a Jarvis is already answering on the configured port, so the
 * closing message can say the settings are live rather than telling someone
 * to start what is already running. One second, then assume not. */
async function serverUp() {
  const port = readJson(path.join(ROOT, "config.json"), {}).server?.port
    || readJson(path.join(ROOT, "config.default.json"), {}).server?.port || 4747;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/config`, { signal: AbortSignal.timeout(1000) });
    return r.ok ? port : null;
  } catch { return null; }
}

async function main() {
  console.log(`
  J.A.R.V.I.S. setup
  ------------------
  Everything you enter goes in config.json (gitignored). API keys go in .env.
  Press enter to accept a default, and you can change any of it later.
`);

  // ---- prerequisites
  const claude = has("claude");
  console.log(`  claude code : ${claude ? "found - this is the brain behind chat and agents" : "MISSING - chat and agents will not run"}`);
  if (!claude) {
    console.log(`                It is what reads your files and writes the reports.`);
    console.log(`                You already have npm, so:`);
    console.log(``);
    console.log(`                  npm install -g @anthropic-ai/claude-code`);
    console.log(`                  claude          # once, to sign in`);
    console.log(``);
    console.log(`                Then re-run this setup. No Claude Code? Jarvis also`);
    console.log(`                runs on any OpenAI-compatible endpoint, including a`);
    console.log(`                local model - set brain.openai.base_url in config.json.`);
  }

  // A yt-dlp on PATH is not enough: an old one still answers --version and
  // then fails every request. Offer the bundled build rather than leaving the
  // user with a dashboard full of zeroes and no idea why.
  let ytdlp = fs.existsSync(path.join(ROOT, "bin", "yt-dlp")) || has("yt-dlp");
  console.log(`  yt-dlp      : ${ytdlp ? "found" : "MISSING - YouTube numbers will be blank"}`);
  if (!ytdlp) {
    console.log(`                Jarvis can install its own copy. It bundles python,`);
    console.log(`                so it needs no brew, no pip, and no system python.`);
    if (await askYes("  Install it now (about 38MB)", true)) {
      try {
        execFileSync("bash", [path.join(ROOT, "scripts", "ytdlp.sh"), "install"], {
          stdio: "inherit",
        });
        ytdlp = fs.existsSync(path.join(ROOT, "bin", "yt-dlp"));
      } catch {
        console.log(`  install failed - retry later with: node ${path.join(ROOT,"bin","jarvis")} ytdlp install`);
      }
    }
  }
  const CMD = await linkCommand();
  console.log();

  const cfg = readJson(path.join(ROOT, "config.json"), {});
  const prev = (p, d) => p ?? d;

  // ---- the two things Jarvis genuinely cannot guess
  console.log("  THE BASICS");
  const owner = await ask("  Your name", prev(cfg.profile?.owner, ""));
  const youtube = await ask(
    "  YouTube handle (@name, blank to skip)",
    prev(cfg.profile?.channels?.youtube, ""),
  );

  /* Write immediately, and again after anything optional.
   *
   * This used to build one object at the very end, after fifteen questions, so
   * quitting partway through left no config.json at all - the user answered
   * everything and got nothing. Now the basics are on disk before anything
   * else is asked, and every later answer just updates the same file.
   */
  const ch = cfg.profile?.channels || {};
  const state = {
    about: prev(cfg.profile?.about, ""),
    workingHours: prev(cfg.profile?.working_hours, ""),
    instagram: prev(ch.instagram, ""), tiktok: prev(ch.tiktok, ""),
    linkedin: prev(ch.linkedin, ""), x: prev(ch.x, ""),
    target: Number(prev(cfg.primary_cards?.[1]?.target, 100000)),
    radarChannels: cfg.radar?.channels || [],
    lanes: cfg.research?.lanes || [],
    kokoro: false,
    agents: cfg.agents?.enabled ||
      /* The shipped baseline, not a copy of it. Restating the list here is how
       * `watchdog` came to be switched off by running setup: arrays replace
       * wholesale, so an out-of-date literal silently disables whatever it
       * forgot. */
      JSON.parse(fs.readFileSync(path.join(ROOT, "config.default.json"), "utf8")).agents.enabled,
  };

  const writeConfig = () => {
    /* On top of whatever is there now, not the object read at the start:
     * `jarvis mcp allow` and the MCP step below write the same file while
     * this is running, and a re-run of setup used to wipe notify channels,
     * chat settings and anything else it did not ask about. */
    const next = {
      ...readJson(path.join(ROOT, "config.json"), {}),
      profile: {
        owner,
        about: state.about,
        working_hours: state.workingHours,
        channels: {
          youtube, instagram: state.instagram, tiktok: state.tiktok,
          linkedin: state.linkedin, x: state.x,
        },
      },
      primary_cards: [
        { label: "TOTAL AUDIENCE", metric: "audience",
          target: Math.round(state.target / 4), unit: "FOLLOWERS" },
        { label: "SUBSCRIBERS", metric: "yt_subs", target: state.target, unit: "SUBS" },
      ],
      radar: { ...(cfg.radar || {}), channels: state.radarChannels },
      research: { lanes: state.lanes },
      agents: { enabled: state.agents },
    };
    if (state.kokoro) next.voice = { chain: ["kokoro", "elevenlabs", "system", "browser"] };
    fs.writeFileSync(path.join(ROOT, "config.json"), JSON.stringify(next, null, 2) + "\n");
    return next;
  };

  writeConfig();
  console.log("  wrote config.json - you are set up.\n");

  // ---- everything else, only if they want it now
  let elevenKey = "", openaiKey = "";
  // ---- voice, offered up front because it is the thing people actually want
  console.log("  VOICE");
  console.log("  Out of the box Jarvis speaks with your system voice and hears");
  console.log("  you through the browser. Kokoro runs a much better voice");
  console.log("  locally, for free, and nothing leaves this machine.");
  if (await askYes("  Install Kokoro now (a few minutes, ~350MB)", false)) {
    try {
      execFileSync("bash", [path.join(ROOT, "scripts", "voice.sh"), "install"], { stdio: "inherit" });
      state.kokoro = true;
      writeConfig();
      console.log("  kokoro installed and put first in the voice chain");
      if (await askYes("  Start it now", true)) {
        try { execFileSync("bash", [path.join(ROOT, "scripts", "voice.sh"), "start"], { stdio: "inherit" }); }
        catch { console.log(`  did not start - try ${CMD} voice start`); }
      }
      console.log(`  it does not survive a reboot; ${CMD} voice start brings it back`);
    } catch {
      console.log(`  install did not finish - retry later with: ${CMD} voice install`);
    }
  } else {
    console.log(`  fine - the system voice works today. ${CMD} voice install adds Kokoro later.`);
  }
  console.log();

  console.log("  The rest has working defaults: browser mic, the standard agents");
  console.log("  on, radar off until you name a channel. All of it is editable");
  console.log("  later in Settings, or in config.json.");

  if (await askYes("  Set those up now instead", false)) {
    state.about = await ask("\n  One line on what you do (Jarvis uses it for topic picks)", state.about);
    state.workingHours = await ask("  Your real working windows (e.g. 'weekdays 4-6pm')", state.workingHours);

    console.log("\n  OTHER CHANNELS (blank to skip any)");
    state.instagram = await ask("  Instagram handle", state.instagram);
    state.tiktok = await ask("  TikTok handle", state.tiktok);
    state.linkedin = await ask("  LinkedIn handle", state.linkedin);
    state.x = await ask("  X handle", state.x);

    state.target = Number(await ask("\n  Subscriber target", String(state.target))) || state.target;

    const radarRaw = await ask(
      "\n  RADAR - channels to watch, comma separated (blank to skip)",
      state.radarChannels.join(", "),
    );
    state.radarChannels = radarRaw.split(",").map((t) => t.trim()).filter(Boolean);

    const lanesRaw = await ask(
      "  RESEARCH LANES - topics the scout sweeps, comma separated",
      state.lanes.join(", "),
    );
    state.lanes = lanesRaw.split(",").map((t) => t.trim()).filter(Boolean);

    console.log("\n  Keys are not echoed as you type or paste them.");
    elevenKey = await askSecret("  ElevenLabs key, if you want the paid voice (optional)");
    openaiKey = await askSecret("  OpenAI key for hosted Whisper (optional)");

    if (!(await askYes("\n  Enable the standard agents", true))) state.agents = ["brief"];

    writeConfig();
    console.log("\n  updated config.json");
  }

  // ---- write .env
  const envFile = path.join(ROOT, ".env");
  const envLines = [];
  const existingEnv = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  if (elevenKey && !existingEnv.includes("ELEVENLABS_API_KEY"))
    envLines.push(`ELEVENLABS_API_KEY=${elevenKey}`);
  if (openaiKey && !existingEnv.includes("OPENAI_API_KEY"))
    envLines.push(`OPENAI_API_KEY=${openaiKey}`);
  if (!existingEnv.includes("JARVIS_TOKEN"))
    envLines.push(
      `# Only needed if you expose Jarvis beyond localhost. See docs/SECURITY.md.`,
      `# JARVIS_TOKEN=${crypto.randomBytes(24).toString("hex")}`,
    );
  if (envLines.length) {
    fs.appendFileSync(envFile, (existingEnv && !existingEnv.endsWith("\n") ? "\n" : "") + envLines.join("\n") + "\n");
    console.log("  wrote .env");
  }

  // ---- seed data
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  const directives = path.join(ROOT, "data", "directives.json");
  if (!fs.existsSync(directives)) {
    fs.copyFileSync(path.join(ROOT, "data", "directives.example.json"), directives);
    console.log("  seeded data/directives.json");
  }

  // ---- first fetch
  if (youtube && ytdlp && (await askYes("\n  Pull your numbers now (takes ~30s)", true))) {
    console.log("  fetching...");
    try {
      execFileSync("python3", [path.join(ROOT, "scripts", "collect.py"), "--fetch"], {
        stdio: ["ignore", "ignore", "inherit"],
      });
      const v = readJson(path.join(ROOT, "data", "vitals.json"), {});
      console.log(`  got it: ${v.yt_subs?.toLocaleString?.() ?? "?"} subscribers, latest video "${v.yt_latest?.title ?? "unknown"}"`);
    } catch {
      console.log(`  fetch failed - run \`${CMD} collect --fetch\` later to retry`);
    }
  }

  /* Surface MCP here rather than letting people find out by having a request
     fail. Anything already configured for the claude CLI is one command away,
     but it is off until asked for, because these tools send and post. */
  try {
    const { servers, error } = await require("../lib/mcp").discover({ timeout: 25000 });
    if (error) {
      console.log(`\n  Could not check your MCP servers (${error}).\n  Run \`${CMD} mcp\` later to see them.`);
    } else if (servers.length) {
      console.log(`
  You have ${servers.length} MCP server(s) set up for the claude CLI:
    ${servers.map((x) => x.name).join(", ")}

  Jarvis cannot use them until you say so. A connected server that is not
  allowed fails as if it were offline, so turn on the ones you want:

    ${CMD} mcp                 see them all
    ${CMD} mcp allow <name>    turn one on`);
      await offerAgentServers(servers, state);
    }
  } catch {
    // no claude CLI, or it timed out. Not worth failing setup over.
  }

  /* An empty HUD is a bad first impression and an avoidable one.
   *
   * Without this, setup ends and the dashboard shows zeroes, no reports, and no
   * directives until the first scheduled agent fires tomorrow morning. One run
   * now means the first thing they see is their own numbers, a real report in
   * the trail, and three things to do. */
  if (youtube && claude && (await askYes("\n  Run the brief once so the dashboard is not empty (~1 min)", true))) {
    console.log("  running...");
    try {
      execFileSync("node", [path.join(ROOT, "bin", "jarvis"), "agent", "brief"], { stdio: "inherit" });
    } catch {
      console.log(`  that did not finish - you can retry with: ${CMD} agent brief`);
    }
  }

  /* Pad against the longest line so the descriptions line up whatever CMD is.
   * When jarvis is not on PATH, CMD is `node /long/path/bin/jarvis` and a
   * fixed-width pad collapses to a single space, which reads as part of the
   * command: people paste `... doctor check what is wired up` and get
   * `unknown command`. Two spaces minimum, always. */
  const port = await serverUp();
  const nextSteps = [
    port ? [`http://localhost:${port}`, "already running, and it has picked up these settings"]
         : ["npm start", "open http://localhost:4747"],
    [`${CMD} doctor`, "check what is wired up"],
    [`${CMD} agents install`, "put the agents on a schedule"],
  ];
  const width = Math.max(...nextSteps.map(([c]) => c.length));
  console.log(`
  Done. Next:

${nextSteps.map(([c, d]) => `    ${c.padEnd(width)}  ${d}`).join("\n")}

  To teach Jarvis your own commands, create PERSONA.md in this folder.
`);
  rl.close();
}

main().catch((e) => {
  console.error(e);
  rl.close();
  process.exit(1);
});
