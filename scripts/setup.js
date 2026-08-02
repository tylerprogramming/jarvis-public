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
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const ask = (q, def = "") =>
  new Promise((resolve) => {
    rl.question(def ? `${q} [${def}]: ` : `${q}: `, (a) => resolve(a.trim() || def));
  });

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

async function main() {
  console.log(`
  J.A.R.V.I.S. setup
  ------------------
  Everything you enter goes in config.json (gitignored). API keys go in .env.
  Press enter to accept a default, and you can change any of it later.
`);

  // ---- prerequisites
  const claude = has("claude");
  console.log(`  claude code : ${claude ? "found" : "MISSING - chat and agents will not run"}`);
  if (!claude) {
    console.log(`                install: https://claude.com/claude-code`);
    console.log(`                or point brain.openai.base_url at a local model later`);
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
        console.log("  install failed - you can retry later with: jarvis ytdlp install");
      }
    }
  }
  console.log();

  const cfg = readJson(path.join(ROOT, "config.json"), {});
  const prev = (p, d) => p ?? d;

  // ---- identity
  console.log("  WHO ARE YOU");
  const owner = await ask("  Your name", prev(cfg.profile?.owner, ""));
  const about = await ask(
    "  One line about what you do (Jarvis uses this for topic picks)",
    prev(cfg.profile?.about, ""),
  );
  const workingHours = await ask(
    "  Your real working windows (optional, e.g. 'weekdays 4-6pm, Sat mornings')",
    prev(cfg.profile?.working_hours, ""),
  );

  // ---- channels
  console.log("\n  CHANNELS (leave blank to skip any)");
  const youtube = await ask("  YouTube handle (@name)", prev(cfg.profile?.channels?.youtube, ""));
  const instagram = await ask("  Instagram handle", prev(cfg.profile?.channels?.instagram, ""));
  const tiktok = await ask("  TikTok handle", prev(cfg.profile?.channels?.tiktok, ""));
  const linkedin = await ask("  LinkedIn handle", prev(cfg.profile?.channels?.linkedin, ""));
  const x = await ask("  X handle", prev(cfg.profile?.channels?.x, ""));

  // ---- goal
  console.log("\n  THE NUMBER YOU CARE ABOUT");
  const target = Number(
    await ask("  Subscriber target", String(prev(cfg.primary_cards?.[1]?.target, 100000))),
  );

  // ---- radar
  console.log("\n  RADAR (channels to watch for breakout videos)");
  const radarRaw = await ask(
    "  Comma-separated handles, blank to skip",
    (cfg.radar?.channels || []).join(", "),
  );
  const radarChannels = radarRaw.split(",").map((s) => s.trim()).filter(Boolean);

  console.log("\n  RESEARCH LANES (topics the scout agent sweeps weekly)");
  const lanesRaw = await ask(
    "  Comma-separated, blank to let Jarvis infer them",
    (cfg.research?.lanes || []).join(", "),
  );
  const lanes = lanesRaw.split(",").map((s) => s.trim()).filter(Boolean);

  // ---- voice
  console.log("\n  VOICE");
  console.log("  Jarvis speaks for free out of the box (your system voice).");
  console.log("  Better free option: run Kokoro locally. Best: an ElevenLabs key.");
  const elevenKey = await ask("  ElevenLabs API key (optional, enter to skip)", "");
  const kokoro = await askYes("  Do you run a local Kokoro/OpenAI-speech server", false);

  console.log("\n  MICROPHONE");
  console.log("  Local Whisper keeps your audio on this machine. Without it,");
  console.log("  the browser handles speech and sends audio to Google.");
  const openaiKey = await ask("  OpenAI key for Whisper (optional, enter to skip)", "");

  // ---- agents
  console.log("\n  AGENTS");
  const enableAll = await askYes("  Enable the standard agents (morning, radar, postmortem, scout, study, weekly)", true);

  // ---- write config.json
  const next = {
    profile: {
      owner,
      about,
      working_hours: workingHours,
      channels: { youtube, instagram, tiktok, linkedin, x },
    },
    primary_cards: [
      { label: "TOTAL AUDIENCE", metric: "audience", target: Math.round(target / 4), unit: "FOLLOWERS" },
      { label: "SUBSCRIBERS", metric: "yt_subs", target, unit: "SUBS" },
    ],
    radar: { ...(cfg.radar || {}), channels: radarChannels },
    research: { lanes },
    agents: {
      enabled: enableAll
        ? ["morning", "radar", "postmortem", "scout", "study", "weekly-review"]
        : ["morning"],
    },
  };
  if (kokoro) next.voice = { chain: ["kokoro", "elevenlabs", "system", "browser"] };

  fs.writeFileSync(path.join(ROOT, "config.json"), JSON.stringify(next, null, 2) + "\n");
  console.log("\n  wrote config.json");

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
      console.log("  fetch failed - run `jarvis collect --fetch` later to retry");
    }
  }

  console.log(`
  Done. Next:

    npm start              open http://localhost:4747
    jarvis agents install  put the agents on a schedule
    jarvis doctor          check what is wired up

  To teach Jarvis your own commands, create PERSONA.md in this folder.
`);
  rl.close();
}

main().catch((e) => {
  console.error(e);
  rl.close();
  process.exit(1);
});
