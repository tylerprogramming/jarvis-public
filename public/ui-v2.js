/* ============================================================================
 * ui-v2.js - drop-in UI update. Load AFTER app.js and settings.js.
 *
 * Restructures the HUD to the v2 layout without touching app.js:
 *   - header becomes a band, with a full-width NOW bar under it
 *   - labelled sidebar rail, three widths
 *   - the audience card becomes a primary card plus a platform grid
 *   - the chat's agent picker moves from a vertical initials rail into the
 *     dock header as labelled tabs
 *
 * app.js is a classic top-level script, so its declarations (relayoutDuring,
 * selectView, loadData, DATA, AGENTS_LIST, fmt) share this script's global
 * scope. Nothing here reads or writes #brain, #stars, the three.js ring, or
 * the theme system.
 * ========================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const nav = $("nav");
  const rail = document.querySelector(".rail.left");
  if (!nav || !rail) return;

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (n) => (typeof fmt === "function" ? fmt(n) : String(n ?? "—"));
  const relayout = () =>
    (typeof relayoutDuring === "function" ? relayoutDuring() : dispatchEvent(new Event("resize")));

  /* index.html owns these buttons and app.js never rebuilds them, so the list
   * is taken once and shared by everything below that walks the nav. */
  const navViewBtns = [...nav.querySelectorAll(".navb[data-view]")];

  /* The same words the tooltips already used, so there is one vocabulary
   * rather than a second set of names to keep in sync. */
  const LABELS = {
    dashboard: "Dashboard",
    directives: "Directives",
    knowledge: "Knowledge",
    playbook: "Playbook",
    radar: "Radar",
    documents: "Documents",
  };

  navViewBtns.forEach((b) => {
    if (b.querySelector(".navlabel")) return;
    const s = document.createElement("span");
    s.className = "navlabel";
    s.textContent = LABELS[b.dataset.view] || b.dataset.view;
    b.appendChild(s);
  });
  for (const [id, text] of [["nav-help", "Help"], ["nav-settings", "Settings"]]) {
    const b = $(id);
    if (b && !b.querySelector(".navlabel")) {
      const s = document.createElement("span");
      s.className = "navlabel";
      s.textContent = text;
      b.appendChild(s);
    }
  }
  // the rail's Settings row carries the shortcut, the way the mock shows it
  {
    const s = $("nav-settings");
    if (s && !s.querySelector(".navkbd")) {
      const k = document.createElement("span");
      k.className = "navkbd";
      k.textContent = "⌘,";
      s.appendChild(k);
    }
  }

  /* Logo and chevron become one header row, so the chevron sits at the end of
   * the rail's own width instead of floating under the mark. */
  {
    const logo = nav.querySelector(".navlogo");
    const chev = $("nav-collapse");
    if (logo && chev && !nav.querySelector(".navhead")) {
      const head = document.createElement("div");
      head.className = "navhead";
      logo.parentNode.insertBefore(head, logo);
      head.appendChild(logo);
      const word = document.createElement("span");
      word.className = "navword";
      word.textContent = "JARVIS";
      head.appendChild(word);
      head.appendChild(chev);
    }
  }

  /* ------------------------------------------------------------- rail states
   * full  - labelled nav + panel        560px
   * nav   - labelled nav, no panel      194px
   * icons - icon rail only               60px
   *
   * The width is published as --railw so the chat deck can centre itself in
   * what is left between the rail and the right-hand column, rather than in
   * the viewport - which is what the mock shows and what stops the deck
   * sliding under the primary card when the rail is open.
   */
  const W = { full: 560, nav: 194, icons: 60 };
  let mode = "full";
  try { mode = localStorage.getItem("jarvis_rail_mode") || "full"; } catch {}
  if (!W[mode]) mode = "full";

  /* Centre the deck in what is left between the rail and the right column.
   *
   * Set inline rather than left to the CSS calc: a property that is BOTH
   * transitioned and defined through a var() does not re-resolve in Chrome when
   * only the custom property changes - --railw went 560 -> 60 and the computed
   * left stayed pinned at its old pixel value, and dropping the transition made
   * it update instantly. Inline writes transition normally, so JS owns the
   * number and CSS still owns the movement - the same split app.js uses for the
   * rail width and the dock size.
   */
  function placeDeck() {
    const rightCol =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--v2-right")) || 300;
    const narrow = innerWidth <= 900;   // below this the right column stands down
    const left = (W[mode] + 20 + innerWidth - rightCol - 24) / 2;
    for (const id of ["comms", "dockbar"]) {
      const el = $(id);
      if (el) el.style.left = narrow ? "" : left + "px";
    }
  }

  function setMode(next, quiet) {
    mode = W[next] ? next : "full";
    rail.dataset.mode = mode;
    rail.style.width = W[mode] + "px";
    document.documentElement.style.setProperty("--railw", W[mode] + "px");
    placeDeck();
    rail.classList.toggle("collapsed", mode === "icons");
    const chev = $("nav-collapse");
    if (chev) {
      // One glyph that turns over, rather than swapping « for » - a text swap
      // cannot animate. Wrapped in a span because the tooltip is a ::after on
      // the button and would turn over with it.
      chev.innerHTML = '<span class="chevglyph">&laquo;</span>';
      chev.classList.toggle("flip", mode === "icons");
      chev.setAttribute("aria-expanded", mode === "icons" ? "false" : "true");
      chev.dataset.tip = mode === "icons" ? "Expand the sidebar" : "Collapse to icons";
    }
    try { localStorage.setItem("jarvis_rail_mode", mode); } catch {}
    if (!quiet) relayout();
  }

  /* Clicking the item you are already on closes the panel instead of
   * re-selecting it. The nav keeps its labels, so nothing about where you are
   * becomes ambiguous when the panel goes away. */
  navViewBtns.forEach((b) => {
    b.onclick = () => {
      const active = b.classList.contains("on");
      if (active && mode === "full") { setMode("nav"); return; }
      if (typeof selectView === "function") selectView(b.dataset.view);
      setMode("full");
    };
  });
  {
    const chev = $("nav-collapse");
    if (chev) chev.onclick = () => setMode(mode === "icons" ? "full" : "icons");
  }

  /* Restore the saved mode with motion suppressed. app.js has already written
   * its own width by now, so an animated first paint would play a slide that
   * corresponds to nothing the user did. */
  rail.classList.add("nomotion");
  setMode(mode, true);
  setTimeout(() => rail.classList.remove("nomotion"), 50);

  /* =========================================================================
   * THE NOW BAR
   *
   * A full-width band under the header: what is running, what already ran, and
   * what is next. Built from /api/agents - the same source the ring plates use,
   * so it cannot disagree with them.
   *
   * "DONE" is real, not inferred from the clock. /api/agents carries lastRun
   * (server.js stats the agent's log file), so a finished agent reports the
   * time it actually finished. An agent whose scheduled time has merely passed
   * is not marked done - that would be reporting the timetable as history.
   * ======================================================================= */
  const nowbar = document.createElement("div");
  nowbar.id = "nowbar";
  nowbar.innerHTML =
    `<span class="nowlab">NOW</span><span id="nowpills"></span>` +
    `<span class="nowfill"></span><span id="nownext"></span>`;
  const header = document.querySelector("header");
  if (header && header.parentNode) header.parentNode.insertBefore(nowbar, header.nextSibling);
  const nowPills = nowbar.querySelector("#nowpills");
  const nowNext = nowbar.querySelector("#nownext");

  /* "05:00" / "FRI 15:00" / "ON DEMAND" -> ms from now, or null. Only used for
   * ordering, so a tag it cannot parse sorts last rather than being guessed at. */
  const nextAt = (tag) => {
    const m = String(tag || "").match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const now = new Date(), t = new Date(now);
    t.setHours(+m[1], +m[2], 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    return t - now;
  };
  const clock = (ms) =>
    new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const isToday = (ms) => {
    const d = new Date(ms), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  };

  /* Elapsed is only claimed for a run this page actually watched start. An
   * agent that was already going when you opened the tab has no start time
   * anywhere in the payload, and "RUNNING 2m" would be an invention. */
  const startedAt = new Map();

  let lastNowHtml = "";
  async function paintNow() {
    let list = [];
    try { list = (await (await fetch("/api/agents")).json()).agents || []; } catch { return; }
    const on = list.filter((a) => a.id !== "runner" && a.enabled !== false);

    for (const a of on) {
      if (a.running && !startedAt.has(a.id)) startedAt.set(a.id, Date.now());
      if (!a.running) startedAt.delete(a.id);
    }

    const running = on.filter((a) => a.running);
    const doneToday = on
      .filter((a) => !a.running && a.lastRun && isToday(a.lastRun))
      .sort((x, y) => y.lastRun - x.lastRun);
    const blocked = on.filter((a) => (a.unmet || []).length);

    // one pass for the soonest, rather than a comparator that re-parses every
    // tag into a fresh Date on each compare
    let next = null, soonest = Infinity;
    for (const a of on) {
      if (a.running) continue;
      const t = nextAt(a.tag);
      if (t !== null && t < soonest) { soonest = t; next = a; }
    }

    const mins = (id) => {
      const t = startedAt.get(id);
      if (!t) return "";
      const m = Math.floor((Date.now() - t) / 60000);
      return m >= 1 ? ` ${m}m` : "";
    };

    const pills =
      running.map((a) => `<span class="nowpill live"><i></i>${esc(a.label)} · RUNNING${mins(a.id)}</span>`)
        .concat(doneToday.slice(0, 4).map((a) =>
          `<span class="nowpill done">${esc(a.label)} · ${clock(a.lastRun)} DONE</span>`))
        .concat(blocked.length ? [`<span class="nowpill warn"><i></i>${blocked.length} BLOCKED</span>`] : []);

    if (!pills.length) pills.push(`<span class="nowpill">NOTHING RUNNING</span>`);

    const nextHtml = next
      ? `<span class="nownextlab">NEXT · ${esc(next.label)} ${esc(next.tag)}</span>` : "";

    const html = pills.join("") + "\uE000" + nextHtml;
    if (html === lastNowHtml) return;   // a 20s poll that changed nothing must not re-animate
    lastNowHtml = html;
    nowPills.innerHTML = pills.join("");
    nowNext.innerHTML = nextHtml;
  }
  paintNow();
  setInterval(paintNow, 20000);

  /* =========================================================================
   * THE RIGHT COLUMN
   *
   * app.js's renderPrimary() rewrites #pd-num / #pd-meta / #pd-deploy every
   * 20 seconds as the card cycles, so everything added here lives OUTSIDE
   * those nodes and is repainted on the same data, never inside them.
   * ======================================================================= */
  {
    const p = $("primary");
    if (p && !p.querySelector(".pdbar")) {
      const bar = document.createElement("div");
      bar.className = "pdbar";
      bar.innerHTML = "<i></i>";
      // after .meta, so the card reads number -> "followers · target 10,000"
      // -> bar. Inserted after .big it landed on top of the target line.
      const meta = p.querySelector(".meta");
      if (meta && meta.nextSibling) p.insertBefore(bar, meta.nextSibling);
      else if (meta) p.appendChild(bar);
      else p.appendChild(bar);
    }
    if (!$("platgrid")) {
      const g = document.createElement("div");
      g.id = "platgrid";
      if (p && p.parentNode) p.parentNode.insertBefore(g, p.nextSibling);
    }
  }

  /* Everything the 20s repaint writes into. All of it is either index.html's
   * own markup or created just above and never replaced, so it is looked up
   * once instead of on every pass. */
  const platGrid = $("platgrid");
  const pdLabel = $("pd-label");
  const pdBarFill = document.querySelector("#primary .pdbar i");
  const dirCap = $("dir-cap");
  const dirPanel = document.querySelector('#railbody .panel[data-view="directives"]');

  const PLATFORMS = [
    ["YT", "yt_subs"], ["LI", "linkedin_followers"],
    ["TT", "tiktok_followers"], ["IG", "ig_followers"],
  ];

  /* ------------------------------------------------------------ rail badges
   * Directives shows how many are waiting; the other views show a dot when
   * their content changed. app.js owns data-badge and clears it on select, so
   * this reads that attribute rather than duplicating its logic - and renders
   * into a real element, because the nav's ::after belongs to the tooltip.
   */
  let DIR_OPEN = null;

  /* One badge element per nav row, built once. This repaints on every
   * data-badge mutation as well as on the 20s cycle, so it does no querying. */
  const navBadges = navViewBtns.map((b) => {
    let el = b.querySelector(".navcount");
    if (!el) {
      el = document.createElement("span");
      el.className = "navcount";
      b.appendChild(el);
    }
    return { b, el, isDir: b.dataset.view === "directives" };
  });

  function paintNavBadges() {
    for (const { b, el, isDir } of navBadges) {
      const dot = (b.dataset.badge || "") !== "";
      if (isDir && DIR_OPEN != null && DIR_OPEN > 0) {
        el.className = "navcount num";
        if (el.textContent !== String(DIR_OPEN)) el.textContent = String(DIR_OPEN);
      } else if (dot) {
        el.className = "navcount dot";
        el.textContent = "";
      } else {
        el.className = "navcount";
        el.textContent = "";
      }
    }
  }
  paintNavBadges();
  // app.js writes data-badge on its own poll; follow it rather than re-deriving
  navViewBtns.forEach((b) => {
    new MutationObserver(paintNavBadges).observe(b, { attributes: true, attributeFilter: ["data-badge"] });
  });

  function paintFromData() {
    const d = typeof DATA !== "undefined" ? DATA : null;
    if (!d || !d.vitals) return;
    const v = d.vitals;
    const audience = PLATFORMS.reduce((s, [, k]) => s + (v[k] || 0), 0);

    if (platGrid) {
      platGrid.innerHTML = PLATFORMS.map(([lab, key]) =>
        `<div class="plat"><span class="pl">${lab}</span><b>${num(v[key])}</b></div>`).join("");
    }

    // progress toward the active primary card's target
    const cards = (d.config && d.config.primary_cards) || [];
    const label = (pdLabel.textContent || "").replace(/^PRIMARY DIRECTIVE · /, "");
    const card = cards.find((c) => c.label === label) || cards[0];
    if (pdBarFill && card) {
      const total = card.metric === "audience"
        ? audience
        : card.metric === "arr" ? ((v.business || {}).arr || 0) : (v.yt_subs || 0);
      const pct = card.target ? Math.max(0, Math.min(100, (total / card.target) * 100)) : 0;
      pdBarFill.style.width = pct + "%";
      pdBarFill.classList.toggle("over", pct >= 100);
    }

    const dirs = d.directives || [];
    const open = dirs.filter((x) => !x.done).length;
    DIR_OPEN = dirs.length ? open : null;
    paintNavBadges();
    if (dirCap && dirs.length) dirCap.textContent = `${dirs.length - open} / ${dirs.length}`;

    // the audience card pinned under the directives list
    if (dirPanel) {
      let foot = dirPanel.querySelector(".paneltotal");
      if (!foot) {
        foot = document.createElement("div");
        foot.className = "paneltotal";
        dirPanel.appendChild(foot);
      }
      const wk = ["yt_subs", "ig_followers", "tiktok_followers", "linkedin_followers"]
        .map((k) => (typeof weekDelta === "function" ? weekDelta(d.history, k) : null))
        .filter((x) => x != null).reduce((a, b) => a + b, 0);
      foot.innerHTML =
        `<span class="tl">TOTAL AUDIENCE</span>` +
        `<span class="tn">${num(audience)}</span>` +
        (wk ? `<span class="td ${wk >= 0 ? "up" : "down"}">${wk >= 0 ? "+" : ""}${num(wk)}</span>` : "");
    }
  }

  /* Repaint on app.js's own data cycle rather than on a second timer, so the
   * two halves of the right column can never show numbers from different
   * fetches. Same wrapping trick app.js uses on setState for the wake word. */
  if (typeof loadData === "function") {
    const orig = loadData;
    loadData = async function (...a) {
      const r = await orig.apply(this, a);
      try { paintFromData(); } catch {}
      return r;
    };
  }
  setTimeout(paintFromData, 600);
  setInterval(paintFromData, 20000);   // follows renderPrimary's card cycle

  /* =========================================================================
   * THE CHAT DECK
   *
   * The agent picker moves out of its initials rail into the dock header as
   * labelled tabs, with the tail behind a +N.
   *
   * app.js owns #dockrail's markup and rewrites it on every agent poll, so
   * this observes the node and re-labels whatever it just wrote instead of
   * trying to own it.
   * ======================================================================= */
  {
    const dockrail = $("dockrail");
    const head = document.querySelector("#comms .dockhead");
    const nameEl = $("dock-name");
    if (dockrail && head && nameEl) {
      // a mark in front of the name, as the mock has it
      if (!head.querySelector(".dockmark")) {
        const m = document.createElement("span");
        m.className = "dockmark";
        m.textContent = "J";
        head.insertBefore(m, nameEl);
      }
      head.insertBefore(dockrail, nameEl.nextSibling);

      /* The observer has to be DISCONNECTED while we write, not guarded by a
       * flag: MutationObserver callbacks are delivered as microtasks, so a
       * synchronous `dressing = true / false` pair is already back to false by
       * the time the callback runs. Guarded that way this re-entered forever
       * and hung the tab. Writes are also made idempotent, so a stray record
       * cannot start a second lap. */
      const obs = new MutationObserver(() => dress());
      const watch = () => obs.observe(dockrail, { childList: true, subtree: true });

      function dress() {
        obs.disconnect();
        try {
          const scroll = dockrail.querySelector(".dscroll") || dockrail;
          const tiles = [...scroll.querySelectorAll(".dtile[data-tab]")];
          const byId = new Map(
            (typeof AGENTS_LIST !== "undefined" ? AGENTS_LIST : []).map((a) => [a.id, a.label]));
          const showAll = dockrail.classList.contains("all");

          tiles.forEach((t) => {
            const lab = byId.get(t.dataset.tab);
            if (lab && t.dataset.dressed !== lab) {
              // keep the live/unread markers, replace only the initials
              const marks = [...t.querySelectorAll(".live, .unread")];
              t.textContent = lab.charAt(0) + lab.slice(1).toLowerCase();
              marks.forEach((m) => t.appendChild(m));
              t.dataset.dressed = lab;
            }
          });

          let more = dockrail.querySelector(".dmore");
          if (!more) {
            more = document.createElement("button");
            more.className = "dmore";
            more.type = "button";
            more.onclick = () => { dockrail.classList.toggle("all"); dress(); };
          }
          if (more.parentNode !== scroll || scroll.lastElementChild !== more) scroll.appendChild(more);

          /* How many fit is measured, not assumed. A fixed count overflowed the
           * header at the compact dock width and ran the tabs under the brain
           * pill; the strip is flex-basis 0, so its clientWidth IS the space
           * left over once the name and the right-hand controls have taken
           * theirs. Everything is shown before measuring, because a tile that
           * is display:none has no width to measure. */
          tiles.forEach((t) => t.classList.remove("hidden"));
          // measured at its widest label, so the space reserved is never short
          more.hidden = false;
          more.textContent = "+" + tiles.length;
          const moreW = more.offsetWidth;

          let fit = tiles.length;
          if (!showAll && tiles.length) {
            const GAP = 6;
            const avail = dockrail.clientWidth - 10;   // the padding-left
            let used = 0;
            fit = 0;
            for (let k = 0; k < tiles.length; k++) {
              const w = tiles[k].offsetWidth + (k ? GAP : 0);
              const needMore = k < tiles.length - 1 ? GAP + moreW : 0;
              if (used + w + needMore > avail) break;
              used += w;
              fit = k + 1;
            }
            /* No forced minimum. Selecting an agent puts its name in the header
             * AND reveals the RUN NOW / BLOCKED button, which together can leave
             * less room than one tab needs - and a tab sliced through a word
             * ("Cale") reads as breakage. When nothing fits the strip collapses
             * to the +N, which still opens the full list. */
          }

          tiles.forEach((t, i) => t.classList.toggle("hidden", !showAll && i >= fit));
          const extra = showAll ? 0 : tiles.length - fit;
          const want = showAll ? "−" : `+${extra}`;
          if (more.textContent !== want) more.textContent = want;
          more.hidden = !showAll && !extra;
        } finally { watch(); }
      }

      dress();
      // the dock changes width on expand/compact and on window resize, and the
      // number that fits changes with it
      if (window.ResizeObserver) new ResizeObserver(() => dress()).observe($("comms"));

      /* Selecting an agent rewrites the header around the strip: the name
       * becomes the agent's, and RUN NOW / BLOCKED is un-hidden beside it.
       * Neither changes #dockrail or resizes #comms, so no observer above
       * fires - and the strip kept measuring against space it no longer had.
       * These two watch the furniture that takes the room. */
      {
        const runBtn = $("dock-run");
        if (runBtn) new MutationObserver(() => dress())
          .observe(runBtn, { attributes: true, attributeFilter: ["hidden", "disabled"] });
        new MutationObserver(() => dress())
          .observe(nameEl, { childList: true, characterData: true, subtree: true });
      }
    }
  }

  /* ⌘K focuses the composer. The mock draws the hint on the field; a hint for
   * a shortcut that does nothing would be worse than no hint, so it is bound
   * here rather than only drawn. app.js's "/" binding is untouched. */
  {
    const cmd = $("cmd");
    const composer = document.querySelector("#comms .dockcomposer");
    if (cmd && composer && !composer.querySelector(".cmdk")) {
      const k = document.createElement("span");
      k.className = "cmdk";
      k.textContent = "⌘K";
      cmd.parentNode.insertBefore(k, cmd.nextSibling);
    }
    addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (typeof setDock === "function" && $("comms") && getComputedStyle($("comms")).display === "none")
          setDock("compact");
        cmd && cmd.focus();
      }
    });
  }

  /* =========================================================================
   * HEADER STATE
   *
   * CORE and LINK were decoration: index.html hardcodes ONLINE and no JS ever
   * touched them, so the lights said ONLINE whether or not anything was. They
   * are wired to /api/status here, so green means something:
   *
   *   CORE  the server answered this poll
   *   LINK  a brain is actually available to answer the command bar
   *   RUNNER app.js already drives this one; idle is grey, working is green
   *
   * The " · " between the name and the state is a bare text node in app.js's
   * markup, so hiding the <b> with CSS alone left "CORE ·" dangling. It is
   * rewritten here - app.js only ever touches the <b>, so this survives.
   * ======================================================================= */
  {
    const parts = ["m-core", "m-link", "m-runner"].map((id) => {
      const el = $(id);
      if (!el) return null;
      const span = el.parentElement;
      const node = [...span.childNodes].find((n) => n.nodeType === 3 && /\S/.test(n.nodeValue));
      return node ? { el, span, node, base: node.nodeValue.replace(/[\s·]+$/, "") } : null;
    }).filter(Boolean);

    const byId = (id) => parts.find((p) => p.el.id === id);

    const paint = (p, state, word) => {
      if (!p) return;
      p.span.classList.remove("ok", "idle", "bad");
      p.span.classList.add(state);
      // the dot carries a healthy state on its own; the word earns its space
      // only when the state is one you would want to read
      const quiet = state === "ok";
      p.span.classList.toggle("quiet", quiet);
      const want = quiet ? p.base : p.base + " · ";
      if (p.node.nodeValue !== want) p.node.nodeValue = want;
      if (word != null && p.el.textContent !== word) p.el.textContent = word;
    };

    const syncRunner = () => {
      const p = byId("m-runner");
      if (!p) return;
      const idle = /^IDLE$/i.test((p.el.textContent || "").trim());
      paint(p, idle ? "idle" : "ok", null);
    };
    const rp = byId("m-runner");
    if (rp) new MutationObserver(syncRunner).observe(rp.el, {
      childList: true, characterData: true, subtree: true,
    });

    async function syncHealth() {
      let up = false, brain = null;
      try {
        const s = await (await fetch("/api/status")).json();
        up = true;
        brain = (s.brain || {}).active || null;
      } catch {}
      paint(byId("m-core"), up ? "ok" : "bad", up ? "ONLINE" : "NO REPLY");
      paint(byId("m-link"), brain ? "ok" : "bad", brain ? "ONLINE" : "NO BRAIN");
      syncRunner();
    }
    syncHealth();
    setInterval(syncHealth, 20000);
  }

  /* =========================================================================
   * MARKDOWN IN THE DOCUMENT MODAL
   *
   * Opening a playbook file or a report dropped the raw .md into the modal
   * with the syntax still in it, so it gets rendered.
   *
   * Written out rather than pulled in: this HUD vendors its own fonts to avoid
   * a CDN, and shipping a markdown library for six block types would be the
   * same trade in the other direction. Everything is escaped before any markup
   * is added, and code spans are lifted out first so their contents can never
   * be re-parsed as markdown.
   * ======================================================================= */
  const mdEsc = (s) => String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function mdInline(t) {
    const held = [];
    // code spans first: whatever is inside them is text, not syntax
    t = String(t).replace(/`([^`]+)`/g, (m, c) => {
      held.push("<code>" + mdEsc(c) + "</code>");
      return "\uE000I" + (held.length - 1) + "\uE000";
    });
    t = mdEsc(t);
    t = t.replace(/!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, txt, href) =>
      /^(https?:|\/|#)/.test(href)
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${txt || href}</a>`
        : (txt || href));
    t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    t = t.replace(/~~([^~]+)~~/g, "<s>$1</s>");
    t = t.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    t = t.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
    // the BRAIN files stamp rules with [confirmed YYYY-MM-DD]; make it a chip
    t = t.replace(/\[(confirmed|new|closed|scoped)\s+([^\]]+)\]/gi,
      (m, k, v) => `<span class="mdstamp">${k.toUpperCase()} ${mdEsc(v)}</span>`);
    return t.replace(/\uE000I(\d+)\uE000/g, (m, i) => held[+i]);
  }

  const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

  function mdBlocks(src) {
    const blocks = [];
    let s = String(src || "").replace(/\r\n?/g, "\n");
    // fenced code out of the way before anything else touches the text
    s = s.replace(/```[^\n]*\n([\s\S]*?)```/g, (m, body) => {
      blocks.push('<pre class="mdpre"><code>' + mdEsc(body.replace(/\n$/, "")) + "</code></pre>");
      return "\uE000B" + (blocks.length - 1) + "\uE000";
    });

    const lines = s.split("\n");
    const out = [];
    let para = [];
    const flush = () => { if (para.length) { out.push("<p>" + mdInline(para.join(" ")) + "</p>"); para = []; } };

    let i = 0;
    while (i < lines.length) {
      const ln = lines[i];
      const held = ln.trim().match(/^\uE000B(\d+)\uE000$/);
      if (held) { flush(); out.push(blocks[+held[1]]); i++; continue; }
      if (!ln.trim()) { flush(); i++; continue; }

      let m;
      if ((m = ln.match(/^\s{0,3}(#{1,6})\s+(.*)$/))) {
        flush();
        const lv = m[1].length;
        out.push(`<h${lv}>${mdInline(m[2].replace(/\s+#+\s*$/, ""))}</h${lv}>`);
        i++; continue;
      }
      if (/^\s{0,3}(([-*_])\s*){3,}$/.test(ln)) { flush(); out.push("<hr>"); i++; continue; }

      if (/^\s{0,3}>\s?/.test(ln)) {
        flush();
        const buf = [];
        while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s{0,3}>\s?/, "")); i++;
        }
        out.push("<blockquote>" + mdBlocks(buf.join("\n")) + "</blockquote>");
        continue;
      }

      // table: a header row followed by a |---|---| divider
      if (ln.includes("|") && i + 1 < lines.length && /^[\s|:-]+$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
        flush();
        const cells = (r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
        const head = cells(lines[i]);
        i += 2;
        const body = [];
        while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { body.push(cells(lines[i])); i++; }
        out.push('<table class="mdtable"><thead><tr>' +
          head.map((c) => "<th>" + mdInline(c) + "</th>").join("") + "</tr></thead><tbody>" +
          body.map((r) => "<tr>" + r.map((c) => "<td>" + mdInline(c) + "</td>").join("") + "</tr>").join("") +
          "</tbody></table>");
        continue;
      }

      if (LIST_RE.test(ln)) { flush(); const r = mdList(lines, i, blocks); out.push(r.html); i = r.i; continue; }

      para.push(ln.trim());
      i++;
    }
    flush();
    return out.join("");
  }

  /* Nesting is by indent, and a wrapped line that is not itself a bullet is a
   * continuation of the one above it - which is how the BRAIN files are
   * actually written. */
  function mdList(lines, i, blocks) {
    const first = lines[i].match(LIST_RE);
    const base = first[1].length;
    const ordered = /\d/.test(first[2]);
    const items = [];
    while (i < lines.length) {
      const m = lines[i] && lines[i].match(LIST_RE);
      if (m && m[1].length >= base + 2 && items.length) {
        const sub = [];
        const indent = m[1].length;
        while (i < lines.length && lines[i] &&
               (lines[i].match(/^(\s*)/)[1].length >= indent || !lines[i].trim())) {
          if (!lines[i].trim()) break;
          sub.push(lines[i].slice(Math.min(indent, base + 2)));
          i++;
        }
        items[items.length - 1].sub += mdBlocks(sub.join("\n"));
        continue;
      }
      if (!m || m[1].length !== base) break;
      const item = { text: m[3], sub: "" };
      i++;
      while (i < lines.length && lines[i] && lines[i].trim() &&
             !LIST_RE.test(lines[i]) && lines[i].match(/^(\s*)/)[1].length > base) {
        item.text += " " + lines[i].trim();
        i++;
      }
      items.push(item);
    }
    const tag = ordered ? "ol" : "ul";
    return {
      html: `<${tag}>` + items.map((x) => "<li>" + mdInline(x.text) + x.sub + "</li>").join("") + `</${tag}>`,
      i,
    };
  }

  /* app.js sets className="plain" and then textContent in the same task, so by
   * the time this observer's microtask runs both are the new document. The
   * other two modal users (.structured, and the agent explainer, which builds
   * nodes) are left alone. */
  {
    const body = $("modal-body");
    if (body) {
      const obs = new MutationObserver(() => render());
      const watch = () => obs.observe(body, {
        childList: true, characterData: true, subtree: true,
        attributes: true, attributeFilter: ["class"],
      });
      const render = () => {
        obs.disconnect();
        try {
          if (body.classList.contains("plain")) {
            const src = body.textContent || "";
            if (src.trim()) {
              body.innerHTML = mdBlocks(src);
              body.className = "md";
            }
          }
        } finally { watch(); }
      };
      render();
      watch();
    }
  }
  window.JarvisMarkdown = { render: mdBlocks, inline: mdInline };

  /* The deck and the right column moved in CSS; the ring is laid out in JS
   * against their measured rectangles, so it needs a nudge once the
   * stylesheet has landed. */
  requestAnimationFrame(relayout);
  addEventListener("load", () => { placeDeck(); relayout(); });
  addEventListener("resize", () => { placeDeck(); relayout(); });
})();
