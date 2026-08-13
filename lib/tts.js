/* Text to speech with a fallback chain, so Jarvis talks with no API key.
 *
 *   elevenlabs  paid, best quality, needs ELEVENLABS_API_KEY
 *   kokoro      free, local, Apache-2.0, 54 voices, runs on CPU
 *               (any OpenAI-compatible /v1/audio/speech server works)
 *   piper       free, local, MIT, fastest on small hardware
 *   system      macOS `say` / Linux `espeak-ng`, zero install
 *   browser     handled client side by speechSynthesis, always available
 *
 * Each provider returns {buffer, mime} or null, and we walk the configured
 * chain until one answers. "browser" is a sentinel: the server reports it and
 * the page speaks locally.
 */
const { execFile, spawn } = require("child_process");
const { expand } = require("./config");
const { has } = require("./util");
const fs = require("fs");
const os = require("os");
const path = require("path");

const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 30000, ...opts }, (err) => resolve(!err));
  });


async function elevenlabs(text, cfg) {
  const key = process.env.ELEVENLABS_API_KEY;
  const v = cfg.voice.elevenlabs || {};
  if (!key || !v.voice_id) return null;
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${v.voice_id}/stream?optimize_streaming_latency=2`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: v.model_id || "eleven_flash_v2_5",
        voice_settings: {
          stability: v.stability ?? 0.45,
          similarity_boost: v.similarity_boost ?? 0.75,
        },
      }),
    },
  );
  if (!r.ok) return null;
  return { buffer: Buffer.from(await r.arrayBuffer()), mime: "audio/mpeg" };
}

/* Kokoro via any OpenAI-compatible speech endpoint (kokoro-fastapi, LM Studio,
 * Speaches, openedai-speech). Free, local, and genuinely good. */
async function kokoro(text, cfg) {
  const k = cfg.voice.kokoro || {};
  if (!k.url) return null;
  let r;
  try {
    r = await fetch(k.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.KOKORO_API_KEY
          ? { Authorization: `Bearer ${process.env.KOKORO_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        model: k.model || "kokoro",
        input: text,
        voice: k.voice || "am_michael",
        speed: k.speed ?? 1.0,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return null; // server not running - fall through to the next provider
  }
  if (!r.ok) return null;
  // honour what the server actually sent: kokoro-fastapi returns mp3, the
  // native kokoro-onnx server returns wav. Assuming mp3 mislabels the audio.
  const mime = (r.headers.get("content-type") || "audio/mpeg").split(";")[0].trim();
  return { buffer: Buffer.from(await r.arrayBuffer()), mime };
}

async function piper(text, cfg) {
  const p = cfg.voice.piper || {};
  const bin = expand(p.binary || "piper");
  const model = p.model ? expand(p.model) : "";
  if (!model || !fs.existsSync(model) || !(await has(bin))) return null;
  const out = path.join(os.tmpdir(), `jarvis-piper-${process.pid}-${Date.now()}.wav`);
  const ok = await new Promise((resolve) => {
    const child = spawn(bin, ["--model", model, "--output_file", out]);
    const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
    child.on("error", () => { clearTimeout(timer); resolve(false); });
    child.on("close", (code) => { clearTimeout(timer); resolve(code === 0); });
    child.stdin.end(text); // piper reads the line to speak from stdin
  });
  if (!ok || !fs.existsSync(out)) return null;
  const buffer = fs.readFileSync(out);
  try { fs.unlinkSync(out); } catch {}
  return { buffer, mime: "audio/wav" };
}

/* macOS `say`, Windows SAPI, Linux `espeak-ng`. Robotic, but installed already. */
async function system(text, cfg) {
  const s = cfg.voice.system || {};
  const out = path.join(os.tmpdir(), `jarvis-say-${process.pid}-${Date.now()}.aiff`);

  /* Windows ships a speech engine in the OS - System.Speech drives the same
   * SAPI voices as the Narrator settings page, so there is nothing to install.
   * Text goes in through an argument rather than being interpolated into the
   * script: a reply containing a quote would otherwise end the string and the
   * rest would be executed as PowerShell. */
  if (process.platform === "win32") {
    const wav = out.replace(/\.aiff$/, ".wav");
    const ps = [
      "param([string]$Text,[string]$Out)",
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      s.voice ? `try { $s.SelectVoice(${JSON.stringify(s.voice)}) } catch {}` : "",
      s.rate ? `$s.Rate = ${Math.max(-10, Math.min(10, Number(s.rate) || 0))}` : "",
      "$s.SetOutputToWaveFile($Out)",
      "$s.Speak($Text)",
      "$s.Dispose()",
    ].filter(Boolean).join("; ");
    const ok = await run("powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps, "-Text", text, "-Out", wav]);
    if (!ok || !fs.existsSync(wav)) return null;
    const buffer = fs.readFileSync(wav);
    try { fs.unlinkSync(wav); } catch {}
    return { buffer, mime: "audio/wav" };
  }

  if (process.platform === "darwin" && (await has("say"))) {
    const args = ["-o", out];
    if (s.voice) args.push("-v", s.voice);
    if (s.rate) args.push("-r", String(s.rate));
    args.push(text);
    if (!(await run("say", args)) || !fs.existsSync(out)) return null;
    const buffer = fs.readFileSync(out);
    try { fs.unlinkSync(out); } catch {}
    return { buffer, mime: "audio/aiff" };
  }
  if (await has("espeak-ng")) {
    const wav = out.replace(/\.aiff$/, ".wav");
    if (!(await run("espeak-ng", ["-w", wav, text])) || !fs.existsSync(wav)) return null;
    const buffer = fs.readFileSync(wav);
    try { fs.unlinkSync(wav); } catch {}
    return { buffer, mime: "audio/wav" };
  }
  return null;
}

const PROVIDERS = { elevenlabs, kokoro, piper, system };

async function speak(text, cfg) {
  const chain = (cfg.voice && cfg.voice.chain) || ["system", "browser"];
  for (const name of chain) {
    if (name === "browser") return { browser: true };
    const fn = PROVIDERS[name];
    if (!fn) continue;
    try {
      const res = await fn(text, cfg);
      if (res) return { ...res, provider: name };
    } catch {
      // a broken provider must never block the chain
    }
  }
  return { browser: true };
}

async function piperReady(p) {
  const model = p.model ? expand(p.model) : "";
  if (!model || !fs.existsSync(model)) return false;
  return has(p.binary ? expand(p.binary) : "piper");
}

/* Reports which providers are actually usable right now, for `jarvis doctor`
 * and the settings panel. */
async function status(cfg) {
  const k = cfg.voice.kokoro || {};
  let kokoroUp = false;
  if (k.url) {
    try {
      const base = new URL(k.url);
      const probe = await fetch(`${base.origin}/v1/models`, {
        signal: AbortSignal.timeout(1500),
      });
      kokoroUp = probe.ok;
    } catch {
      kokoroUp = false;
    }
  }
  return {
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    kokoro: kokoroUp,
    // same rule as stt: ready means it would actually speak, so the model file
    // has to exist, not merely be named in config
    piper: await piperReady(cfg.voice.piper || {}),
    system:
      (process.platform === "darwin" && (await has("say")))
      || process.platform === "win32"            // SAPI ships with the OS
      || (await has("espeak-ng")),
    browser: true,
  };
}

module.exports = { speak, status };
