/* Speech to text with a fallback chain, mirroring lib/tts.js.
 *
 *   local     whisper running on this machine. Either an OpenAI-compatible
 *             server (Speaches, faster-whisper-server, whisper.cpp --server)
 *             or the whisper.cpp / faster-whisper CLI. Free, offline, private.
 *   openai    the hosted Whisper endpoint, only if the user supplies a key.
 *   browser   the page's SpeechRecognition API. Zero install, Chrome only,
 *             and the audio leaves the machine, so it is the last resort.
 *
 * Everything takes an audio Buffer and returns {text} or null.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFile } = require("child_process");

const has = (cmd) =>
  new Promise((resolve) => execFile("which", [cmd], (err) => resolve(!err)));

function tmp(ext) {
  return path.join(os.tmpdir(), `jarvis-stt-${process.pid}-${Date.now()}.${ext}`);
}

function cleanup(...files) {
  for (const f of files) {
    try { fs.unlinkSync(f); } catch {}
  }
}

/* Whisper CLIs want 16 kHz mono wav; browsers record webm/opus. */
async function toWav(buf, mime) {
  if (!(await has("ffmpeg"))) return null;
  const ext = /wav/.test(mime) ? "wav" : /ogg/.test(mime) ? "ogg" : /mp4|m4a/.test(mime) ? "m4a" : "webm";
  const src = tmp(ext);
  const out = tmp("wav");
  fs.writeFileSync(src, buf);
  const ok = await new Promise((resolve) => {
    execFile(
      "ffmpeg",
      ["-y", "-i", src, "-ar", "16000", "-ac", "1", "-f", "wav", out],
      { timeout: 60000 },
      (err) => resolve(!err),
    );
  });
  cleanup(src);
  if (!ok || !fs.existsSync(out)) {
    cleanup(out);
    return null;
  }
  return out;
}

async function postAudio(url, buf, mime, { model, language, key }) {
  const form = new FormData();
  const ext = /wav/.test(mime) ? "wav" : "webm";
  form.append("file", new Blob([buf], { type: mime }), `audio.${ext}`);
  if (model) form.append("model", model);
  if (language) form.append("language", language);
  form.append("response_format", "json");
  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      body: form,
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    return null;
  }
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  const text = data && (data.text || data.transcript);
  return text ? { text: String(text).trim() } : null;
}

/* Local whisper: try the configured server first, then the CLI. */
async function local(buf, mime, cfg) {
  const l = (cfg.stt && cfg.stt.local) || {};

  if (l.url) {
    const viaServer = await postAudio(l.url, buf, mime, {
      model: l.model || "Systran/faster-whisper-small",
      language: l.language || undefined,
      key: process.env.WHISPER_API_KEY,
    });
    if (viaServer) return viaServer;
  }

  const bin = l.binary || "whisper-cli";
  if (!(await has(bin))) return null;

  const wav = await toWav(buf, mime);
  if (!wav) return null;

  // whisper.cpp writes <input>.txt next to the wav with --output-txt.
  const isWhisperCpp = /whisper-cli|whisper\.cpp|main$/.test(bin);
  const args = isWhisperCpp
    ? [
        ...(l.model_path ? ["-m", l.model_path] : []),
        "-f", wav,
        "--output-txt",
        "--no-timestamps",
        ...(l.language ? ["-l", l.language] : []),
      ]
    : [wav, "--model", l.model || "small", "--output_format", "txt",
       "--output_dir", path.dirname(wav), ...(l.language ? ["--language", l.language] : [])];

  const ok = await new Promise((resolve) => {
    const child = spawn(bin, args, { timeout: 180000 });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });

  const txtFile = isWhisperCpp
    ? wav + ".txt"
    : path.join(path.dirname(wav), path.basename(wav, ".wav") + ".txt");
  let text = null;
  if (ok && fs.existsSync(txtFile)) text = fs.readFileSync(txtFile, "utf8").trim();
  cleanup(wav, txtFile);
  return text ? { text } : null;
}

async function openai(buf, mime, cfg) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const o = (cfg.stt && cfg.stt.openai) || {};
  return postAudio(o.url || "https://api.openai.com/v1/audio/transcriptions", buf, mime, {
    model: o.model || "whisper-1",
    language: o.language || undefined,
    key,
  });
}

const PROVIDERS = { local, openai };

async function transcribe(buf, mime, cfg) {
  const chain = (cfg.stt && cfg.stt.chain) || ["local", "browser"];
  for (const name of chain) {
    if (name === "browser") return { browser: true };
    const fn = PROVIDERS[name];
    if (!fn) continue;
    try {
      const res = await fn(buf, mime, cfg);
      if (res && res.text) return { ...res, provider: name };
    } catch {
      // never let one broken provider break the chain
    }
  }
  return { browser: true };
}

async function status(cfg) {
  const l = (cfg.stt && cfg.stt.local) || {};
  let serverUp = false;
  if (l.url) {
    try {
      const base = new URL(l.url);
      const probe = await fetch(`${base.origin}/v1/models`, {
        signal: AbortSignal.timeout(1500),
      });
      serverUp = probe.ok;
    } catch {
      serverUp = false;
    }
  }
  return {
    local: serverUp || (await has(l.binary || "whisper-cli")),
    local_server: serverUp,
    openai: Boolean(process.env.OPENAI_API_KEY),
    ffmpeg: await has("ffmpeg"),
    browser: true,
  };
}

/* True when the browser should record audio and post it here, rather than
 * using its own SpeechRecognition. */
async function serverSideAvailable(cfg) {
  const s = await status(cfg);
  const chain = (cfg.stt && cfg.stt.chain) || [];
  return chain.some((n) => (n === "local" && s.local) || (n === "openai" && s.openai));
}

module.exports = { transcribe, status, serverSideAvailable };
