/* ============================================================================
 * settings.js - one modal, six panes.
 *
 * It used to be three dialogs (Settings, Agents, Connections) handing off to
 * each other with a cross-fade, and thirteen places a setting could be. Now
 * there is one card, 80% of the viewport, and a left nav:
 *
 *   Overview     - what needs you, each row jumping to the pane that fixes it
 *   Profile      - name, what you do, working windows, handles, targets
 *   Agents       - what runs, when, whether it did, and what radar/scout watch
 *   Connections  - the brain, voice out, voice in, and the MCP servers
 *   Messaging    - channels Jarvis can post to, who posts where, the journal
 *   System       - theme, memory budget, server address, spoken replies
 *
 * Saving is still partial. Each pane contributes only the keys it owns, and
 * only once it has been drawn, so a pane you never opened cannot post an
 * empty list over a real one. A null in the patch removes the key from
 * config.json (server.js stripNulls), which is how a channel is dropped.
 *
 * Secrets are never here. The Messaging pane reports each .env key as set or
 * missing and tells you the exact line to add; the server refuses any patch
 * that looks like a credential.
 * ========================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* Told in the UI, not buried in a doc - a provider marked "not set up" is
   * useless without knowing what would set it up. */
  const HINTS = {
    kokoro: "needs a local Kokoro server on port 8880",
    piper: "needs the piper binary and a voice model",
    elevenlabs: "needs ELEVENLABS_API_KEY in .env",
    local: "needs whisper-cli plus a model (brew install whisper-cpp)",
    openai: "needs OPENAI_API_KEY in .env",
    "claude-code": "needs the claude CLI installed",
    browser: "always available",
    system: "always available",
    ffmpeg: "needs ffmpeg on PATH",
  };

  /* Which messaging providers exist, what each needs, and how to get it.
   * Mirrors PROVIDERS in lib/notify.js; the keys come from the server so the
   * two cannot drift, only the prose lives here. */
  const PROVIDERS = {
    ntfy:     { label: "ntfy",     need: "a topic name, no account",
                how: "Pick any topic name at ntfy.sh, install the app on your phone and subscribe to it. The topic is the whole secret, so make it hard to guess." },
    discord:  { label: "Discord",  need: "one webhook URL",
                how: "In the Discord channel: Edit channel › Integrations › Webhooks › New webhook, then Copy URL." },
    telegram: { label: "Telegram", need: "a bot and a chat id",
                how: "Message @BotFather on Telegram, send /newbot, and paste the token it gives you." },
    slack:    { label: "Slack",    need: "an app with a webhook",
                how: "Create a Slack app, turn on Incoming Webhooks, add one to a channel, and copy its URL." },
    webhook:  { label: "Webhook",  need: "any URL you own",
                how: "Any HTTPS endpoint that accepts a JSON POST. n8n, Zapier and a five-line server all work." },
  };

  const svg = (d, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    mag: svg('<circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path>', 14),
    arrow: svg('<path d="M9 5l7 7-7 7"></path>', 13),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"></path>', 13),
    plus: svg('<path d="M12 5v14M5 12h14"></path>', 16),
    mail: svg('<rect x="3" y="5.5" width="18" height="13" rx="2"></rect><path d="M3 8l9 6 9-6"></path>', 16),
    telegram: svg('<path d="M21 3L3 10.5l7.5 2.5L13 21z"></path><path d="M10.5 13L21 3"></path>', 18),
    discord: svg('<path d="M4 5.5h16v10H9l-5 4z"></path>', 18),
    slack: svg('<path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16"></path>', 18),
    ntfy: svg('<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"></path><path d="M10 21h4"></path>', 18),
    webhook: svg('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1.5 1.5"></path><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.5-1.5"></path>', 18),
  };

  /* Open and close as two animated edges rather than a display toggle: .open
   * mounts and plays in, .closing plays out, and the node stays in the document
   * for the length of the exit. Both edges are CSS animations, see the dialog
   * section of ui-v2.css. CLOSE_MS matches the longest exit (v2cardDown). */
  const CLOSE_MS = 190;
  function openDlg(el) {
    if (!el) return;
    clearTimeout(el.__exit);
    el.classList.remove("open", "closing");
    void el.offsetWidth;
    el.classList.add("open");
  }
  function closeDlg(el) {
    if (!el || !el.classList.contains("open")) return;
    el.classList.add("closing");
    clearTimeout(el.__exit);
    el.__exit = setTimeout(() => el.classList.remove("open", "closing"), CLOSE_MS);
  }

  const get = (p) => fetch(p).then((r) => r.json());
  const post = (p, body) => fetch(p, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  }).then((r) => r.json());

  /* Client-side twin of lib/config.js merge: objects merge, everything else
   * (arrays, strings, null) replaces. Null is kept so the server can delete. */
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  function deepMerge(base, over) {
    for (const [k, v] of Object.entries(over || {})) {
      base[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
    }
    return base;
  }

  /* ------------------------------------------------------------------- chips
   * Radar channels, scout lanes and playbook files are lists, so they get
   * list controls. A change redraws the whole box; chips carry a `fresh` flag
   * from the index they were added at so only the new ones play in. */
  const LISTS = {};
  function chipsHTML(id, mono, freshFrom) {
    const vals = LISTS[id] || [];
    const from = Number.isInteger(freshFrom) ? freshFrom : vals.length;
    return vals.map((v, i) =>
      `<span class="v2chip${mono ? " mono" : ""}${i >= from ? " fresh" : ""}"><span class="txt">${esc(v)}</span><i data-i="${i}">✕</i></span>`
    ).join("");
  }
  function chips(id, vals, placeholder, mono) {
    if (!LISTS[id]) LISTS[id] = (vals || []).slice();
    return `<div class="v2chips" id="${id}" data-mono="${mono ? 1 : 0}">${chipsHTML(id, mono)}<input class="v2chipadd" placeholder="${esc(placeholder)}"></div>`;
  }
  function wireChips(root) {
    root.querySelectorAll(".v2chips").forEach((box) => {
      const id = box.id, mono = box.dataset.mono === "1";
      let busy = false;
      const redraw = (freshFrom) => {
        const input = box.querySelector(".v2chipadd");
        box.innerHTML = chipsHTML(id, mono, freshFrom);
        box.appendChild(input);
        bind();
        touch();
      };
      const bind = () => {
        box.querySelectorAll("i[data-i]").forEach((x) => {
          x.onclick = () => {
            if (busy) return;
            busy = true;
            const chip = x.closest(".v2chip");
            const i = +x.dataset.i;
            if (chip) chip.classList.add("gone");
            setTimeout(() => { LISTS[id].splice(i, 1); busy = false; redraw(); }, 170);
          };
        });
      };
      const input = box.querySelector(".v2chipadd");
      if (input) {
        input.onkeydown = (e) => {
          if (e.key !== "Enter" && e.key !== ",") return;
          e.preventDefault();
          const v = input.value.trim().replace(/,$/, "");
          const at = LISTS[id].length;
          if (v && !LISTS[id].includes(v)) LISTS[id].push(v);
          input.value = "";
          redraw(at);
          box.querySelector(".v2chipadd").focus();
        };
        input.onpaste = (e) => {
          const t = (e.clipboardData || window.clipboardData).getData("text");
          if (!t.includes(",")) return;
          e.preventDefault();
          const at = LISTS[id].length;
          t.split(",").map((s) => s.trim()).filter(Boolean).forEach((v) => {
            if (!LISTS[id].includes(v)) LISTS[id].push(v);
          });
          redraw(at);
          box.querySelector(".v2chipadd").focus();
        };
      }
      bind();
    });
  }

  const field = (id, label, value, hint, cls, placeholder) => `
    <label class="v2f ${cls || ""}"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</span>
    <input id="${id}" value="${esc(value ?? "")}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ""}></label>`;

  /* "today 07:02", "yesterday 22:41", "Sep 9 15:00" */
  function when(ms) {
    if (!ms) return "never";
    const d = new Date(ms), now = new Date();
    const t = d.toTimeString().slice(0, 5);
    const day = (x) => x.toDateString();
    if (day(d) === day(now)) return `today ${t}`;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (day(d) === day(y)) return `yesterday ${t}`;
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${t}`;
  }
  /* Daily / weekly / on demand, read off the tag the ring already shows. */
  const cadence = (tag) => {
    const t = String(tag || "").trim().toUpperCase();
    if (/^\d{1,2}:\d{2}$/.test(t)) return "day";
    if (/(MON|TUE|WED|THU|FRI|SAT|SUN)/.test(t)) return "week";
    return "demand";
  };
  const nice = (label) => { const s = String(label || "").toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };

  /* ---------------------------------------------------------------- the card */
  const NAV = [
    ["overview", "Overview"], ["profile", "Profile"], ["agents", "Agents"],
    ["connections", "Connections"], ["messaging", "Messaging"], ["system", "System"],
  ];
  const dlg = document.createElement("div");
  dlg.id = "v2-settings";
  dlg.className = "v2dlg";
  dlg.innerHTML = `
    <div class="v2card split one">
      <div class="v2side">
        <h3>Settings <kbd>⌘,</kbd></h3>
        <div class="v2search">${ICON.mag}<input id="v2-q" placeholder="Search" autocomplete="off"><kbd>/</kbd><div class="v2hits" id="v2-hits"></div></div>
        ${NAV.map(([id, label]) => `<button class="v2tab" data-pane="${id}"><span>${label}</span><span class="badge"></span></button>`).join("")}
        <span class="fill"></span>
        <div class="foot">Saved to config.json.<br>Secrets stay in .env and are never shown here.</div>
      </div>
      <div class="v2main">
        <div class="v2head"><h4 id="v2-title">Settings</h4><span class="sub" id="v2-sub"></span><span class="fill"></span><span id="v2-headright"></span>
          <button class="v2x" data-close>✕</button></div>
        <div class="v2body" id="v2-body">loading…</div>
        <div class="v2foot">
          <span class="v2dirty clean" id="v2-msg"><i></i>no changes</span>
          <span class="fill"></span>
          <button class="v2btn ghost" data-close>Close</button>
          <button class="v2btn" id="v2-save">Save</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  dlg.onclick = (e) => { if (e.target === dlg) closeDlg(dlg); };
  dlg.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => closeDlg(dlg)));

  const body = $("v2-body");
  const tabs = [...dlg.querySelectorAll(".v2tab[data-pane]")];

  /* ------------------------------------------------------------------ state */
  let CFG = null, STATUS = null, AGENTS = [], NOTIFY = null;
  let pane = "overview";
  let PATCH = {};          // what Save will post, accumulated as panes are left
  let dirty = false;
  const CHAINS = {};       // brain/voice/stt order, edited by "move up"
  const ADD = { provider: null, name: "", chats: null, result: null, poll: null };  // the add-a-channel flow
  const REMOVED = new Set();  // channels dropped in this session, before Save

  function touch() {
    dirty = true;
    const m = $("v2-msg");
    m.className = "v2dirty";
    m.innerHTML = "<i></i>unsaved changes";
  }
  function goto(id) { leavePane(); pane = id; drawPane(); }

  /* ----------------------------------------------------------------- panes
   * Each pane: title, sub, render() -> html, wire(root) after render, and
   * collect(root) -> patch for the keys it owns (or nothing). */
  const PANES = {};

  /* OVERVIEW ---------------------------------------------------------- */
  PANES.overview = {
    title: "Overview", sub: "what needs you today",
    render() {
      const rows = attention();
      const first = (chain, ready) => (chain || []).find((n) => ready && ready[n]) || (chain || [])[0] || "—";
      const mcp = (STATUS && STATUS.mcp && STATUS.mcp.servers) || [];
      const on = mcp.filter((m) => m.connected && m.enabled).length;
      const connected = mcp.filter((m) => m.connected).length;
      return `
      <div class="v2sec">
        ${rows.length ? `<div class="v2list">${rows.map((r) => `
          <div class="v2att${r.quiet ? " quiet" : ""}">
            <span class="v2tag ${r.kind}">${r.kind === "ok" ? "<i></i>" : ""}${r.tag}</span>
            <span class="txt">${r.text}${r.small ? `<small>${r.small}</small>` : ""}</span>
            ${r.code ? `<code data-copy="${esc(r.code)}">${esc(r.code)}</code>` : ""}
            ${r.go ? `<button class="go" data-goto="${r.go}">${NAV.find((n) => n[0] === r.go)[1]} ${ICON.arrow}</button>` : ""}
          </div>`).join("")}</div>`
          : `<div class="v2att quiet"><span class="v2tag ok"><i></i>CLEAR</span><span class="txt">Nothing needs you. Everything that is on is installed, connected and has run.</span></div>`}
      </div>
      <div class="v2sec">
        <div class="v2sech"><b>Answering right now</b></div>
        <div class="v2stats">
          <div class="v2stat"><div class="lab">Brain</div><div class="val">${esc(first(CFG.brain.chain, STATUS && STATUS.brain && STATUS.brain.providers))} <small>· first working one in the chain</small></div></div>
          <div class="v2stat"><div class="lab">Speaks · listens</div><div class="val">${esc(first(CFG.voice.chain, STATUS && STATUS.voice))} · ${esc(first(CFG.stt.chain, STATUS && STATUS.stt))}</div></div>
          <div class="v2stat"><div class="lab">Tools it may reach</div><div class="val">${STATUS ? `${on} server${on === 1 ? "" : "s"} <small>· of ${connected} connected</small>` : "<small>checking…</small>"}</div></div>
        </div>
      </div>`;
    },
    wire(root) { wireGoto(root); },
  };

  /* The attention list. Configuration says what should happen; the run
   * ledger and the status probes say what did. Only the second kind lands
   * here, and every row names the pane that fixes it. */
  function attention() {
    const out = [];
    const real = AGENTS.filter((a) => a.id !== "runner");
    const notLoaded = real.filter((a) => a.enabled !== false && a.schedule && a.health && a.health.loaded === false);
    if (notLoaded.length) out.push({
      kind: "no", tag: "BLOCKED",
      text: `${notLoaded.length} agent${notLoaded.length === 1 ? " is" : "s are"} on but ${notLoaded.length === 1 ? "its schedule is" : "their schedules are"} not installed.`,
      small: "Turning one on saves the choice. The scheduler does not know until you run this in a terminal.",
      code: "jarvis agents install",
    });
    const broken = real.filter((a) => a.enabled !== false && a.health && ["failed", "overdue", "stale"].includes(a.health.state));
    for (const a of broken) out.push({
      kind: "no", tag: a.health.state.toUpperCase(),
      text: `${nice(a.label)} ${a.health.state === "failed" ? "failed its last run" : a.health.state === "overdue" ? "did not run when it should have" : "ran but wrote nothing"}.`,
      small: a.health.detail, go: "agents",
    });
    const need = (STATUS && STATUS.mcp && STATUS.mcp.servers || []).filter((m) => !m.connected);
    if (need.length) out.push({
      kind: "no", tag: "BLOCKED",
      text: `${need.length} MCP server${need.length === 1 ? " needs" : "s need"} you to sign in before Jarvis can use ${need.length === 1 ? "it" : "them"}.`,
      small: need.map((m) => m.name.replace(/^claude\.ai /, "")).join(" · "), go: "connections",
    });
    for (const a of real.filter((a) => a.enabled !== false && (a.unmet || []).length)) out.push({
      kind: "warn", tag: "SKIPPING",
      text: `${nice(a.label)} needs ${a.unmet.join(", ")} in config, so it skips instead of running.`,
      small: a.unmet.includes("radar") ? "Add a few YouTube channels under Agents › What they watch." : "", go: a.unmet.includes("radar") ? "agents" : "connections",
    });
    if (NOTIFY && !NOTIFY.channels.length) out.push({
      kind: "warn", tag: "QUIET",
      text: "Nothing reaches your phone yet. No messaging channel is set up.",
      small: "Reports only land in the documents trail until you add one.", go: "messaging", quiet: true,
    });
    if (!String(CFG.profile.about || "").trim()) out.push({
      kind: "warn", tag: "EMPTY",
      text: "What you do is blank, so Scout and Study are guessing at topics.", go: "profile",
    });
    if (STATUS && STATUS.stt && STATUS.stt.input === false) out.push({
      kind: "warn", tag: "NO MIC",
      text: "This machine has no audio input, so nothing can hear you.", small: "System Settings › Sound › Input", quiet: true,
    });
    return out;
  }

  /* PROFILE ----------------------------------------------------------- */
  PANES.profile = {
    title: "Profile", sub: "who this is for",
    render() {
      const e = CFG, ch = e.profile.channels || {};
      const COLLECTED = { youtube: 1, instagram: 1, tiktok: 1, linkedin: 1, x: 0 };
      const NAMES = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", x: "X" };
      const cards = e.primary_cards || [];
      return `
      <div class="v2sec">
        <div class="v2sech"><b>You</b><small>Scout and Study read this to pick topics</small></div>
        <div class="v2row">
          ${field("s-owner", "Your name", e.profile.owner, "", "narrow")}
          ${field("s-name", "HUD name", e.name, "", "narrow")}
        </div>
        <label class="v2f ${e.profile.about ? "" : "flag"}">
          <span>What you do${e.profile.about ? "" : "<em>EMPTY · SCOUT IS GUESSING</em>"}</span>
          <textarea id="s-about" placeholder="I make YouTube videos about building AI agents with Claude Code, for developers who want working systems rather than demos.">${esc(e.profile.about || "")}</textarea>
        </label>
        ${field("s-hours", "Working windows", e.profile.working_hours, "directives are only scheduled inside these", "", "Mon–Fri 09:00–12:00, Sat 14:00–17:00")}
      </div>
      <div class="v2sec">
        <div class="v2sech"><b>Channels</b><small>handles the collectors read</small><span class="ct">${Object.keys(NAMES).filter((k) => COLLECTED[k] && String(ch[k] || "").trim()).length} COLLECTED</span></div>
        <div class="v2grid2">${Object.keys(NAMES).map((k) => {
          const has = !!String(ch[k] || "").trim();
          return `<div class="v2item ${COLLECTED[k] && has ? "" : "dim"}">
            <span class="nm" style="flex:0 0 100px">${NAMES[k]}</span>
            <label class="v2f" style="flex:1;min-width:0"><input id="s-${k}" value="${esc(ch[k] ?? "")}" placeholder="@handle"></label>
            <span class="v2tag ${COLLECTED[k] && has ? "ok" : ""}"><i></i>${COLLECTED[k] ? (has ? "COLLECTED" : "NO HANDLE") : "NOT READ"}</span>
          </div>`; }).join("")}</div>
        <div class="v2hint">Only platforms with a collector feed the audience total. X keeps a handle because the profile has one, but nothing reads it yet.</div>
      </div>
      <div class="v2sec">
        <div class="v2sech"><b>Targets</b><small>the dashboard bars fill toward these</small></div>
        ${cards.length ? `<div class="v2grid2">${cards.map((c, i) => `
          <div class="v2item">
            <span class="nm" style="flex:1;min-width:0">${esc(c.label)}</span>
            <label class="v2f num" style="flex:0 0 140px;min-width:0"><input id="s-target-${i}" value="${esc(c.target)}"></label>
          </div>`).join("")}</div>
          <div class="v2hint">A target you have already passed pins the bar at 100% and stops telling you anything.</div>`
          : `<div class="v2hint">No primary cards configured.</div>`}
      </div>`;
    },
    collect(root) {
      const v = (id) => { const el = root.querySelector("#" + id); return el ? el.value : undefined; };
      const p = {
        name: v("s-name"),
        profile: {
          owner: v("s-owner"), about: v("s-about"), working_hours: v("s-hours"),
          channels: { youtube: v("s-youtube"), instagram: v("s-instagram"), tiktok: v("s-tiktok"), linkedin: v("s-linkedin"), x: v("s-x") },
        },
      };
      const cards = CFG.primary_cards || [];
      if (cards.length) p.primary_cards = cards.map((c, i) => ({ ...c, target: Number(v(`s-target-${i}`)) || c.target }));
      return p;
    },
  };

  /* AGENTS ------------------------------------------------------------ */
  PANES.agents = {
    title: "Agents", sub: "what runs, when, and whether it did",
    headRight() {
      const n = AGENTS.filter((a) => a.id !== "runner" && a.enabled !== false).length;
      return `<span class="v2tag">${n} ON</span>`;
    },
    render() {
      const real = AGENTS.filter((a) => a.id !== "runner");
      const notLoaded = real.some((a) => a.enabled !== false && a.schedule && a.health && a.health.loaded === false);
      const row = (a) => {
        const h = a.health || {};
        const last = a.lastRun ? when(a.lastRun) : "never";
        const bad = !a.lastRun || ["failed", "overdue", "stale"].includes(h.state);
        return `<div class="v2item${a.enabled === false ? " dim" : ""}" title="${esc(h.detail || "")}">
          <input class="v2sw" type="checkbox" data-agent="${esc(a.id)}" ${a.enabled !== false ? "checked" : ""}>
          <span class="v2who"><span class="nm">${esc(nice(a.label))}</span><span class="desc">${esc(a.description || "")}</span></span>
          ${(a.unmet || []).length ? `<span class="v2tag warn">NEEDS ${esc(a.unmet.join(", ").toUpperCase())}</span>` : ""}
          ${a.running ? '<span class="v2tag live"><i></i>RUNNING</span>' : ""}
          <span class="sched">${esc(a.tag && a.tag !== "ON DEMAND" ? a.tag.replace(/^(\w{3}) /, (m, d) => nice(d) + " ") : "on demand")}</span>
          <span class="v2last${bad ? " bad" : ""}">${esc(last)}</span>
          <button class="v2btn small ghost" data-run="${esc(a.id)}">Run now</button>
        </div>`;
      };
      const group = (title, key) => {
        const rows = real.filter((a) => cadence(a.tag) === key);
        return rows.length ? `<div class="v2sec"><div class="v2sech"><b>${title}</b><span class="ct">${rows.length}</span></div><div class="v2list">${rows.map(row).join("")}</div></div>` : "";
      };
      return `
      ${notLoaded ? `<div class="v2banner"><span class="lab">SCHEDULES</span><span class="txt">Turning an agent on here saves the choice, but the scheduler does not know until you install. Until then these times are what you want, not what will run.</span><code data-copy="jarvis agents install">jarvis agents install</code></div>` : ""}
      ${group("Every day", "day")}${group("Weekly", "week")}${group("On demand / per video", "demand")}
      <div class="v2sec">
        <div class="v2sech"><b>What they watch</b><small>radar channels and scout lanes</small></div>
        <div class="v2cols">
          <div class="v2group"><div class="v2grouphead"><b>Radar channels</b><small>YouTube channels watched for breakouts</small></div>${chips("s-radar", CFG.radar.channels, "+ Add a channel", true)}</div>
          <div class="v2group"><div class="v2grouphead"><b>Scout lanes</b><small>topics it hunts in</small></div>${chips("s-lanes", (CFG.research || {}).lanes, "+ Add a lane")}</div>
        </div>
        <div class="v2group"><div class="v2grouphead"><b>Playbook files</b><small>read before every piece of advice</small></div>${chips("s-brain", CFG.knowledge.brain_files, "+ Add a path", true)}</div>
      </div>`;
    },
    wire(root) {
      wireChips(root);
      root.querySelectorAll("[data-agent]").forEach((sw) => {
        sw.onchange = () => { const r = sw.closest(".v2item"); if (r) r.classList.toggle("dim", !sw.checked); touch(); };
      });
      root.querySelectorAll("[data-run]").forEach((b) => {
        b.onclick = async () => {
          b.disabled = true; b.textContent = "running…";
          try { await post("/api/agents/run", { name: b.dataset.run }); } catch {}
          b.textContent = "started";
        };
      });
    },
    collect(root) {
      const p = { agents: { enabled: [...root.querySelectorAll("[data-agent]")].filter((el) => el.checked).map((el) => el.dataset.agent) } };
      if (LISTS["s-radar"]) p.radar = { channels: LISTS["s-radar"] };
      if (LISTS["s-lanes"]) p.research = { lanes: LISTS["s-lanes"] };
      if (LISTS["s-brain"]) p.knowledge = { brain_files: LISTS["s-brain"] };
      return p;
    },
  };

  /* CONNECTIONS ------------------------------------------------------- */
  /* One list per chain. The row that is answering says so, and moving one
   * to the front is what reordering the chain means. */
  function chainHTML(key, ready, moved, live) {
    const chain = CHAINS[key];
    const answeringAt = chain.findIndex((x) => ready[x]);
    return `<div class="v2list">${chain.map((n, i) => {
      const ok = !!ready[n];
      const answering = ok && answeringAt === i;
      return `<div class="v2item ${answering ? "good" : ok ? "" : "dim"}${moved === n ? " moved" : ""}">
        <span class="ord">${i + 1}</span>
        <span class="nm">${esc(n)}</span>
        ${answering ? `<span class="v2tag live"><i></i>${live}</span>` : ok ? `<span class="v2tag ok"><i></i>READY</span>` : `<span class="v2tag no" title="${esc(HINTS[n] || "")}">NOT SET UP</span>`}
        ${i === 0 ? "" : `<button class="v2btn small ghost" data-up="${key}:${i}" title="move to the front">↑</button>`}
      </div>`;
    }).join("")}</div>`;
  }
  PANES.connections = {
    title: "Connections", sub: "what answers, how it speaks, what it may reach",
    headRight() {
      const s = (STATUS && STATUS.mcp && STATUS.mcp.servers) || [];
      const need = s.filter((m) => !m.connected).length;
      return need ? `<span class="v2tag no">${need} NEED SIGN-IN</span>` : STATUS ? `<span class="v2tag ok"><i></i>ALL CONNECTED</span>` : "";
    },
    render(moved) {
      if (!STATUS) return `<div class="v2hint">Checking what is connected…</div>`;
      const st = STATUS, e = CFG;
      const servers = (st.mcp && st.mcp.servers) || [];
      const need = servers.filter((m) => !m.connected);
      const on = servers.filter((m) => m.connected && m.enabled);
      const off = servers.filter((m) => m.connected && !m.enabled);
      const short = (n) => n.replace(/^claude\.ai /, "");
      const mcpRow = (m) => `
        <div class="v2item ${m.connected ? (m.enabled ? "" : "dim") : "bad"}">
          <input class="v2sw" type="checkbox" data-mcp="${esc(m.name)}" ${m.enabled ? "checked" : ""} ${m.connected ? "" : "disabled"}>
          <span class="nm" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(m.prefix || "")}">${esc(short(m.name))}</span>
          ${m.connected ? "" : `<span class="v2tag no">${esc((m.status || "needs sign-in").toUpperCase())}</span>`}
        </div>`;
      return `
      <div class="v2chains">
        <div class="v2sec"><div class="v2sech"><b>Brain</b><small>first working one answers</small></div>${chainHTML("brain", st.brain.providers || {}, moved, "ANSWERING")}</div>
        <div class="v2sec"><div class="v2sech"><b>Speaks with</b></div>${chainHTML("voice", st.voice || {}, moved, "SPEAKING")}</div>
        <div class="v2sec"><div class="v2sech"><b>Listens with</b></div>${chainHTML("stt", st.stt || {}, moved, "LISTENING")}
          ${st.stt_server_side ? "" : `<div class="v2hint" style="color:var(--amber)">Audio is going to Google through the browser fallback. <b>brew install whisper-cpp</b> keeps it on this machine.</div>`}</div>
      </div>
      ${CHAINS.brain.includes("openai") ? `<div class="v2row">
        ${field("s-brain-url", "OpenAI-compatible base URL", (e.brain.openai || {}).base_url, "OpenAI, Ollama, LM Studio, OpenRouter")}
        ${field("s-brain-model", "Model name", (e.brain.openai || {}).model, "", "narrow")}
      </div>` : ""}
      <div class="v2sec">
        <div class="v2sech"><b>Tools Jarvis may use</b><small>MCP servers from the claude CLI · off until you turn one on</small><span class="ct">${on.length} OF ${servers.filter((m) => m.connected).length} ON</span></div>
        ${st.mcp && st.mcp.error
          ? `<div class="v2banner bad"><span class="lab">ERROR</span><span class="txt">Could not read your MCP servers: ${esc(st.mcp.error)}</span></div>`
          : !servers.length
            ? `<div class="v2hint">No MCP servers configured for the <code>claude</code> CLI. Add one with <code>claude mcp add</code>.</div>`
            : `${need.length ? `<div class="v2list">${need.map(mcpRow).join("")}</div>
                 <div class="v2hint">To sign in: run <b>claude</b> in a terminal, type <b>/mcp</b>, and pick the server. Jarvis sees it the next time this opens.</div>` : ""}
               <div class="v2grid3">${on.concat(off).map(mcpRow).join("")}</div>
               <div class="v2hint">These are the tools that send email and post publicly, so each one is off until you say otherwise. A change here reaches chat within a couple of seconds, no restart.</div>`}
      </div>`;
    },
    wire(root) {
      root.querySelectorAll("[data-up]").forEach((b) => {
        b.onclick = () => {
          const [key, i] = b.dataset.up.split(":");
          const arr = CHAINS[key];
          const name = arr[+i];
          arr.unshift(arr.splice(+i, 1)[0]);
          touch();
          drawPane(name);
        };
      });
      root.querySelectorAll("[data-mcp]").forEach((sw) => {
        sw.onchange = () => { const r = sw.closest(".v2item"); if (r && !r.classList.contains("bad")) r.classList.toggle("dim", !sw.checked); touch(); };
      });
    },
    collect(root) {
      if (!STATUS) return null;
      const p = { brain: { chain: CHAINS.brain }, voice: { chain: CHAINS.voice }, stt: { chain: CHAINS.stt } };
      // an empty server list means discovery failed, not that nothing is allowed
      if ((STATUS.mcp && STATUS.mcp.servers || []).length)
        p.chat = { mcp_servers: [...root.querySelectorAll("[data-mcp]")].filter((el) => el.checked).map((el) => el.dataset.mcp) };
      const url = root.querySelector("#s-brain-url");
      if (url) p.brain.openai = { base_url: url.value, model: root.querySelector("#s-brain-model").value };
      return p;
    },
  };

  /* MESSAGING --------------------------------------------------------- */
  const liveChannels = () => (NOTIFY ? NOTIFY.channels : []).filter((c) => !REMOVED.has(c.name));
  const envLine = (k, set, extra) => `<span class="v2envl${extra || ""}"><span class="k">${esc(k)}</span>=<span class="v">${set ? "••••••••" : "not yet"}</span><span class="st ${set ? "ok" : "no"}">${set ? "SET" : "MISSING"}</span></span>`;

  function channelCard(c) {
    const missing = c.env.filter((s) => !s.set).map((s) => s.from);
    const last = c.lastTest;
    return `<div class="v2chan${c.ok ? "" : " bad"}">
      <div class="top"><span class="ico">${ICON[c.provider] || ICON.webhook}</span><div><div class="nm">${esc(c.name)}</div><div class="prov">${esc((PROVIDERS[c.provider] || {}).label || c.provider)}</div></div><span class="fill"></span>
        ${c.ok ? `<span class="v2tag ok"><i></i>READY</span>` : `<span class="v2tag no">MISSING SECRET</span>`}</div>
      <div class="meta">${c.ok
        ? `${last ? `Last test <b>${esc(last.when)}</b> · <span class="${last.ok ? "good" : "bad"}">${esc(last.message)}</span><br>` : ""}Reads ${c.env.map((s) => esc(s.from)).join(" and ")} from .env`
        : `<span class="bad">${esc(missing.join(", "))} ${missing.length === 1 ? "is" : "are"} not in .env.</span><br>Add ${missing.length === 1 ? "it" : "them"} there and this turns green on its own.`}</div>
      <div class="acts"><button class="v2btn small line" data-test="${esc(c.name)}" ${c.ok ? "" : "disabled"}>Send test</button><span class="fill"></span><button class="v2btn small ghost" data-remove="${esc(c.name)}">Remove</button></div>
    </div>`;
  }

  function addFlowHTML() {
    const p = ADD.provider;
    const tiles = Object.keys(PROVIDERS).map((k) =>
      `<button class="v2tile${p === k ? " on" : ""}" data-provider="${k}">${ICON[k]} ${PROVIDERS[k].label}</button>`).join("");
    if (!p) return `<div class="v2sec"><div class="v2sech"><b>Where should it go?</b></div><div class="v2tiles">${tiles}</div>
      <div class="v2hint">${Object.values(PROVIDERS).map((x) => `${x.label} needs ${x.need}.`).join(" ")}</div></div>`;
    const keys = (NOTIFY.providers[p] || []);
    const allSet = keys.every((k) => k.set);
    const main = keys[0], chat = keys[1];   // telegram is the only two-key provider
    const nameOk = /^[a-z0-9_-]{1,24}$/i.test(ADD.name) && !liveChannels().some((c) => c.name === ADD.name);
    let n = 1;
    const step = (cls, title, desc, inner) => `<div class="v2step ${cls}"><span class="n">${cls === "done" ? ICON.check : n++}</span><div class="c"><div class="t">${title}</div><div class="d">${desc}</div>${inner || ""}</div></div>`;
    const s1 = step(main.set ? "done" : "now",
      `Put ${p === "telegram" ? "the bot token" : PROVIDERS[p].need} in .env`,
      `${PROVIDERS[p].how} Jarvis re-reads .env every couple of seconds, so this updates on its own.`,
      `<div class="acts">${envLine(main.key, main.set)}${main.set ? "" : `<button class="v2btn small ghost" data-copy="${esc(main.key)}=">copy the line</button>`}</div>`);
    if (main.set) n = 2;
    let s2 = "";
    if (chat) {
      const found = ADD.chats;
      s2 = step(chat.set ? "done" : main.set ? "now" : "",
        "Tell Jarvis which chat to post in",
        "Send your bot any message from your phone, then press detect. Jarvis asks Telegram who wrote to it and shows the id. It never guesses this.",
        `<div class="acts"><button class="v2btn small" data-detect ${main.set && !chat.set ? "" : "disabled"}>Detect chat id</button>${envLine(chat.key, chat.set)}</div>
         ${found ? (found.ok ? (found.chats.length
            ? `<div class="v2hint">Found ${found.chats.length === 1 ? "one chat" : found.chats.length + " chats"}. Add the line to .env and this step completes itself.</div>
               <div class="acts">${found.chats.map((c) => `<span class="v2envl copy" data-copy="${esc(chat.key)}=${esc(c.id)}" title="click to copy"><span class="k">${esc(chat.key)}</span>=<span class="v" style="color:var(--text)">${esc(c.id)}</span><span class="st ok">${esc(c.who || c.type)}</span></span>`).join("")}</div>`
            : `<div class="v2result bad">No chats yet. Open your bot in Telegram, send it any message, then detect again. Telegram keeps messages for 24 hours.</div>`)
          : `<div class="v2result bad">Telegram refused it: ${esc(found.error)}${String(found.status) === "401" ? " · a 401 means the token is wrong or was revoked in @BotFather" : ""}</div>`) : ""}`);
    }
    const s3 = step(allSet ? "now" : "",
      "Name it and send a test",
      "The name is what agents route to. Test sends a real message and shows the platform's actual reply, so a channel that exists is a channel that works.",
      `<div class="v2row" style="align-items:flex-end">
         <label class="v2f narrow"><span>Channel name</span><input id="s-chan-name" value="${esc(ADD.name)}" placeholder="phone"></label>
         <button class="v2btn small line" data-test-provider="${p}" ${allSet ? "" : "disabled"}>Send test</button>
         <button class="v2btn small" data-add ${allSet && nameOk ? "" : "disabled"}>Add channel</button>
         <button class="v2btn small ghost" data-cancel>Cancel</button>
       </div>
       ${ADD.result ? `<div class="v2result ${ADD.result.ok ? "ok" : "bad"}">${esc(ADD.result.message)}</div>` : ""}
       ${ADD.name && !nameOk ? `<div class="v2result bad">${liveChannels().some((c) => c.name === ADD.name) ? "That name is taken." : "Letters, digits, - and _ only, up to 24."}</div>` : ""}`);
    return `<div class="v2sec"><div class="v2sech"><b>Where should it go?</b></div><div class="v2tiles">${tiles}</div></div><div class="v2steps">${s1}${s2}${s3}</div>`;
  }

  PANES.messaging = {
    title: "Messaging", sub: "where Jarvis can reach you, and what it sends there",
    render() {
      if (!NOTIFY) return `<div class="v2hint">loading…</div>`;
      const chans = liveChannels();
      const agents = NOTIFY.agents.filter((a) => a.id !== "runner" && a.id !== "journal");
      const journalAgent = NOTIFY.agents.find((a) => a.id === "journal");
      const j = NOTIFY.journal || {};
      const deliver = ADD.journalDeliver !== undefined ? ADD.journalDeliver : (j.deliver || "none");
      const cols = `200px repeat(${chans.length + 1}, minmax(0, 1fr))`;
      const routing = `
      <div class="v2sec">
        <div class="v2sech"><b>Who posts where</b><small>tick a box and that agent's report goes there when it finishes</small></div>
        <div class="v2mx">
          <div class="r" style="grid-template-columns:${cols}"><div class="h">Agent</div>${chans.map((c) => `<div class="h">${esc(c.name)} <span class="prov">· ${esc((PROVIDERS[c.provider] || {}).label || c.provider)}</span></div>`).join("")}<div class="h">${ICON.mail} Email <span class="prov">· journal</span></div></div>
          ${agents.concat(journalAgent ? [journalAgent] : []).map((a) => `
          <div class="r" style="grid-template-columns:${cols}"><div><span class="nm">${esc(nice(a.label))}</span><span class="sub">${esc(a.schedule ? cronText(a.schedule) : "on demand")}</span></div>
            ${chans.map((c) => `<div><input class="v2chk" type="checkbox" data-route="${esc(a.id)}:${esc(c.name)}" ${(a.notify || []).includes(c.name) ? "checked" : ""}></div>`).join("")}
            <div>${a.id === "journal"
              ? `<div class="v2seg">${[["none", "Off"], ["gmail", "Gmail draft"], ["resend", "Send"]].map(([v, l]) => `<button data-deliver="${v}" class="${deliver === v ? "on" : ""}">${l}</button>`).join("")}</div>`
              : `<span class="none">—</span>`}</div>
          </div>`).join("")}
        </div>
        ${deliver !== "none" ? `<div class="v2row" style="align-items:flex-end">
          ${field("s-journal-to", "Send the journal to", j.to, "", "narrow", "you@example.com")}
          ${deliver === "resend" ? `<div class="acts" style="display:flex;gap:8px;padding-bottom:4px">${envLine("RESEND_API_KEY", NOTIFY.env.RESEND_API_KEY)}${envLine("JARVIS_MAIL_FROM", NOTIFY.env.JARVIS_MAIL_FROM)}</div>` : `<div class="v2hint" style="padding-bottom:12px">Needs the Gmail MCP server on under Connections. The draft waits in Gmail for you to press send.</div>`}
        </div>` : ""}
        <div class="v2hint">Email is the one route that leaves this machine on its own. Off writes the file and stops. A Gmail draft waits for you to press send. Send goes out through Resend.</div>
      </div>`;
      return `
      <div class="v2sec">
        <div class="v2sech"><b>Channels</b><small>a channel is a place, not a rule. Routing is below.</small></div>
        <div class="v2chans">${chans.map(channelCard).join("")}
          ${ADD.open ? "" : `<div class="v2chan add${chans.length ? "" : " wide"}"><div class="title">${ICON.plus} Add a channel</div><div class="v2tiles" style="justify-content:center">${Object.keys(PROVIDERS).map((k) => `<button class="v2tile" data-provider="${k}">${ICON[k]} ${PROVIDERS[k].label}</button>`).join("")}</div><div class="v2hint">ntfy is one minute and no account.</div></div>`}
        </div>
      </div>
      ${ADD.open ? addFlowHTML() : ""}
      ${routing}`;
    },
    wire(root) {
      root.querySelectorAll("[data-provider]").forEach((b) => b.onclick = () => {
        ADD.open = true; ADD.provider = b.dataset.provider; ADD.chats = null; ADD.result = null;
        drawPane(); startEnvPoll();
      });
      const cancel = root.querySelector("[data-cancel]");
      if (cancel) cancel.onclick = () => { resetAdd(); drawPane(); };
      const nameEl = root.querySelector("#s-chan-name");
      if (nameEl) nameEl.oninput = () => {
        ADD.name = nameEl.value.trim();
        // re-evaluate the Add button without redrawing the field under the cursor
        const ok = /^[a-z0-9_-]{1,24}$/i.test(ADD.name) && !liveChannels().some((c) => c.name === ADD.name);
        const add = root.querySelector("[data-add]");
        const allSet = (NOTIFY.providers[ADD.provider] || []).every((k) => k.set);
        if (add) add.disabled = !(ok && allSet);
      };
      const detect = root.querySelector("[data-detect]");
      if (detect) detect.onclick = async () => {
        detect.disabled = true; detect.textContent = "asking Telegram…";
        ADD.chats = await post("/api/notify/telegram-id").catch((e) => ({ ok: false, error: String(e) }));
        drawPane();
      };
      root.querySelectorAll("[data-test-provider]").forEach((b) => b.onclick = async () => {
        b.disabled = true; b.textContent = "sending…";
        ADD.result = await post("/api/notify/test", { provider: b.dataset.testProvider }).catch((e) => ({ ok: false, message: String(e) }));
        drawPane();
      });
      root.querySelectorAll("[data-test]").forEach((b) => b.onclick = async () => {
        b.disabled = true; b.textContent = "sending…";
        const r = await post("/api/notify/test", { channel: b.dataset.test }).catch((e) => ({ ok: false, message: String(e) }));
        const c = NOTIFY.channels.find((x) => x.name === b.dataset.test);
        if (c) c.lastTest = { ok: r.ok, message: r.message, when: when(Date.now()) };
        drawPane();
      });
      const add = root.querySelector("[data-add]");
      if (add) add.onclick = () => {
        const name = ADD.name, provider = ADD.provider;
        deepMerge(PATCH, { notify: { channels: { [name]: { provider } } } });
        NOTIFY.channels.push({ name, provider, ok: true, reason: "", env: (NOTIFY.providers[provider] || []).map((k) => ({ slot: k.key, from: k.key, set: k.set })) });
        REMOVED.delete(name);
        resetAdd(); touch(); drawPane();
      };
      root.querySelectorAll("[data-remove]").forEach((b) => b.onclick = () => {
        const name = b.dataset.remove;
        REMOVED.add(name);
        deepMerge(PATCH, { notify: { channels: { [name]: null } } });
        // and nothing may route to a channel that is gone
        for (const a of NOTIFY.agents) if ((a.notify || []).includes(name)) {
          a.notify = a.notify.filter((n) => n !== name);
          deepMerge(PATCH, { agents: { [a.id]: { notify: a.notify } } });
        }
        touch(); drawPane();
      });
      root.querySelectorAll("[data-route]").forEach((cb) => cb.onchange = () => {
        const [id, chan] = cb.dataset.route.split(":");
        const a = NOTIFY.agents.find((x) => x.id === id);
        if (!a) return;
        const set = new Set(a.notify || []);
        cb.checked ? set.add(chan) : set.delete(chan);
        a.notify = [...set];
        deepMerge(PATCH, { agents: { [id]: { notify: a.notify } } });
        touch();
      });
      root.querySelectorAll("[data-deliver]").forEach((b) => b.onclick = () => {
        ADD.journalDeliver = b.dataset.deliver;
        deepMerge(PATCH, { journal: { deliver: b.dataset.deliver } });
        touch(); drawPane();
      });
      const to = root.querySelector("#s-journal-to");
      if (to) to.oninput = () => { deepMerge(PATCH, { journal: { to: to.value.trim() } }); touch(); };
    },
  };
  function resetAdd() {
    ADD.open = false; ADD.provider = null; ADD.name = ""; ADD.chats = null; ADD.result = null;
    clearInterval(ADD.poll); ADD.poll = null;
  }
  /* While the add flow is open, .env is being edited in another window. The
   * server re-reads it every two seconds; this asks for the set/missing
   * state every three and redraws only when something changed. */
  function startEnvPoll() {
    clearInterval(ADD.poll);
    ADD.poll = setInterval(async () => {
      if (!ADD.open || !dlg.classList.contains("open")) { clearInterval(ADD.poll); ADD.poll = null; return; }
      const fresh = await get("/api/notify").catch(() => null);
      if (!fresh) return;
      const before = JSON.stringify(NOTIFY.providers), after = JSON.stringify(fresh.providers);
      const keep = NOTIFY.channels;   // session-added channels and test results live here
      NOTIFY = { ...fresh, channels: keep.map((c) => {
        const f = fresh.channels.find((x) => x.name === c.name);
        return f ? { ...f, lastTest: c.lastTest } : c;
      }) };
      if (before !== after && pane === "messaging") {
        const active = document.activeElement;
        const typing = active && active.id === "s-chan-name";
        if (!typing) drawPane();
      }
    }, 3000);
  }
  /* "0 7 * * *" -> "07:00", "0 15 * * 5" -> "Fri 15:00" */
  function cronText(expr) {
    const [min, hour, , , dow] = String(expr).split(/\s+/);
    const pad = (n) => String(n).padStart(2, "0");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const t = `${pad(hour)}:${pad(min)}`;
    return dow && dow !== "*" && days[Number(dow)] ? `${days[Number(dow)]} ${t}` : t;
  }

  /* SYSTEM ------------------------------------------------------------ */
  PANES.system = {
    title: "System", sub: "the machine, the memory, and how it looks",
    render() {
      const themes = typeof THEMES !== "undefined" ? THEMES : {};
      const cur = typeof themeName !== "undefined" ? themeName : localStorage.getItem("jarvis_theme");
      const m = CFG.memory || {}, s = CFG.server || {};
      return `
      <div class="v2sec">
        <div class="v2sech"><b>Appearance</b><small>this browser only, not saved to config</small></div>
        <div class="v2themes">${Object.entries(themes).map(([k, t]) => `
          <button class="v2theme${k === cur ? " on" : ""}" data-theme="${k}">
            <span class="sw" style="background:${t.vars["--bg"]};border-color:${t.vars["--accent"]}"><i style="background:${t.vars["--accent"]}"></i><i style="background:${t.vars["--accent-hi"]}"></i><i style="background:${t.vars["--green"]}"></i><i style="background:${t.vars["--red"]}"></i></span>
            <span><b>${esc(t.label)}</b><em>${esc(t.note)}</em></span>
          </button>`).join("")}</div>
      </div>
      <div class="v2sec">
        <div class="v2sech"><b>Chat</b></div>
        <div class="v2item"><input class="v2sw" type="checkbox" id="s-speak" ${CFG.chat.speak_replies ? "checked" : ""}><span class="v2who"><span class="nm">Speak replies</span><span class="desc">Read every chat answer aloud through the voice chain.</span></span></div>
      </div>
      <div class="v2sec">
        <div class="v2sech"><b>Memory</b><small>what Jarvis carries between conversations</small></div>
        <div class="v2row">
          ${field("s-mem-budget", "Operator memory budget", m.operator_budget, "characters", "narrow")}
          ${field("s-mem-days", "Decisions recap", m.recap_days, "days", "narrow")}
        </div>
        <div class="v2hint">All of data/memory.md goes into every prompt, so the budget is a cap on what you have asked it to remember. Past the cap, "remember that…" is refused with the reason rather than the file growing until nobody reads it.</div>
      </div>
      <div class="v2sec">
        <div class="v2sech"><b>Server</b><small>needs a restart to change</small></div>
        <div class="v2row">
          ${field("s-host", "Bind address", s.host, "", "narrow")}
          ${field("s-port", "Port", s.port, "", "narrow")}
          <div class="v2f narrow"><span>Access token</span><div class="v2hint" style="padding:12px 0">${s.token ? "set in .env" : "none · fine on 127.0.0.1"}</div></div>
        </div>
        <div class="v2hint">Chat reaches a brain that can read files and run commands. The server refuses to start on anything but loopback without JARVIS_TOKEN in .env.</div>
      </div>`;
    },
    wire(root) {
      root.querySelectorAll("[data-theme]").forEach((b) => b.onclick = () => {
        if (typeof applyTheme === "function") applyTheme(b.dataset.theme);
        root.querySelectorAll("[data-theme]").forEach((x) => x.classList.toggle("on", x === b));
      });
    },
    collect(root) {
      const v = (id) => root.querySelector("#" + id).value;
      const p = { chat: { speak_replies: root.querySelector("#s-speak").checked } };
      const budget = Number(v("s-mem-budget")), days = Number(v("s-mem-days"));
      p.memory = {};
      if (budget && budget !== CFG.memory.operator_budget) p.memory.operator_budget = budget;
      if (days && days !== CFG.memory.recap_days) p.memory.recap_days = days;
      if (!Object.keys(p.memory).length) delete p.memory;
      const host = v("s-host").trim(), port = Number(v("s-port"));
      if (host && host !== CFG.server.host) p.server = { ...(p.server || {}), host };
      if (port && port !== CFG.server.port) p.server = { ...(p.server || {}), port };
      return p;
    },
  };

  /* ------------------------------------------------------------ drawing */
  function wireGoto(root) {
    root.querySelectorAll("[data-goto]").forEach((b) => b.onclick = () => goto(b.dataset.goto));
  }
  function wireCopy(root) {
    root.querySelectorAll("[data-copy]").forEach((el) => {
      const text = el.dataset.copy;
      const label = el.textContent;
      el.onclick = () => {
        navigator.clipboard && navigator.clipboard.writeText(text);
        el.classList.add("copied");
        const inner = el.querySelector(".st") || el;
        const was = inner.textContent;
        inner.textContent = "copied";
        setTimeout(() => { inner.textContent = was === "copied" ? label : was; el.classList.remove("copied"); }, 1200);
      };
    });
  }

  function leavePane() {
    const p = PANES[pane];
    if (p && p.collect && body.dataset.drawn === pane) {
      const got = p.collect(body);
      if (got) deepMerge(PATCH, got);
    }
  }

  function drawPane(arg) {
    if (!CFG) return;
    const p = PANES[pane];
    $("v2-title").textContent = p.title;
    $("v2-sub").textContent = p.sub || "";
    $("v2-headright").innerHTML = p.headRight ? p.headRight() : "";
    // Replacing the children is what re-fires the staggered entrance in
    // ui-v2.css (the animation is on .v2body > *).
    body.innerHTML = p.render(arg);
    body.dataset.drawn = pane;
    if (p.wire) p.wire(body);
    wireCopy(body);
    // any typed edit marks the card dirty; panes with their own handlers call touch() too
    body.querySelectorAll("input:not(.v2chk):not(.v2chipadd):not([data-agent]):not([data-mcp]), textarea").forEach((el) => {
      if (el.id === "v2-q" || el.id === "s-chan-name") return;
      el.addEventListener("input", touch, { once: true });
    });
    tabs.forEach((t) => t.classList.toggle("on", t.dataset.pane === pane));
    body.scrollTop = 0;
  }

  /* Nav badges: a red dot for blocked, amber for skipping, a count otherwise. */
  function badges() {
    const rows = attention();
    const worst = {};
    for (const r of rows) if (r.go) worst[r.go] = worst[r.go] === "no" ? "no" : r.kind;
    if (rows.some((r) => r.kind === "no")) worst.overview = "no";
    else if (rows.length) worst.overview = "warn";
    for (const t of tabs) {
      const id = t.dataset.pane, b = t.querySelector(".badge");
      if (worst[id] === "no") b.innerHTML = `<span class="dot"></span>`;
      else if (worst[id] === "warn") b.innerHTML = `<span class="dot amber"></span>`;
      else if (id === "agents") b.innerHTML = `<span class="ct">${AGENTS.filter((a) => a.id !== "runner" && a.enabled !== false).length} ON</span>`;
      else if (id === "connections" && STATUS) {
        const s = (STATUS.mcp && STATUS.mcp.servers) || [];
        b.innerHTML = `<span class="ct">${s.filter((m) => m.connected && m.enabled).length} / ${s.filter((m) => m.connected).length}</span>`;
      } else if (id === "messaging" && NOTIFY) b.innerHTML = liveChannels().length ? `<span class="ct">${liveChannels().length}</span>` : "";
      else b.innerHTML = "";
    }
  }

  tabs.forEach((t) => t.onclick = () => { if (t.dataset.pane !== pane) goto(t.dataset.pane); });

  /* ------------------------------------------------------------- search
   * A small index of where things live. Typing filters it; a click or Enter
   * opens that pane. Plain names, the words people actually use. */
  const INDEX = [
    ["profile", "Your name", "owner name who"], ["profile", "What you do", "about bio description topics"],
    ["profile", "Working windows", "hours schedule time availability"], ["profile", "Channel handles", "youtube instagram tiktok linkedin x twitter handle"],
    ["profile", "Targets", "goal subscribers audience followers bar"],
    ["agents", "Agents on and off", "enable disable brief radar scout study review journal watchdog calendar postmortem social"],
    ["agents", "Install schedules", "cron launchd schedule install"], ["agents", "Run an agent now", "run now start"],
    ["agents", "Radar channels", "watch breakout youtube channels"], ["agents", "Scout lanes", "topics research lanes"],
    ["agents", "Playbook files", "knowledge brain files advice"],
    ["connections", "Brain", "claude openai model chain llm"], ["connections", "Voice out", "speak tts kokoro elevenlabs voice"],
    ["connections", "Voice in", "listen stt whisper microphone mic"], ["connections", "MCP servers", "tools gmail drive calendar apify blotato slack supabase mcp integrations"],
    ["messaging", "Messaging channels", "telegram discord slack ntfy webhook phone notify notification push"],
    ["messaging", "Who posts where", "route routing deliver report"], ["messaging", "Journal email", "journal gmail resend email nightly"],
    ["system", "Theme", "appearance theme colour color dark light"], ["system", "Speak replies", "speak aloud voice replies chat"],
    ["system", "Memory budget", "memory remember budget recap decisions"], ["system", "Server address", "host port bind token restart"],
  ];
  const q = $("v2-q"), hits = $("v2-hits");
  let hitAt = -1;
  function search() {
    const text = q.value.trim().toLowerCase();
    hitAt = -1;
    if (!text) { hits.innerHTML = ""; return; }
    const found = INDEX.filter(([, label, words]) => (label + " " + words).toLowerCase().includes(text)).slice(0, 7);
    hits.innerHTML = found.map(([id, label]) => `<button class="v2hit" data-goto="${id}">${esc(label)}<small>${NAV.find((n) => n[0] === id)[1]}</small></button>`).join("");
    hits.querySelectorAll("[data-goto]").forEach((b) => b.onclick = () => { goto(b.dataset.goto); q.value = ""; hits.innerHTML = ""; });
  }
  q.oninput = search;
  q.onkeydown = (e) => {
    const all = [...hits.querySelectorAll(".v2hit")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      hitAt = Math.max(0, Math.min(all.length - 1, hitAt + (e.key === "ArrowDown" ? 1 : -1)));
      all.forEach((b, i) => b.classList.toggle("on", i === hitAt));
    } else if (e.key === "Enter" && all.length) { (all[hitAt] || all[0]).click(); }
    else if (e.key === "Escape") { q.value = ""; hits.innerHTML = ""; q.blur(); e.stopPropagation(); }
  };
  q.onblur = () => setTimeout(() => { hits.innerHTML = ""; }, 150);

  /* ---------------------------------------------------------- open / save */
  async function openSettings(which) {
    if (which && PANES[which]) pane = which;
    openDlg(dlg);
    body.innerHTML = "loading…";
    body.dataset.drawn = "";
    PATCH = {}; dirty = false; REMOVED.clear(); resetAdd(); ADD.journalDeliver = undefined;
    for (const k of Object.keys(LISTS)) delete LISTS[k];
    $("v2-msg").className = "v2dirty clean"; $("v2-msg").innerHTML = "<i></i>no changes";
    const [cfg, ag, nt] = await Promise.all([get("/api/config"), get("/api/agents"), get("/api/notify").catch(() => null)]);
    CFG = cfg.effective; AGENTS = ag.agents || []; NOTIFY = nt;
    STATUS = null;
    CHAINS.brain = (CFG.brain.chain || []).slice();
    CHAINS.voice = (CFG.voice.chain || []).slice();
    CHAINS.stt = (CFG.stt.chain || []).slice();
    drawPane(); badges();
    // status probes every provider and can take seconds; the panes that need
    // it draw again when it lands rather than holding the whole card
    get("/api/status").then((st) => {
      STATUS = st; badges();
      if (pane === "overview" || pane === "connections") drawPane();
    }).catch(() => {});
  }

  /* A pane you looked at contributes every key it owns, including the ones
   * you did not touch. Writing those into config.json would pin today's
   * defaults into the user's file, so anything equal to what the server
   * already reports is dropped before the post. Nulls stay: they are deletes. */
  function prune(patch, eff) {
    if (!isObj(patch) || !isObj(eff)) return patch;
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) continue;
      if (!(k in eff)) continue;
      if (isObj(v) && isObj(eff[k])) {
        prune(v, eff[k]);
        if (!Object.keys(v).length) delete patch[k];
      } else if (JSON.stringify(v) === JSON.stringify(eff[k])) delete patch[k];
    }
    return patch;
  }

  $("v2-save").onclick = async () => {
    leavePane();
    prune(PATCH, CFG);
    if (!Object.keys(PATCH).length) { $("v2-msg").className = "v2dirty clean"; $("v2-msg").innerHTML = "<i></i>nothing to save"; return; }
    const msg = $("v2-msg");
    msg.className = "v2dirty saving"; msg.innerHTML = "<i></i>saving…";
    const r = await post("/api/config", { patch: PATCH });
    msg.className = "v2dirty" + (r.error ? "" : " clean");
    msg.innerHTML = "<i></i>" + esc(r.error ? r.error : r.restart_required ? "saved — restart for the new address or port" : "saved and applied");
    if (r.error) return;
    PATCH = {}; dirty = false; REMOVED.clear();
    if (window.loadData) window.loadData();
    // re-read so the panes show what was written, not what was typed
    const [cfg, ag, nt] = await Promise.all([get("/api/config"), get("/api/agents"), get("/api/notify").catch(() => null)]);
    CFG = cfg.effective; AGENTS = ag.agents || []; NOTIFY = nt; ADD.journalDeliver = undefined;
    for (const k of Object.keys(LISTS)) delete LISTS[k];
    body.dataset.drawn = "";
    drawPane(); badges();
  };

  /* --------------------------------------------------------- entry points
   * The composer's + menu, the sidebar rail and ⌘, all open the same card.
   * ui-v2.js finds openAgents / openConnections on window.JarvisPanels; they
   * are the same card opened on that pane. */
  for (const id of ["settings-btn", "nav-settings"]) {
    const btn = $(id);
    if (btn) btn.onclick = () => openSettings();
  }
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dlg.classList.contains("open")) { closeDlg(dlg); return; }
    if (e.key === "," && e.metaKey) { e.preventDefault(); openSettings(); return; }
    if (e.key === "/" && dlg.classList.contains("open") && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
  });

  window.JarvisPanels = {
    openSettings: () => openSettings(),
    openAgents: () => openSettings("agents"),
    openConnections: () => openSettings("connections"),
    openMessaging: () => openSettings("messaging"),
  };
})();
