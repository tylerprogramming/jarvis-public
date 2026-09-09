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
  /* app.js's top-level declarations share this script's scope, but reaching for
   * one that is missing must not take the rest of this file down with it. */
  const appGlobal = (fn) => { try { fn(); } catch {} };

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
   * and a health verdict from the run ledger (lib/runs.js), so a finished
   * agent reports the time it actually finished and DONE is only claimed when
   * the run exited 0 and left what it was meant to leave. An agent whose
   * scheduled time has merely passed is not marked done - that would be
   * reporting the timetable as history. Anything not ok (failed, overdue, not
   * loaded, stale) gets its own pill in a warning colour, because the log
   * mtime version of this bar showed DONE for twelve days of nothing running.
   * ======================================================================= */
  const nowbar = document.createElement("div");
  nowbar.id = "nowbar";
  nowbar.innerHTML =
    `<span class="nowlab">NOW</span><span id="nowpills"></span>` +
    `<span class="nowfill"></span><span id="nowattn"></span><span id="nownext"></span>`;
  const header = document.querySelector("header");
  if (header && header.parentNode) header.parentNode.insertBefore(nowbar, header.nextSibling);
  const nowPills = nowbar.querySelector("#nowpills");
  const nowNext = nowbar.querySelector("#nownext");
  const nowAttn = nowbar.querySelector("#nowattn");

  /* Words for a health state, and which warning token it wears. FAILED is
   * red because it is a run that happened and broke; the rest are amber
   * because nothing broke, something just did not happen. */
  const STATE_WORD = {
    failed: "FAILED", overdue: "OVERDUE", "not-loaded": "NOT LOADED", stale: "STALE", never: "NEVER RAN",
  };
  const stateClass = (s) => (s === "failed" ? "bad" : STATE_WORD[s] ? "warn" : "");
  const healthOf = (a) => (a.health && a.health.state) || "ok";
  // an on-demand agent that has not run yet is not a problem, only a fact
  const needsAttention = (a) => Boolean(STATE_WORD[healthOf(a)]) && !a.running && (healthOf(a) !== "never" || a.schedule);
  /* The agents-need-attention modal. There is no agents panel in the rail,
   * so the click opens the same modal app.js uses to explain an agent, with
   * one line per problem and the fix beside it. */
  const attentionModal = (list) => {
    const title = $("modal-title"), body = $("modal-body"), modal = $("modal");
    if (!title || !body || !modal) return;
    title.textContent = `${list.length} AGENT${list.length === 1 ? "" : "S"} NEED ATTENTION`;
    body.textContent = "";
    for (const a of list) {
      const row = document.createElement("div");
      row.className = "v2attn";
      row.innerHTML = `<b>${esc(a.label)}</b> <span class="st ${stateClass(healthOf(a))}">${esc(STATE_WORD[healthOf(a)])}</span>` +
        `<div class="dt">${esc((a.health && a.health.detail) || "")}</div>`;
      body.appendChild(row);
    }
    const foot = document.createElement("div");
    foot.className = "v2attn foot";
    foot.textContent = "jarvis doctor prints the same list with the fix for each one.";
    body.appendChild(foot);
    modal.classList.add("open");
  };
  nowAttn.addEventListener("click", (e) => {
    e.stopPropagation();
    attentionModal(lastAgents.filter((a) => a.id !== "runner" && a.enabled !== false && needsAttention(a)));
  });

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
  let lastAgents = [];
  async function paintNow() {
    let list = [];
    try { list = (await (await fetch("/api/agents")).json()).agents || []; } catch { return; }
    lastAgents = list;
    const on = list.filter((a) => a.id !== "runner" && a.enabled !== false);

    for (const a of on) {
      if (a.running && !startedAt.has(a.id)) startedAt.set(a.id, Date.now());
      if (!a.running) startedAt.delete(a.id);
    }

    const running = on.filter((a) => a.running);
    const attention = on.filter(needsAttention);
    const doneToday = on
      .filter((a) => !a.running && healthOf(a) === "ok" && a.lastRun && isToday(a.lastRun))
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

    // failed first, then the rest of the trouble, then what ran clean; the
    // bar is read left to right and the left is what needs a decision
    const order = { failed: 0, "not-loaded": 1, overdue: 2, stale: 3, never: 4 };
    attention.sort((x, y) => (order[healthOf(x)] ?? 9) - (order[healthOf(y)] ?? 9));
    const pills =
      running.map((a) => `<span class="nowpill live"><i></i>${esc(a.label)} · RUNNING${mins(a.id)}</span>`)
        .concat(attention.slice(0, 4).map((a) =>
          `<span class="nowpill ${stateClass(healthOf(a))}" title="${esc((a.health && a.health.detail) || "")}"><i></i>${esc(a.label)} · ${esc(STATE_WORD[healthOf(a)])}</span>`))
        .concat(doneToday.slice(0, 4).map((a) =>
          `<span class="nowpill done" title="${esc((a.health && a.health.detail) || "")}">${esc(a.label)} · ${clock(a.lastRun)} DONE</span>`))
        .concat(blocked.length ? [`<span class="nowpill bad"><i></i>${blocked.length} BLOCKED</span>`] : []);

    if (!pills.length) pills.push(`<span class="nowpill">NOTHING RUNNING</span>`);

    const nextHtml = next
      ? `<span class="nownextlab">NEXT · ${esc(next.label)} ${esc(next.tag)}</span>` : "";
    const attnHtml = attention.length
      ? `<span class="nowattnlab" title="click for the list">${attention.length} AGENT${attention.length === 1 ? "" : "S"} NEED${attention.length === 1 ? "S" : ""} ATTENTION</span>` : "";

    const html = pills.join("") + "\uE000" + nextHtml + "\uE000" + attnHtml;
    if (html === lastNowHtml) return;   // a 20s poll that changed nothing must not re-animate
    lastNowHtml = html;
    nowPills.innerHTML = pills.join("");
    nowNext.innerHTML = nextHtml;
    nowAttn.innerHTML = attnHtml;
  }
  paintNow();
  setInterval(paintNow, 20000);

  /* The ring plates say the same thing. app.js builds them from /api/agents
   * and toggles live/off; this adds the health word under the schedule tag
   * and a bad/warn class, reading the same AGENTS_LIST app.js filled, so
   * app.js stays untouched and the plate and the pill can never disagree
   * (same payload, same words). */
  function paintPlates() {
    const list = (typeof AGENTS_LIST !== "undefined" && Array.isArray(AGENTS_LIST)) ? AGENTS_LIST : [];
    for (const a of list) {
      const el = $("ag-" + a.id);
      if (!el) continue;
      const state = a.enabled === false ? "ok" : healthOf(a);
      // the same rule as the pills: an on-demand agent that never ran is
      // not trouble, it just has no word yet
      const trouble = needsAttention(a);
      const word = a.running ? "" : trouble ? STATE_WORD[state] : (state === "ok" && a.lastRun ? "DONE" : "");
      let st = el.querySelector(".astate");
      if (!st) { st = document.createElement("span"); st.className = "astate"; el.appendChild(st); }
      if (st.textContent !== word) st.textContent = word;
      el.classList.toggle("bad", trouble && stateClass(state) === "bad");
      el.classList.toggle("warn", trouble && stateClass(state) === "warn");
      if (a.health && a.health.detail) el.title = `${a.description || a.label}. ${a.health.detail}`;
    }
  }
  /* app.js's setInterval(loadAgents, 8000) holds the original function, so
   * wrapping the name would only catch the first call. A MutationObserver on
   * the ring container fires whenever app.js repaints a plate's classes, and
   * the 20s poll above covers the rest; the observer disconnects during its
   * own writes so the two cannot ping-pong. */
  {
    const box = $("agents");
    if (box) {
      let painting = false;
      const obs = new MutationObserver(() => {
        if (painting) return;
        painting = true;
        try { paintPlates(); } catch {}
        painting = false;
      });
      obs.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }
    setTimeout(paintPlates, 800);
    setInterval(paintPlates, 20000);
  }

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

  /* STALE · 12d on the primary card and on the dashboard vitals. Amber, not
   * red: the numbers are real, they are just old, and the fix is one
   * command, named in the tooltip. Removed again the moment a fresh collect
   * lands, so the absence of the badge means something. */
  function paintStale(age) {
    const stale = Boolean(age && age.stale);
    const days = age && age.hours != null ? Math.round(age.hours / 24) : null;
    const word = stale ? `STALE · ${age && age.hours == null ? "never" : days >= 1 ? `${days}d` : `${Math.round(age.hours)}h`}` : "";
    const when = age && age.updated_at ? new Date(age.updated_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "never";
    const tip = `last collected ${when}; run jarvis collect --fetch`;
    const put = (host, cls) => {
      if (!host) return;
      let b = host.querySelector(`.${cls.split(" ")[0]}`);
      if (!stale) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement("span"); b.className = cls; host.appendChild(b); }
      if (b.textContent !== word) b.textContent = word;
      b.title = tip;
    };
    // #pd-label's text is rewritten by renderPrimary on every cycle, so the
    // badge sits beside it on the card, not inside it
    put($("primary"), "v2stale pd");
    const vit = $("vitals");
    // the dashboard vitals are rebuilt by app.js render(); the badge is
    // appended to the hero head when there is one, else to the panel
    put(vit && (vit.querySelector(".herohead") || vit), "v2stale");
  }

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

    /* How old the numbers are. The server decides (vitals_age from
     * /api/data, against vitals.stale_hours), this only paints it: a badge on
     * the primary card and one on the dashboard vitals, so a number that
     * has not been collected in twelve days does not read as this morning's.
     * The badge is a sibling of the label, never inside #pd-num or #pd-meta,
     * which app.js rewrites on its 20s cycle. */
    paintStale(d.vitals_age);

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
   * One conversation, with Jarvis. The agent picker is gone: app.js still
   * routes a per-agent transcript behind #dockrail, but switching between ten
   * of them was a tab strip to maintain for a thing nobody wanted to do.
   *
   * Removing the node rather than hiding it is deliberate - renderCommsTabs()
   * opens with `if (!rail) return`, so app.js stops rebuilding ten buttons on
   * every agent poll instead of rebuilding them into something invisible.
   * ======================================================================= */
  {
    const head = document.querySelector("#comms .dockhead");
    const nameEl = $("dock-name");
    if (head && nameEl && !head.querySelector(".dockmark")) {
      const m = document.createElement("span");
      m.className = "dockmark";
      m.textContent = "J";
      head.insertBefore(m, nameEl);
    }
    const dockrail = $("dockrail");
    if (dockrail) dockrail.remove();

    /* With no tabs there is no way back to an agent's transcript, and
     * applyCommsFilter() hides every message whose data-agent is not the
     * selected tab - so "radar started" and "morning finished" would have gone
     * on being written and never shown again. One stream now shows all of it.
     * app.js calls this on every addMsg, so it has to stay cheap. */
    appGlobal(() => {
      applyCommsFilter = () => {
        msgs.querySelectorAll('.msg[style*="display"]').forEach((m) => {
          m.style.display = "";
        });
      };
      applyCommsFilter();
    });
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

  /* =========================================================================
   * OPENING A DOCUMENT
   *
   * The Documents panel says "click one to read it" and never did: app.js
   * renders the rows with data-f and wires nothing, only the Playbook rules
   * open. One opener, delegated so it survives every re-render, reading
   * through /api/doc so the server's directory allow-list still applies.
   *
   * The same opener answers ?doc=<path> on the URL, which is what a
   * notification's link mode points at: the message on your phone opens the
   * report it is about, not the deck.
   * ======================================================================= */
  async function openDoc(file, fallbackName) {
    if (!file) return;
    let r;
    try { r = await (await fetch("/api/doc?f=" + encodeURIComponent(file))).json(); }
    catch (e) { r = { error: String(e) }; }
    $("modal-title").textContent = r.name || fallbackName || file.split("/").pop();
    const body = $("modal-body");
    body.className = "plain";
    body.textContent = r.content || r.error || "";
    $("modal").classList.add("open");
  }
  window.openDoc = openDoc;
  {
    const list = $("documents");
    if (list) list.addEventListener("click", (e) => {
      const row = e.target.closest(".doc[data-f]");
      if (row) openDoc(row.dataset.f, row.title);
    });
    const wanted = new URLSearchParams(location.search).get("doc");
    if (wanted) {
      // Relative to the repo is what notify.py sends; /api/doc wants a real
      // path, so let the server resolve it against its own root.
      addEventListener("load", () => openDoc(wanted));
      history.replaceState(null, "", location.pathname);
    }
  }

  /* =========================================================================
   * FOCUS
   *
   * body.focus hides everything but the brain, the ring and the conversation.
   * The CSS does the hiding; this owns the switch, the way back, the shortcut
   * and the two numbers the layout code reads: --railw, so placeDeck() centres
   * the composer in the whole viewport, and a relayout so the ring grows into
   * the space the furniture gave up. Persisted like the rail mode, so a reload
   * lands where you left it.
   * ======================================================================= */
  {
    const body = document.body;
    const head = document.querySelector("#comms .dockhead");
    const expand = $("dock-expand");
    let btn = $("dock-focus");
    if (head && !btn) {
      btn = document.createElement("button");
      btn.id = "dock-focus";
      btn.className = "dockbtn";
      btn.innerHTML = "&#9678;";
      btn.dataset.tip = "Focus \u2014 just the brain and the conversation.  \u2318/";
      btn.setAttribute("aria-label", "Focus mode");
      head.insertBefore(btn, expand || null);
    }
    let exit = $("focus-exit");
    if (!exit) {
      exit = document.createElement("button");
      exit.id = "focus-exit";
      exit.innerHTML = "<i></i>Focus <kbd>esc</kbd>";
      exit.setAttribute("aria-label", "Leave focus mode");
      body.appendChild(exit);
    }

    function setFocus(on, quiet) {
      body.classList.toggle("focus", on);
      if (on) {
        // The dock has to be visible in focus; a minimised bar has nothing
        // to type into. Compact is enough, the CSS sizes it.
        if (typeof setDock === "function" && $("comms") && getComputedStyle($("comms")).display === "none")
          setDock("compact");
        document.documentElement.style.setProperty("--railw", "0px");
        const c = $("comms"); if (c) c.style.left = "";
      } else {
        setMode(mode, true);   // restores --railw and the deck's left
      }
      try { localStorage.setItem("jarvis_focus", on ? "1" : "0"); } catch {}
      if (!quiet) { relayout(); setTimeout(relayout, 460); }
      if (on) { const cmd = $("cmd"); cmd && cmd.focus(); }
    }
    const isFocus = () => body.classList.contains("focus");

    if (btn) btn.onclick = () => setFocus(!isFocus());
    exit.onclick = () => setFocus(false);
    addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") { e.preventDefault(); setFocus(!isFocus()); return; }
      // Escape leaves focus only when nothing else is open to close first;
      // settings.js and app.js keep their own Escape handlers.
      if (e.key === "Escape" && isFocus()) {
        const modal = $("modal");
        const openSettings = document.querySelector(".settings.open, #settings.open, [data-settings].open");
        if ((modal && modal.classList.contains("open")) || openSettings) return;
        setFocus(false);
      }
    });

    let saved = "0";
    try { saved = localStorage.getItem("jarvis_focus") || "0"; } catch {}
    if (saved === "1") setFocus(true, true);
  }

  /* =========================================================================
   * MEMORY
   *
   * A New conversation control in the dock head, and a Memory view in the
   * rail. Both talk to the server, which owns the files: the page never
   * writes memory itself. The nav button and panel are built here rather
   * than in index.html so the v2 files stay a drop-in; app.js's selectView()
   * finds them by data-view like the six it shipped with, so nothing there
   * needs a hook.
   * ======================================================================= */
  {
    const head = document.querySelector("#comms .dockhead");
    const focusBtn = $("dock-focus");
    let fresh = $("dock-new");
    if (head && !fresh) {
      fresh = document.createElement("button");
      fresh.id = "dock-new";
      fresh.className = "dockbtn";
      fresh.innerHTML = "&#43;";
      fresh.dataset.tip = "Start a new conversation";
      fresh.setAttribute("aria-label", "Start a new conversation");
      head.insertBefore(fresh, focusBtn || $("dock-expand") || null);
    }
    if (fresh) fresh.onclick = async () => {
      try { await fetch("/api/chat/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } catch {}
      try { localStorage.removeItem("jarvis_session"); } catch {}
      // app.js keeps the id in a top-level `let`; clearing storage alone would
      // let the next send resume the old session from that variable
      appGlobal(() => { sessionId = null; });
      const list = $("msgs");
      if (list) list.innerHTML = "";
      appGlobal(() => addMsg("sys", "new conversation"));
    };

    // the rail entry, after Documents
    let navBtn = nav.querySelector('.navb[data-view="memory"]');
    if (!navBtn) {
      navBtn = document.createElement("button");
      navBtn.className = "navb";
      navBtn.dataset.view = "memory";
      navBtn.dataset.tip = "Memory \u2014 what you told Jarvis to keep";
      navBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M9 3.6h6a2.4 2.4 0 0 1 2.4 2.4v12a2.4 2.4 0 0 1-2.4 2.4H9A2.4 2.4 0 0 1 6.6 18V6A2.4 2.4 0 0 1 9 3.6z"/><path d="M9.6 8.4h4.8M9.6 12h4.8M9.6 15.6h3"/><path d="M6.6 9h-1.4M6.6 15h-1.4M17.4 9h1.4M17.4 15h1.4"/></svg>' +
        '<span class="navlabel">Memory</span><span class="navcount"></span>';
      const docs = nav.querySelector('.navb[data-view="documents"]');
      if (docs && docs.nextSibling) nav.insertBefore(navBtn, docs.nextSibling);
      else nav.insertBefore(navBtn, nav.querySelector(".navfill"));
      navBtn.onclick = () => {
        const active = navBtn.classList.contains("on");
        if (active && mode === "full") { setMode("nav"); return; }
        if (typeof selectView === "function") selectView("memory");
        setMode("full");
        paintMemory();
      };
    }

    const railbody = $("railbody");
    let panel = railbody && railbody.querySelector('.panel[data-view="memory"]');
    if (railbody && !panel) {
      panel = document.createElement("div");
      panel.className = "panel";
      panel.dataset.view = "memory";
      panel.title = "Facts you told Jarvis to keep. Every chat and every agent reads these.";
      panel.innerHTML =
        '<h2>Memory <small id="mem-cap">OPERATOR</small></h2>' +
        '<div class="panelbody" id="memory"></div>' +
        '<div class="memhint">Say <b>remember that &hellip;</b> in chat to add a line, <b>/forget &lt;words&gt;</b> to drop one.</div>';
      railbody.appendChild(panel);
    }
    const memBody = $("memory");
    const memCap = $("mem-cap");

    async function paintMemory() {
      if (!memBody) return;
      let d = null;
      try { d = await (await fetch("/api/memory")).json(); } catch {}
      if (!d || !Array.isArray(d.lines)) {
        memBody.innerHTML = '<div class="memempty">could not read memory</div>';
        return;
      }
      if (memCap) memCap.textContent = `${d.chars} / ${d.budget}`;
      const pct = d.budget ? Math.min(100, Math.round((d.chars / d.budget) * 100)) : 0;
      let html = `<div class="memmeter" title="${d.chars} of ${d.budget} characters"><i style="width:${pct}%"></i></div>`;
      if (!d.lines.length) {
        html += '<div class="memempty">Nothing kept yet. Say "remember that ..." in chat.</div>';
      } else {
        const order = d.sections || [];
        const groups = new Map();
        for (const l of d.lines) {
          if (!groups.has(l.section)) groups.set(l.section, []);
          groups.get(l.section).push(l);
        }
        const names = [...order.filter((s) => groups.has(s)), ...[...groups.keys()].filter((s) => !order.includes(s))];
        for (const s of names) {
          html += `<div class="memsect">${esc(s)}</div>`;
          for (const l of groups.get(s)) {
            html += `<div class="memline" data-hash="${esc(l.hash)}">` +
              `<span class="memdate">${esc(l.date)}</span>` +
              `<span class="memtext">${esc(l.text)}</span>` +
              `<button class="memdel" data-tip="Forget this line" aria-label="Forget this line">&times;</button></div>`;
          }
        }
      }
      memBody.innerHTML = html;
      memBody.querySelectorAll(".memdel").forEach((b) => {
        b.onclick = async (e) => {
          e.stopPropagation();
          const row = b.closest(".memline");
          const hash = row && row.dataset.hash;
          if (!hash) return;
          try { await fetch("/api/memory?hash=" + encodeURIComponent(hash), { method: "DELETE" }); } catch {}
          paintMemory();
        };
      });
    }

    // app.js restores the saved view before this block runs, and when it was
    // memory it falls back to the dashboard and overwrites jarvis_view with
    // that, because the panel did not exist yet. So the choice is kept under
    // a second key that only this file writes, through the same rebinding
    // trick used on loadData, and restored from here.
    appGlobal(() => {
      const orig = selectView;
      selectView = function (name) {
        const r = orig.apply(this, arguments);
        try { localStorage.setItem("jarvis_view_v2", name); } catch {}
        if (name === "memory") paintMemory();
        return r;
      };
    });
    let savedView = null;
    try { savedView = localStorage.getItem("jarvis_view_v2"); } catch {}
    if (savedView === "memory") appGlobal(() => selectView("memory"));
    if (panel && panel.classList.contains("on")) paintMemory();
    // a remembered line lands through chat, so a finished send repaints
    if (typeof loadData === "function") {
      const orig = loadData;
      loadData = async function (...a) {
        const r = await orig.apply(this, a);
        if (panel && panel.classList.contains("on")) { try { await paintMemory(); } catch {} }
        return r;
      };
    }
  }

  /* =========================================================================
   * EXPERIMENTS
   *
   * A small read-only block at the top of the Playbook panel: the open
   * experiments from data/decisions.jsonl and the last three closed with
   * their verdict. The page never writes it; the review agent opens and
   * closes through scripts/experiments.py. app.js rebuilds #playbook on
   * every loadData(), so this rides on the same rebinding trick the Memory
   * block uses and prepends itself after each repaint.
   * ======================================================================= */
  {
    const host = () => $("playbook");
    let last = null;

    function paintExperiments(d) {
      const box = host();
      if (!box) return;
      let block = box.querySelector(".expblock");
      if (!block) {
        block = document.createElement("div");
        block.className = "expblock";
        box.insertBefore(block, box.firstChild);
      }
      if (!d || !Array.isArray(d.experiments)) {
        block.innerHTML = '<div class="exphead"><span>EXPERIMENTS</span></div><div class="expempty">could not read the ledger</div>';
        return;
      }
      const open = d.experiments.filter((e) => e.status === "open");
      const closed = d.experiments.filter((e) => e.status === "closed").slice(-3).reverse();
      const overdue = open.filter((e) => e.overdue).length;
      let html = `<div class="exphead"><span>EXPERIMENTS</span>` +
        `<small>${open.length} OPEN${overdue ? ` <b class="expover">${overdue} OVERDUE</b>` : ""}</small></div>`;
      if (!open.length && !closed.length) {
        html += '<div class="expempty">No experiments yet. The Sunday review opens one and closes it the week after.</div>';
      }
      for (const e of open) {
        const when = e.days_left === null ? "no deadline"
          : e.overdue ? `OVERDUE by ${-e.days_left} day${e.days_left === -1 ? "" : "s"}`
          : e.days_left === 0 ? "due today"
          : `${e.days_left} day${e.days_left === 1 ? "" : "s"} left`;
        html += `<div class="exp${e.overdue ? " overdue" : ""}" title="${esc(e.id)}">` +
          `<div class="exphyp">${esc(e.hypothesis)}</div>` +
          `<div class="expmeta"><span class="expmetric">${esc(e.metric)} ${esc(e.target)}</span>` +
          `<span class="expwhen">${esc(e.deadline || "")} ${esc(when)}</span></div></div>`;
      }
      for (const e of closed) {
        html += `<div class="exp closed" title="${esc(e.id)}${e.result ? "\n" + esc(e.result) : ""}">` +
          `<div class="exphyp">${esc(e.hypothesis)}</div>` +
          `<div class="expmeta"><span class="expverdict ${esc(e.verdict || "")}">${esc((e.verdict || "").toUpperCase())}</span>` +
          `<span class="expwhen">${esc(e.closed || "")}</span></div></div>`;
      }
      block.innerHTML = html;
    }

    async function refreshExperiments() {
      let d = null;
      try { d = await (await fetch("/api/experiments")).json(); } catch {}
      last = d;
      paintExperiments(d);
    }

    // Fetch once per data poll; if the fetch is still in flight when app.js
    // repaints, put the last known list back so the block never flickers out.
    if (typeof loadData === "function") {
      const orig = loadData;
      loadData = async function (...a) {
        const r = await orig.apply(this, a);
        if (last) paintExperiments(last);
        try { await refreshExperiments(); } catch {}
        return r;
      };
    }
    refreshExperiments();
  }

  /* The deck and the right column moved in CSS; the ring is laid out in JS
   * against their measured rectangles, so it needs a nudge once the
   * stylesheet has landed. */
  requestAnimationFrame(relayout);
  addEventListener("load", () => { placeDeck(); relayout(); });
  addEventListener("resize", () => { placeDeck(); relayout(); });
})();
