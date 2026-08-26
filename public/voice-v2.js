/* ============================================================================
 * voice-v2.js - one-press voice input. Load AFTER app.js.
 *
 * WHAT WAS WRONG
 *
 * The mic was a toggle with no endpoint: click to start, click again to stop.
 * Nothing told you it was recording, nothing decided when you had finished, and
 * a recording under 1200 bytes was dropped on the floor without a word. So the
 * common experience was: click, talk, wait, nothing happens - because the thing
 * was still recording and waiting for a second click nobody knew to make.
 *
 * WHY NOT WEBSOCKETS
 *
 * A socket only buys something if the transcriber can consume a stream and hand
 * back partial text. Neither backend here can: lib/stt.js shells out to
 * whisper-cli over a finished 16 kHz wav, or POSTs a complete file to OpenAI -
 * both are file-in, text-out, so a socket would stream audio to a server that
 * has to buffer the whole utterance anyway. What was actually missing is the
 * thing that decides you have stopped talking, and that is a client-side
 * measurement: it needs the raw mic level, which is already in the page.
 *
 * So: endpointing here, over an AnalyserNode. Press once, talk, stop talking.
 * Two seconds of silence sends it.
 *
 * TWO PATHS, ONE BEHAVIOUR
 *
 * Same as app.js: if the server has a real transcriber we record and POST the
 * audio, otherwise we fall back to the browser's SpeechRecognition. They end
 * differently - the recorder path measures the microphone, the browser path
 * watches how long the transcript has stood still, because SpeechRecognition
 * owns the mic and a second meter on the same device is not worth the risk of
 * fighting it for the input. Both give you the same two-second rule.
 * ========================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const mic = $("mic"), bar = $("bar");
  if (!mic || !bar) return;

  const SILENCE_MS   = 2000;   // "a couple of seconds" - the send trigger
  const LEAD_IN_MS   = 7000;   // nothing said at all: give up rather than hang
  const MAX_MS       = 30000;  // hard cap, so a stuck gate cannot record forever
  const TICK_MS      = 50;
  const CALIBRATE_MS = 400;    // opening moment is ambient noise, not speech

  /* app.js owns these; they are top-level `let`s in a classic script, so this
   * script shares their scope. Reading and writing them is what keeps the
   * wake-word recogniser from grabbing the mic out from under us: syncWake()
   * parks itself whenever `listening` is true or the state is not idle. */
  const appFlag = (fn) => { try { fn(); } catch {} };

  /* ---------------------------------------------------------------- the strip
   * A meter you can watch is the difference between "it is recording" and "I
   * think it is recording". The bars are a scrolling history of the measured
   * level, so a mic that is muted or plugged into the wrong device reads as a
   * flat line instead of looking identical to one that is working. */
  const strip = document.createElement("div");
  strip.id = "voicebar";
  strip.innerHTML =
    `<span class="vmeter">${Array.from({ length: 22 }, () => "<i></i>").join("")}</span>` +
    `<span class="vcap">Listening</span>` +
    `<button class="vstop" type="button">Send</button>` +
    `<button class="vcancel" type="button" aria-label="Cancel" title="Cancel (Esc)">✕</button>`;
  bar.insertBefore(strip, bar.firstChild);

  const bars = [...strip.querySelectorAll(".vmeter i")];
  const cap = strip.querySelector(".vcap");
  strip.querySelector(".vcancel").onclick = () => finish("cancel");
  strip.querySelector(".vstop").onclick = () => finish("send");

  const hist = new Array(bars.length).fill(0);
  function paintMeter(v) {
    hist.push(Math.max(0, Math.min(1, v)));
    hist.shift();
    for (let i = 0; i < bars.length; i++) bars[i].style.transform = `scaleY(${0.07 + hist[i] * 0.93})`;
  }
  const clearMeter = () => { hist.fill(0); bars.forEach((b) => (b.style.transform = "scaleY(0.07)")); };

  function ui(mode, text) {
    mic.classList.toggle("listening", mode === "listening");
    mic.classList.toggle("working", mode === "working");
    bar.classList.toggle("voicing", mode !== "idle");
    strip.classList.toggle("on", mode !== "idle");
    strip.classList.toggle("working", mode === "working");
    if (text) cap.textContent = text;
  }

  async function openMeter(stream) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      if (ctx.state === "suspended") await ctx.resume();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.55;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      return {
        rms() {
          an.getFloatTimeDomainData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          return Math.sqrt(s / buf.length);
        },
        close() { try { ctx.close(); } catch {} },
      };
    } catch { return null; }
  }

  /* --------------------------------------------------------------- the errors
   * app.js already worked out that getUserMedia fails five distinct ways and
   * that calling them all "permission denied" sends you to check the wrong
   * thing. Reuse its table rather than writing a second, worse one. */
  const MIC_MSG = (e) =>
    (typeof MIC_ERRORS !== "undefined" && MIC_ERRORS[e.name]) ||
    `microphone failed: ${e.name} ${e.message}`;

  const SR_MSG = {
    "no-speech": "didn't hear any speech. Check the input level in System Settings > Sound > Input.",
    "audio-capture": "no microphone available to the browser.",
    "not-allowed": "microphone blocked. Allow it for this site in Chrome, and check " +
      "System Settings > Privacy & Security > Microphone.",
    "service-not-allowed": "the browser refused to use its speech service.",
    "network": "the browser's speech service could not be reached. This fallback needs " +
      "a network connection - install whisper (brew install whisper-cpp) to transcribe " +
      "on this machine instead.",
  };

  /* ------------------------------------------------------- is there a mic at all
   * Both sides already knew and neither said so. The server shells out to
   * system_profiler and reports stt.input; the browser can enumerate capture
   * devices. Nothing surfaced either, so the only way to find out was to press
   * the mic and read getUserMedia's wording for a machine with no input -
   * "no microphone matches what was asked for" - which sounds like a settings
   * problem and is not one. A Mac Studio has no built-in microphone.
   *
   * Checked on load, re-checked on every press and on devicechange, so plugging
   * one in recovers without a reload. If the browser will not tell us, the
   * button stays enabled: a false "no microphone" is worse than a failed press.
   */
  let hasInput = true;

  async function checkInput() {
    let ok = true;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      ok = list.some((d) => d.kind === "audioinput");
    } catch { ok = true; }
    hasInput = ok;
    mic.classList.toggle("noinput", !ok);
    mic.dataset.tip = ok
      ? "Click to talk. Sends when you stop."
      : "No microphone connected — System Settings ▸ Sound ▸ Input";
    return ok;
  }

  const NO_INPUT_MSG = () =>
    "no microphone connected - this machine has no audio input device. Plug one in " +
    "(System Settings > Sound > Input)." +
    (typeof STT_SERVER !== "undefined" && STT_SERVER
      ? " The transcriber itself is installed and ready, so voice will work the moment there is something to record from."
      : "");

  let S = null;   // the live session, or null

  /* Hand the microphone back. Shared by the two exits - finish() when nothing
   * is uploaded, and upload() once the recorder's blob is in hand. */
  function release(s) {
    try { s.sr && (s.sr.onend = s.sr.onresult = s.sr.onerror = null, s.sr.stop()); } catch {}
    try { s.meter && s.meter.close(); } catch {}
    try { s.stream && s.stream.getTracks().forEach((t) => t.stop()); } catch {}
    appFlag(() => { listening = false; recording = false; });
  }

  async function start() {
    if (S) return;
    appFlag(() => stopSpeaking());

    // re-checked here, not just at load, so plugging a mic in recovers without
    // a reload - and so the reason is given before anything tries to record
    if (!(await checkInput())) { addMsg("sys", NO_INPUT_MSG()); return; }

    const serverStt =
      typeof STT_SERVER !== "undefined" && STT_SERVER &&
      window.MediaRecorder && navigator.mediaDevices;

    S = {
      kind: serverStt ? "rec" : "sr",
      t0: Date.now(),
      lastLoud: 0,
      heard: false,
      ambient: 0,
      thr: 0.02,
      thrSet: false,
      text: "",
      stopped: false,
    };

    // claim the mic before anything opens it, so the wake-word recogniser lets go
    appFlag(() => { listening = true; });
    appFlag(() => setState("listening"));
    clearMeter();
    ui("listening", "Listening — stop talking and I'll send it");

    const ok = S.kind === "rec" ? await startRecorder() : await startSR();
    if (!ok) return;
    S.timer = setInterval(tick, TICK_MS);
  }

  async function startRecorder() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      addMsg("sys", MIC_MSG(e));
      finish("abort");
      return false;
    }
    S.stream = stream;
    S.meter = await openMeter(stream);
    S.endpoint = "rms";

    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    const chunks = [];
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => upload(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
    r.start();
    S.recorder = r;
    appFlag(() => { recording = true; });
    return true;
  }

  async function startSR() {
    const SRC = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SRC) {
      addMsg("sys", "no speech input available - install local whisper (brew install whisper-cpp), " +
        "add an OpenAI key, or use Chrome");
      finish("abort");
      return false;
    }
    /* continuous, not one-shot. Chrome's own endpointing is far more eager than
     * two seconds and would cut you off mid-sentence; owning the decision here
     * is the only way both paths behave the same. */
    const r = new SRC();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      if (!S) return;
      let done = "", live = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) done += res[0].transcript;
        else live += res[0].transcript;
      }
      S.text = (done + live).trim();
      if (S.text) {
        S.heard = true;
        S.lastLoud = Date.now();
        cap.textContent = S.text.length > 68 ? "…" + S.text.slice(-68) : S.text;
      }
    };
    r.onerror = (e) => {
      if (!S || S.stopped) return;
      const m = SR_MSG[e.error];
      if (m) addMsg("sys", m);
      finish(S.text ? "send" : "abort");
    };
    r.onend = () => { if (S && !S.stopped) finish(S.text ? "send" : "nothing"); };
    try { r.start(); } catch { finish("abort"); return false; }
    S.sr = r;
    S.endpoint = "text";
    return true;
  }

  /* -------------------------------------------------------------------- tick
   * One rule, two inputs. The recorder path watches the microphone; the
   * SpeechRecognition path watches how long the transcript has stood still,
   * because it will not share the device with a meter. */
  function tick() {
    if (!S || S.stopped) return;
    const now = Date.now(), age = now - S.t0;

    if (S.meter) {
      const v = S.meter.rms();
      paintMeter(Math.min(1, v * 14));
      if (age < CALIBRATE_MS) { S.ambient = Math.max(S.ambient, v); return; }
      if (!S.thrSet) { S.thr = Math.max(S.ambient * 2.2, 0.012); S.thrSet = true; }
      if (S.endpoint === "rms" && v > S.thr) { S.heard = true; S.lastLoud = now; }
    } else {
      // no analyser on this path: a low idle shimmer, so the strip does not
      // sit dead-flat and read as broken
      paintMeter(0.10 + Math.sin(age / 190) * 0.05 + Math.random() * 0.04);
    }

    if (age > MAX_MS) return finish("send");
    if (S.heard && now - S.lastLoud > SILENCE_MS) return finish("send");
    if (!S.heard && age > LEAD_IN_MS) return finish("nothing");
  }

  /* ------------------------------------------------------------------- finish
   *   send    stop and transcribe what we have
   *   cancel  stop and throw it away
   *   nothing stop, throw it away, and say why
   *   abort   something failed on the way up; a message has already been said
   */
  function finish(reason) {
    if (!S || S.stopped) return;
    S.stopped = true;
    clearInterval(S.timer);
    const s = S;

    if (reason !== "send") {
      release(s);
      S = null;
      ui("idle");
      appFlag(() => setState("idle"));
      if (reason === "nothing")
        addMsg("sys", "didn't hear anything - check the input level in System Settings > Sound > Input");
      return;
    }

    if (s.kind === "sr") {
      release(s);
      S = null;
      ui("idle");
      const text = (s.text || "").trim();
      if (text) send(text);
      else { appFlag(() => setState("idle")); addMsg("sys", "didn't catch that"); }
      return;
    }

    // recorder: the upload happens in onstop, so the stream stays open until then
    ui("working", "Transcribing…");
    try { s.recorder.stop(); } catch { release(s); S = null; ui("idle"); appFlag(() => setState("idle")); }
  }

  async function upload(blob) {
    const s = S;
    /* Cancelling mid-recording tears the session down and stops the stream
     * tracks, and stopping the last track makes MediaRecorder fire `stop` -
     * which lands here with S already null. The teardown calls below swallow
     * it, but the `s.heard` test further down threw an uncaught TypeError on
     * every cancelled recording. */
    if (!s) return;
    release(s);
    S = null;

    /* app.js dropped anything under 1200 bytes as "basically silence" and said
     * nothing. We already know whether we heard speech, so a short clip that
     * followed real sound is worth sending, and one that did not gets a reason
     * rather than a shrug. */
    if (!s.heard || blob.size < 800) {
      ui("idle");
      appFlag(() => setState("idle"));
      addMsg("sys", "didn't hear anything - check the input level in System Settings > Sound > Input");
      return;
    }

    appFlag(() => setState("thinking"));
    try {
      const r = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      const data = await r.json();
      ui("idle");
      if (data.text && data.text.trim()) send(data.text.trim());
      else {
        addMsg("sys", data.error || "could not transcribe that");
        appFlag(() => setState("idle"));
      }
    } catch (e) {
      ui("idle");
      addMsg("sys", "transcription failed: " + e.message);
      appFlag(() => setState("idle"));
    }
  }

  /* =========================================================================
   * VOICE OUT - kokoro, in sentences rather than in one lump
   *
   * app.js sent the whole reply to /api/tts as a single request and waited for
   * one blob. Kokoro runs on CPU: a four-sentence answer is several seconds of
   * synthesis, and every one of those seconds is silence AFTER the text has
   * already finished streaming on screen. It felt broken because the gap has
   * no relationship to anything the user can see.
   *
   * Same endpoint, same provider chain - but the text is cut into sentences,
   * and clip N+1 is fetched while clip N is playing. Time to first word drops
   * to the synthesis cost of one sentence, and the rest arrives under cover of
   * the audio already playing. Nothing about the server changes.
   *
   * It also removes the 1100-character truncation: long replies used to be cut
   * off mid-word, because one request had to carry the whole thing.
   * ======================================================================= */
  const FIRST_MAX = 110;   // keep the opening clip short - it sets the latency
  const CHUNK_MAX = 220;

  let VGEN = 0;            // bump to invalidate everything in flight
  let VAUDIO = null, VABORT = null;

  /* Kokoro reads what it is given. "**Do this** - see https://x.com/y" comes
   * out as asterisks and a spoken URL, so the markdown comes off properly here
   * rather than with one character-class sweep. */
  function normalize(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, " . code block omitted . ")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, "$1")        // links -> their words
      .replace(/\bhttps?:\/\/\S+/g, "a link")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")                  // headings
      .replace(/^\s*[-*+]\s+/gm, "")                       // bullets
      .replace(/^\s*\d+[.)]\s+/gm, "")                     // numbered lists
      .replace(/[*_>|~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function intoChunks(clean) {
    const sentences = clean.match(/[^.!?…]+[.!?…]*\s*/g) || [clean];
    const out = [];
    let cur = "";
    const flush = () => { const t = cur.trim(); if (t) out.push(t); cur = ""; };

    for (const s of sentences) {
      // the opening clip is what the wait is measured against, so it gets a
      // tighter cap than the ones that will arrive under cover of audio
      if (cur && (cur + s).length > (out.length === 0 ? FIRST_MAX : CHUNK_MAX)) flush();
      cur += s;
      /* Dictation arrives as one sentence with no full stop in it. Break on a
       * word boundary; only cut mid-word if 220 characters went by without a
       * space, which is not language. */
      while (cur.length > CHUNK_MAX) {
        let cut = cur.lastIndexOf(" ", CHUNK_MAX);
        if (cut < 40) cut = CHUNK_MAX;
        out.push(cur.slice(0, cut).trim());
        cur = cur.slice(cut);
      }
    }
    flush();
    return out;
  }

  async function fetchClip(text, gen, signal) {
    if (!text) return null;
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal,
      });
      if (!r.ok) return null;                       // 503 = server says use the browser
      if (gen !== VGEN) return null;
      const blob = await r.blob();
      if (!blob.size || gen !== VGEN) return null;
      return URL.createObjectURL(blob);
    } catch { return null; }
  }

  function playClip(url, gen, quiet) {
    return new Promise((resolve) => {
      const el = new Audio(url);
      if (!quiet) VAUDIO = el;
      let guard = 0;
      // clearing here as well as on .ended: a clip that errors or is refused
      // playback never sets .ended, and the guard below would poll forever
      const done = () => {
        clearInterval(guard);
        URL.revokeObjectURL(url); if (VAUDIO === el) VAUDIO = null; resolve();
      };
      el.onended = done;
      el.onerror = done;
      el.play().catch(done);
      // a cancelled generation must not wait out the clip it no longer wants
      guard = setInterval(() => {
        if (gen !== VGEN) { try { el.pause(); } catch {} done(); }
        else if (el.ended) clearInterval(guard);
      }, 120);
    });
  }

  function browserSpeak(text, gen, quiet) {
    if (!window.speechSynthesis || quiet) { if (!quiet && gen === VGEN) setState("idle"); return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = speechSynthesis.getVoices().find((x) => /Daniel|Oliver|en-GB/i.test(x.name + x.lang));
    if (v) u.voice = v;
    u.rate = 1.04; u.pitch = 0.92;
    u.onstart = () => { if (gen === VGEN) setState("speaking"); };
    u.onend = u.onerror = () => { if (gen === VGEN) setState("idle"); };
    speechSynthesis.speak(u);
  }

  async function speakV2(text, quiet = false) {
    const clean = normalize(text);
    if (!clean) { if (!quiet) setState("idle"); return; }
    if (!quiet) stopSpeakingV2();

    const gen = ++VGEN;
    const ac = new AbortController();
    if (!quiet) VABORT = ac;

    // the ack is one short line by definition; do not chop it up
    const parts = quiet ? [clean.slice(0, 200)] : intoChunks(clean);
    let pending = fetchClip(parts[0], gen, ac.signal);
    let started = false;

    for (let i = 0; i < parts.length; i++) {
      const url = await pending;
      if (gen !== VGEN) { if (url) URL.revokeObjectURL(url); return; }
      pending = i + 1 < parts.length ? fetchClip(parts[i + 1], gen, ac.signal) : Promise.resolve(null);

      if (!url) {
        // no server voice: hand the REST of the reply to the browser, not just
        // the sentence that failed, or the answer gets read out with a hole in it
        browserSpeak(parts.slice(i).join(" "), gen, quiet);
        return;
      }
      if (!started && !quiet) { started = true; setState("speaking"); }
      await playClip(url, gen, quiet);
      if (gen !== VGEN) return;
    }
    if (!quiet && gen === VGEN) setState("idle");
  }

  function stopSpeakingV2() {
    VGEN++;
    if (VAUDIO) { try { VAUDIO.pause(); } catch {} VAUDIO = null; }
    if (VABORT) { try { VABORT.abort(); } catch {} VABORT = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
  }

  /* Both are plain function declarations in app.js, so rebinding the name here
   * redirects every existing call site - which is the same trick app.js itself
   * uses to wrap setState for the wake word. */
  appFlag(() => { speak = speakV2; });
  appFlag(() => { stopSpeaking = stopSpeakingV2; });

  /* -------------------------------------------------------------- entry points
   * Replaces app.js's handler. Press to talk, press again to send early. */
  mic.onclick = () => (S ? finish("send") : start());
  mic.dataset.tip = "Click to talk. Sends when you stop.";
  mic.setAttribute("aria-label", "Talk to Jarvis");

  // ask once at load so the button already shows the answer, and follow the
  // device list so unplugging or plugging in is reflected without a reload
  checkInput();
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener)
    navigator.mediaDevices.addEventListener("devicechange", checkInput);

  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S) { e.preventDefault(); finish("cancel"); }
  });

  window.JarvisVoice = {
    start, stop: () => finish("send"), cancel: () => finish("cancel"),
    speak: speakV2, stopSpeaking: stopSpeakingV2, normalize, intoChunks,
  };
})();
