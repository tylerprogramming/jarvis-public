/* ============================================================================
 * settings.js - replaces the single scrolling modal with three surfaces.
 *
 * The old dialog carried eight sections in one column: identity fields you set
 * once sat above fifteen MCP toggles you touch weekly, eight screens of scroll
 * apart, with no way to jump. Split by how often you touch a thing and what
 * you are doing when you touch it:
 *
 *   Settings     - what you type and forget. Identity, Channels, Targets,
 *                  Research. Four panes behind a left nav.
 *   Agents       - what runs, when, and whether it is actually installed.
 *   Connections  - who answers, how it speaks, what it may reach.
 *
 * Each dialog saves ONLY its own keys. The old save() built one patch from
 * every field in the DOM, which meant a dialog that had not rendered the agent
 * checkboxes would post `agents.enabled: []` and silently turn everything off.
 * Partial patches cannot do that.
 *
 * Secrets are still not editable here - the server rejects them and points at
 * .env, and that is the right answer.
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

  /* Open and close as two animated edges rather than a display toggle: .open
   * mounts and plays in, .closing plays out, and the node stays in the document
   * for the length of the exit.
   *
   * Both edges are CSS animations, not transitions to a second class - see the
   * dialog section of ui-v2.css for why. The offsetWidth read below is a forced
   * reflow, which restarts the entrance synchronously so there is no frame to
   * miss on a backgrounded tab.
   *
   * CLOSE_MS matches the longest exit animation in ui-v2.css (v2cardDown).
   */
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

  const closeAll = () => document.querySelectorAll(".v2dlg.open").forEach(closeDlg);

  /* Settings -> Agents and Settings -> Connections cross-fade: the first card
   * has to be most of the way out before the second starts, or two cards are
   * on screen at once and neither reads as the one you asked for. */
  const handOff = (from, open) => { closeDlg(from); setTimeout(open, CLOSE_MS - 60); };

  function dialog(id, inner) {
    const el = document.createElement("div");
    el.id = id;
    el.className = "v2dlg";
    el.innerHTML = inner;
    document.body.appendChild(el);
    el.onclick = (e) => { if (e.target === el) closeDlg(el); };
    el.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => closeDlg(el)));
    return el;
  }

  const get = (p) => fetch(p).then((r) => r.json());

  async function patch(body, msgEl) {
    if (msgEl) { msgEl.className = "v2dirty saving"; msgEl.innerHTML = "<i></i>saving…"; }
    const r = await (await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch: body }),
    })).json();
    if (msgEl) {
      msgEl.className = "v2dirty" + (r.error ? "" : " clean");
      msgEl.innerHTML = "<i></i>" + esc(
        r.error ? r.error
          : r.restart_required ? "saved — restart for the new address or port"
          : "saved and applied");
    }
    if (!r.error && window.loadData) window.loadData();
    return r;
  }

  /* ------------------------------------------------------------------- chips
   * Radar channels, scout lanes and playbook files were comma-joined into one
   * input each. Four YouTube channel IDs in a 650px box is a string that runs
   * off the right edge and cannot be read, let alone edited - and deleting the
   * middle one meant hand-surgery on commas. They are lists, so they get list
   * controls.
   *
   * A change redraws the whole box, so chips carry a `fresh` flag from the
   * index they were added at: only the new ones play in, and the ten that were
   * already sitting there do not all re-animate because you typed an eleventh.
   */
  const LISTS = {};
  function chipsHTML(id, mono, freshFrom) {
    const vals = LISTS[id] || [];
    const from = Number.isInteger(freshFrom) ? freshFrom : vals.length;
    return vals.map((v, i) =>
      `<span class="v2chip${mono ? " mono" : ""}${i >= from ? " fresh" : ""}"><span class="txt">${esc(v)}</span><i data-i="${i}">✕</i></span>`
    ).join("");
  }
  function chips(id, vals, placeholder, mono) {
    LISTS[id] = (vals || []).slice();
    return `<div class="v2chips" id="${id}" data-mono="${mono ? 1 : 0}">${chipsHTML(id, mono)}<input class="v2chipadd" placeholder="${esc(placeholder)}"></div>`;
  }
  function wireChips(root) {
    root.querySelectorAll(".v2chips").forEach((box) => {
      const id = box.id, mono = box.dataset.mono === "1";
      let busy = false;   // a chip is playing out; ignore clicks until it lands
      const redraw = (freshFrom) => {
        const input = box.querySelector(".v2chipadd");
        box.innerHTML = chipsHTML(id, mono, freshFrom);
        box.appendChild(input);
        bind();
      };
      const bind = () => {
        box.querySelectorAll("i[data-i]").forEach((x) => {
          x.onclick = () => {
            if (busy) return;
            busy = true;
            // remove it on screen first, then from the list. Splicing first
            // would rebuild the box and there would be nothing left to animate.
            const chip = x.closest(".v2chip");
            const i = +x.dataset.i;
            if (chip) chip.classList.add("gone");
            setTimeout(() => {
              LISTS[id].splice(i, 1);
              busy = false;
              redraw();
            }, 170);
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
        // paste a comma list and get chips, not one long chip
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

  const field = (id, label, value, hint, cls) => `
    <label class="v2f ${cls || ""}"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</span>
    <input id="${id}" value="${esc(value ?? "")}"></label>`;

  /* ------------------------------------------------------------------ SETTINGS */
  const settings = dialog("v2-settings", `
    <div class="v2card split">
      <div class="v2side">
        <h3>Settings <kbd>⌘,</kbd></h3>
        <button class="v2tab on" data-pane="identity">Identity</button>
        <button class="v2tab" data-pane="channels">Channels<span class="ct" id="v2-chcount"></span></button>
        <button class="v2tab" data-pane="targets">Targets</button>
        <button class="v2tab" data-pane="research">Research</button>
        <span class="fill"></span>
        <div class="rule"></div>
        <div class="cap">MOVED OUT</div>
        <button class="v2tab" data-goto="agents">Agents<span class="ct">›</span></button>
        <button class="v2tab" data-goto="connections">Connections<span class="ct">›</span></button>
      </div>
      <div class="v2main">
        <div class="v2head"><h4 id="v2-panetitle">Identity</h4><span class="fill"></span>
          <button class="v2x" data-close>✕</button></div>
        <div class="v2body" id="v2-panes">loading…</div>
        <div class="v2foot">
          <span class="v2dirty clean" id="v2-msg"><i></i>no changes</span>
          <span class="fill"></span>
          <button class="v2btn ghost" data-close>Close</button>
          <button class="v2btn" id="v2-save">Save</button>
        </div>
      </div>
    </div>`);

  let CFG = null, CARDS = [];

  /* Switching panes replaces the pane's markup, so field values have to be
   * lifted out before they are destroyed - otherwise editing Identity, looking
   * at Channels, and hitting Save posts the old name back. */
  const DRAFT = {};
  function capture() {
    ["s-name", "s-owner", "s-about", "s-hours",
     "s-youtube", "s-instagram", "s-tiktok", "s-linkedin", "s-x"]
      .forEach((id) => { const el = $(id); if (el) DRAFT[id] = el.value; });
    CARDS.forEach((c, i) => {
      const el = $(`s-target-${i}`);
      if (el) DRAFT[`s-target-${i}`] = el.value;
    });
  }

  const PANES = {
    identity: (e) => `
      <div class="v2row">
        ${field("s-name", "HUD name", e.name, "", "narrow")}
        ${field("s-owner", "Your name", e.profile.owner, "", "narrow")}
      </div>
      <label class="v2f ${e.profile.about ? "" : "flag"}">
        <span>What you do${e.profile.about ? "" : "<em>EMPTY · SCOUT IS GUESSING</em>"}</span>
        <textarea id="s-about" placeholder="I make YouTube videos about building AI agents with Claude Code, for developers who want working systems rather than demos.">${esc(e.profile.about || "")}</textarea>
        <span class="v2hint">Scout and Study read this to pick topics. Blank is why their picks drift.</span>
      </label>
      <label class="v2f">
        <span>Working windows<small>when you can actually do the work</small></span>
        <input id="s-hours" value="${esc(e.profile.working_hours || "")}" placeholder="Mon–Fri 09:00–12:00, Sat 14:00–17:00">
        <span class="v2hint">Directives are only scheduled inside these.</span>
      </label>`,

    channels: (e) => {
      const ch = e.profile.channels || {};
      // Which platforms have a collector at all. The dashboard's PLATFORMS
      // count comes from these, not from how many handles you have typed.
      const COLLECTED = { youtube: 1, instagram: 1, tiktok: 1, linkedin: 1, x: 0 };
      const NAMES = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", x: "X" };
      const row = (k) => {
        const has = !!String(ch[k] || "").trim();
        const cls = !COLLECTED[k] ? "dim" : has ? "" : "dim";
        return `<div class="v2item ${cls}">
          <span class="v2tag ${COLLECTED[k] && has ? "ok" : ""}"><i></i>${COLLECTED[k] ? (has ? "COLLECTED" : "NO HANDLE") : "NO COLLECTOR"}</span>
          <span class="nm w">${NAMES[k]}</span>
          <label class="v2f" style="min-width:0"><input id="s-${k}" value="${esc(ch[k] ?? "")}" placeholder="@handle"></label>
        </div>`;
      };
      return `<div class="v2list">${Object.keys(NAMES).map(row).join("")}</div>
        <div class="v2banner info"><span class="lab">NOTE</span><span class="txt">Only platforms with a collector feed your audience total. X has a handle field because the profile keeps one, but nothing reads it — so it is not in the number on the dashboard.</span></div>`;
    },

    targets: (e) => {
      CARDS = e.primary_cards || [];
      if (!CARDS.length) return `<div class="v2hint">No primary cards configured.</div>`;
      return `<div class="v2list">${CARDS.map((c, i) => `
        <div class="v2item">
          <span class="nm w2">${esc(c.label)}</span>
          <span class="desc">${esc(c.hint || "The dashboard bar fills toward this number.")}</span>
          <label class="v2f num narrow" style="min-width:0"><input id="s-target-${i}" value="${esc(c.target)}"></label>
        </div>`).join("")}</div>
        <div class="v2banner info"><span class="lab">TIP</span><span class="txt">A target you have already passed pins the progress bar at 100% and stops telling you anything. Set these to numbers you have not hit yet.</span></div>`;
    },

    research: (e) => `
      <div class="v2group">
        <div class="v2grouphead"><b>Radar channels</b><small>watched for breakouts</small><span class="ct">${(e.radar.channels || []).length}</span></div>
        ${chips("s-radar", e.radar.channels, "+ Add channel", true)}
      </div>
      <div class="v2group">
        <div class="v2grouphead"><b>Scout lanes</b><small>topics it hunts in</small><span class="ct">${((e.research || {}).lanes || []).length}</span></div>
        ${chips("s-lanes", (e.research || {}).lanes, "+ Add lane")}
      </div>
      <div class="v2group">
        <div class="v2sep">ADVANCED</div>
        <div class="v2grouphead"><b>Playbook files</b><small>read before every piece of advice</small></div>
        ${chips("s-brain", e.knowledge.brain_files, "+ Add path", true)}
      </div>`,
  };

  const TITLES = { identity: "Identity", channels: "Channels", targets: "Targets", research: "Research" };
  let pane = "identity";
  const paneTabs = [...settings.querySelectorAll(".v2tab[data-pane]")];

  function drawPane() {
    if (!CFG) return;
    $("v2-panetitle").textContent = TITLES[pane];
    const body = $("v2-panes");
    // Replacing the children is what re-fires the staggered entrance in
    // ui-v2.css - the animation is on .v2body > *, so fresh nodes play and
    // nothing here has to add or strip a class to make that happen.
    body.innerHTML = PANES[pane](CFG);
    wireChips(body);
    paneTabs.forEach((t) => t.classList.toggle("on", t.dataset.pane === pane));
  }

  paneTabs.forEach((t) => {
    t.onclick = () => {
      if (t.dataset.pane === pane) return;   // no reason to replay the pane
      capture(); pane = t.dataset.pane; drawPane();
    };
  });
  settings.querySelector('[data-goto="agents"]').onclick = () => handOff(settings, openAgents);
  settings.querySelector('[data-goto="connections"]').onclick = () => handOff(settings, openConnections);

  async function openSettings() {
    openDlg(settings);
    const cfg = await get("/api/config");
    CFG = cfg.effective;
    const ch = CFG.profile.channels || {};
    $("v2-chcount").textContent = Object.values(ch).filter((v) => String(v || "").trim()).length;
    drawPane();
  }

  /* Only the keys this dialog owns. Fields belonging to a pane you never
   * opened are simply absent from the patch, which is what keeps a partial
   * dialog from clearing them. */
  $("v2-save").onclick = async () => {
    capture();
    const val = (id) => DRAFT[id];
    const body = {};
    if (DRAFT["s-name"] !== undefined) {
      body.name = val("s-name");
      body.profile = {
        owner: val("s-owner"),
        about: val("s-about"),
        working_hours: val("s-hours"),
      };
    }
    if (DRAFT["s-youtube"] !== undefined) {
      body.profile = Object.assign(body.profile || {}, {
        channels: {
          youtube: val("s-youtube"), instagram: val("s-instagram"),
          tiktok: val("s-tiktok"), linkedin: val("s-linkedin"), x: val("s-x"),
        },
      });
    }
    if (DRAFT["s-target-0"] !== undefined) {
      body.primary_cards = CARDS.map((c, i) => ({
        ...c, target: Number(val(`s-target-${i}`)) || c.target,
      }));
    }
    if (LISTS["s-radar"]) body.radar = { channels: LISTS["s-radar"] };
    if (LISTS["s-lanes"]) body.research = { lanes: LISTS["s-lanes"] };
    if (LISTS["s-brain"]) body.knowledge = { brain_files: LISTS["s-brain"] };
    await patch(body, $("v2-msg"));
  };

  /* -------------------------------------------------------------------- AGENTS */
  const agentsDlg = dialog("v2-agents", `
    <div class="v2card">
      <div class="v2head"><h4>Agents</h4><span class="v2tag" id="v2-agcount"></span>
        <span class="fill"></span>
        <div class="v2filters">
          <button class="v2filter on" data-f="all">All</button>
          <button class="v2filter" data-f="on">On</button>
          <button class="v2filter" data-f="off">Off</button>
        </div>
        <button class="v2x" data-close>✕</button></div>
      <div class="v2body" id="v2-agbody">loading…</div>
      <div class="v2foot">
        <span class="v2dirty clean" id="v2-agmsg"><i></i>no changes</span>
        <span class="fill"></span>
        <button class="v2btn ghost" data-close>Close</button>
        <button class="v2btn" id="v2-agsave">Save</button>
      </div>
    </div>`);

  let AGENTS = [], AGFILTER = "all";

  /* Daily / weekly / on demand, read off the tag the ring already shows. The
   * old dialog listed nine agents in one flat grid, which hid the fact that
   * five of them run every morning and three do not. */
  const cadence = (tag) => {
    const t = String(tag || "").trim().toUpperCase();
    if (/^\d{1,2}:\d{2}$/.test(t)) return "EVERY DAY";
    if (/(MON|TUE|WED|THU|FRI|SAT|SUN)/.test(t)) return "WEEKLY";
    return "OTHER";
  };

  function drawAgents() {
    const body = $("v2-agbody");
    const real = AGENTS.filter((a) => a.id !== "runner");
    const list = real.filter((a) =>
      AGFILTER === "all" ? true : AGFILTER === "on" ? a.enabled !== false : a.enabled === false);

    const groups = ["EVERY DAY", "WEEKLY", "OTHER"];
    const blocked = AGENTS.filter((a) => (a.unmet || []).length);

    body.innerHTML =
      `<div class="v2banner"><span class="lab">SCHEDULES</span>
        <span class="txt">Turning an agent on here saves the choice, but cron does not know about it until you install. Until then these times are what you want, not what will run.</span>
        <code id="v2-install">jarvis agents install</code></div>` +
      (blocked.length
        ? `<div class="v2banner bad"><span class="lab">BLOCKED</span><span class="txt">${blocked.map((a) =>
            `<b>${esc(a.label)}</b> needs ${esc((a.unmet || []).join(", "))}`).join(" · ")}</span></div>`
        : "") +
      groups.map((g) => {
        const rows = list.filter((a) => cadence(a.tag) === g);
        if (!rows.length) return "";
        return `<div class="v2group"><div class="v2sep">${g === "OTHER" ? "ON DEMAND / PER VIDEO" : g}</div>
          <div class="v2list">${rows.map((a) => `
            <div class="v2item${a.enabled === false ? " dim" : ""}">
              <input class="v2sw" type="checkbox" data-agent="${esc(a.id)}" ${a.enabled !== false ? "checked" : ""}>
              <span class="nm w">${esc(a.label)}</span>
              <span class="sched">${esc(a.tag || "on demand")}</span>
              <span class="desc">${esc(a.description || "")}</span>
              ${a.running ? '<span class="v2tag live"><i></i>RUNNING</span>' : ""}
              <button class="v2btn small ghost" data-run="${esc(a.id)}">Run now</button>
            </div>`).join("")}</div></div>`;
      }).join("");

    $("v2-agcount").textContent = real.filter((a) => a.enabled !== false).length + " ON";

    const code = $("v2-install");
    if (code) code.onclick = () => {
      navigator.clipboard && navigator.clipboard.writeText("jarvis agents install");
      code.textContent = "copied";
      code.classList.add("copied");
      setTimeout(() => {
        code.textContent = "jarvis agents install";
        code.classList.remove("copied");
      }, 1200);
    };
    // The row dims as the toggle moves, rather than only on the next redraw -
    // otherwise the switch animates and the row it belongs to does not.
    body.querySelectorAll("[data-agent]").forEach((sw) => {
      sw.onchange = () => {
        const row = sw.closest(".v2item");
        if (row) row.classList.toggle("dim", !sw.checked);
      };
    });
    body.querySelectorAll("[data-run]").forEach((b) => {
      b.onclick = async () => {
        b.disabled = true; b.textContent = "running…";
        try { await fetch("/api/agents/run", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: b.dataset.run }),
        }); } catch {}
        b.textContent = "started";
      };
    });
  }

  const agFilters = [...agentsDlg.querySelectorAll(".v2filter")];
  agFilters.forEach((f) => {
    f.onclick = () => {
      if (AGFILTER === f.dataset.f) return;
      AGFILTER = f.dataset.f;
      agFilters.forEach((x) => x.classList.toggle("on", x === f));
      drawAgents();
    };
  });

  async function openAgents() {
    openDlg(agentsDlg);
    AGENTS = (await get("/api/agents")).agents || [];
    drawAgents();
  }

  $("v2-agsave").onclick = () => patch({
    agents: {
      enabled: [...agentsDlg.querySelectorAll("[data-agent]")]
        .filter((el) => el.checked).map((el) => el.dataset.agent),
    },
  }, $("v2-agmsg"));

  /* --------------------------------------------------------------- CONNECTIONS */
  const connDlg = dialog("v2-conns", `
    <div class="v2card">
      <div class="v2head"><h4>Connections</h4><span class="v2tag" id="v2-connneed"></span>
        <span class="fill"></span>
        <span style="font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;color:var(--dim)">SECRETS LIVE IN .ENV</span>
        <button class="v2x" data-close>✕</button></div>
      <div class="v2body" id="v2-connbody">loading…</div>
      <div class="v2foot">
        <span class="v2dirty clean" id="v2-connmsg"><i></i>no changes</span>
        <span class="fill"></span>
        <button class="v2btn ghost" data-close>Close</button>
        <button class="v2btn" id="v2-connsave">Save</button>
      </div>
    </div>`);

  let CHAINS = {};

  /* One list per chain instead of a dropdown plus a duplicate status row.
   * The dropdown said "kokoro - not set up" while a row underneath said
   * "kokoro off", which is the same fact twice and neither told you which
   * provider was actually answering. Here the row that is answering says so,
   * and moving one to the front is what reordering the chain means. */
  function chainHTML(key, ready, moved) {
    const chain = CHAINS[key];
    const answeringAt = chain.findIndex((x) => ready[x]);   // the same for every row
    return `<div class="v2list">${chain.map((n, i) => {
      const ok = !!ready[n];
      const first = i === 0;
      const answering = ok && answeringAt === i;
      return `<div class="v2item ${answering ? "good" : ok ? "" : "dim"}${moved === n ? " moved" : ""}">
        <span class="ord">${i + 1}</span>
        <span class="nm w">${esc(n)}</span>
        ${answering
          ? `<span class="v2tag live"><i></i>${key === "voice" ? "SPEAKING" : key === "stt" ? "LISTENING" : "ANSWERING"}</span>`
          : ok ? `<span class="v2tag ok"><i></i>READY</span>`
               : `<span class="v2tag no">${esc((HINTS[n] || "not set up").toUpperCase())}</span>`}
        <span class="fill"></span>
        ${first ? "" : `<button class="v2btn small ghost" data-up="${key}:${i}">move up</button>`}
      </div>`;
    }).join("")}</div>`;
  }

  function drawConns(st, moved) {
    const e = CFG;
    const servers = (st.mcp && st.mcp.servers) || [];
    const need = servers.filter((m) => !m.connected);
    const on = servers.filter((m) => m.connected && m.enabled);
    const off = servers.filter((m) => m.connected && !m.enabled);

    const needTag = $("v2-connneed"), connBody = $("v2-connbody");
    needTag.className = "v2tag" + (need.length ? " no" : " ok");
    needTag.innerHTML = need.length ? `${need.length} NEED YOU` : "<i></i>ALL CONNECTED";

    const mcpRow = (m, small) => `
      <div class="v2item ${m.connected ? (m.enabled ? "" : "dim") : "bad"}">
        <input class="v2sw" type="checkbox" data-mcp="${esc(m.name)}" ${m.enabled ? "checked" : ""} ${m.connected ? "" : "disabled"}>
        <span class="nm ${small ? "" : "w2"}">${esc(m.name)}</span>
        ${small ? "" : `<span class="key">${esc(m.prefix || "")}</span>`}
        ${m.connected ? "" : `<span class="v2tag no">${esc(m.status || "needs authentication")}</span>`}
      </div>`;

    connBody.innerHTML = `
      <div class="v2group">
        <div class="v2grouphead"><b>Brain</b><small>who answers the command bar · first working one wins</small></div>
        ${chainHTML("brain", st.brain.providers || {}, moved)}
        ${CHAINS.brain.includes("openai") ? `
        <div class="v2row" style="padding-left:50px">
          ${field("s-brain-url", "OpenAI-compatible base URL", (e.brain.openai || {}).base_url, "OpenAI, Ollama, LM Studio, OpenRouter")}
          ${field("s-brain-model", "Model name", (e.brain.openai || {}).model, "", "narrow")}
        </div>` : ""}
      </div>

      <div class="v2cols">
        <div class="v2group">
          <div class="v2grouphead"><b>Voice out</b><small>how it speaks</small></div>
          ${chainHTML("voice", st.voice || {}, moved)}
        </div>
        <div class="v2group">
          <div class="v2grouphead"><b>Voice in</b><small>how it hears you</small></div>
          ${chainHTML("stt", st.stt || {}, moved)}
          ${(st.stt || {}).input === false ? `<div class="v2banner bad"><span class="lab">NO MIC</span>
            <span class="txt">This machine has no audio input device, so nothing above can hear you
            whatever it says it is ready for. Plug a microphone in
            &mdash; <b>System Settings &rsaquo; Sound &rsaquo; Input</b>.</span></div>` : ""}
          ${st.stt_server_side ? "" : `<div class="v2banner bad"><span class="lab">PRIVACY</span>
            <span class="txt">Your audio is going to Google through the browser fallback. <b>brew install whisper-cpp</b> keeps it on this machine.</span></div>`}
        </div>
      </div>

      <div class="v2group">
        <div class="v2grouphead"><b>MCP servers</b><small>tools Jarvis may reach</small>
          <span class="ct">${servers.length}</span></div>
        ${st.mcp && st.mcp.error
          ? `<div class="v2banner bad"><span class="lab">ERROR</span><span class="txt">Could not read your MCP servers: ${esc(st.mcp.error)}</span></div>`
          : !servers.length
            ? `<div class="v2hint">No MCP servers configured for the <code>claude</code> CLI.</div>`
            : `${need.length ? `<div class="v2sep">NEEDS AUTHENTICATION</div>
                 <div class="v2list">${need.map((m) => mcpRow(m)).join("")}</div>` : ""}
               ${on.length ? `<div class="v2sep">ON · JARVIS CAN CALL THESE</div>
                 <div class="v2grid2">${on.map((m) => mcpRow(m, true)).join("")}</div>` : ""}
               ${off.length ? `<div class="v2sep">OFF · CONNECTED BUT NOT REACHABLE</div>
                 <div class="v2grid3">${off.map((m) => mcpRow(m, true)).join("")}</div>` : ""}`}
      </div>`;

    // Move-to-front, same semantics as the old dropdown: a pick reorders the
    // chain rather than replacing it, so it can never strand you with nothing.
    // The row that moved is named back into the redraw so it can flash where
    // it landed - a list that silently reorders leaves you hunting for it.
    connBody.querySelectorAll("[data-up]").forEach((b) => {
      b.onclick = () => {
        const [key, i] = b.dataset.up.split(":");
        const arr = CHAINS[key];
        const name = arr[+i];
        arr.unshift(arr.splice(+i, 1)[0]);
        drawConns(st, name);
      };
    });
    connBody.querySelectorAll("[data-mcp]").forEach((sw) => {
      sw.onchange = () => {
        const row = sw.closest(".v2item");
        if (row && !row.classList.contains("bad")) row.classList.toggle("dim", !sw.checked);
      };
    });
  }

  async function openConnections() {
    openDlg(connDlg);
    const [cfg, st] = await Promise.all([get("/api/config"), get("/api/status")]);
    CFG = cfg.effective;
    CHAINS = {
      brain: (CFG.brain.chain || []).slice(),
      voice: (CFG.voice.chain || []).slice(),
      stt: (CFG.stt.chain || []).slice(),
    };
    drawConns(st);
  }

  $("v2-connsave").onclick = () => {
    const body = {
      brain: { chain: CHAINS.brain },
      voice: { chain: CHAINS.voice },
      stt: { chain: CHAINS.stt },
      chat: {
        mcp_servers: [...connDlg.querySelectorAll("[data-mcp]")]
          .filter((el) => el.checked).map((el) => el.dataset.mcp),
      },
    };
    if ($("s-brain-url")) {
      body.brain.openai = { base_url: $("s-brain-url").value, model: $("s-brain-model").value };
    }
    return patch(body, $("v2-connmsg"));
  };

  /* --------------------------------------------------------------- entry points
   * Both the composer's + menu and the sidebar rail open Settings, same as
   * before. ui-v2.js adds the rail's Agents and Connections buttons and finds
   * them on window.JarvisPanels. */
  for (const id of ["settings-btn", "nav-settings"]) {
    const btn = $(id);
    if (btn) btn.onclick = openSettings;
  }
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
    if (e.key === "," && e.metaKey) { e.preventDefault(); openSettings(); }
  });

  window.JarvisPanels = { openSettings, openAgents, openConnections };
})();
