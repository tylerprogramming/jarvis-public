/* ============================================================================
 * ui-v2.js - the HUD's second layer. Load AFTER app.js and settings.js.
 *
 * app.js draws the data: vitals, directives, the ring, the transcript. This
 * file owns the screen around it:
 *   - the status sentence beside the wordmark
 *   - the two pills and the sheet the rail became
 *   - focus, which turns the numbers column into a line of text
 *   - health words on the ring plates
 *   - markdown in the document modal, document opening, memory, experiments
 *
 * app.js is a classic top-level script, so its declarations (relayoutDuring,
 * selectView, loadData, DATA, AGENTS_LIST, fmt) share this script's global
 * scope. Nothing here reads or writes #brain, #stars, or the theme system.
 * ========================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const relayout = () =>
    (typeof relayoutDuring === "function" ? relayoutDuring() : dispatchEvent(new Event("resize")));
  /* app.js's top-level declarations share this script's scope, but reaching for
   * one that is missing must not take the rest of this file down with it. */
  const appGlobal = (fn) => { try { fn(); } catch {} };

  /* =========================================================================
   * THE STATUS SENTENCE
   *
   * One line beside the wordmark: what is running, what already ran today,
   * what needs attention, and what is next. Built from /api/agents - the same
   * source the ring plates use, so it cannot disagree with them.
   *
   * "ran" is real, not inferred from the clock. /api/agents carries lastRun
   * and a health verdict from the run ledger, so a finished agent reports
   * the time it actually finished and is only counted when the run exited 0
   * and left what it was meant to leave.
   * ======================================================================= */
  const STATE_WORD = {
    failed: "FAILED", overdue: "OVERDUE", "not-loaded": "NOT LOADED", stale: "STALE", never: "NEVER RAN",
  };
  const stateClass = (s) => (s === "failed" ? "bad" : STATE_WORD[s] ? "warn" : "");
  const healthOf = (a) => (a.health && a.health.state) || "ok";
  // an on-demand agent that has not run yet is not a problem, only a fact
  const needsAttention = (a) => Boolean(STATE_WORD[healthOf(a)]) && !a.running && (healthOf(a) !== "never" || a.schedule);

  /* The agents-need-attention list, in the same modal app.js uses to explain
   * an agent: one line per problem and the reason beside it. */
  const attentionModal = (list) => {
    const title = $("modal-title"), body = $("modal-body"), modal = $("modal");
    if (!title || !body || !modal) return;
    title.textContent = `${list.length} AGENT${list.length === 1 ? "" : "S"} NEED ATTENTION`;
    body.className = "structured";
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
  const isToday = (ms) => {
    const d = new Date(ms), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  };
  const words = (list) => {
    const n = list.map((a) => a.label.toLowerCase());
    if (n.length <= 1) return n.join("");
    return n.slice(0, -1).join(", ") + " and " + n[n.length - 1];
  };

  /* Elapsed is only claimed for a run this page actually watched start. An
   * agent that was already going when you opened the tab has no start time
   * anywhere in the payload, and "running 2m" would be an invention. */
  const startedAt = new Map();
  let lastAgents = [], lastStatusHtml = "", brainUp = true, serverUp = true;
  const statusEl = $("status"), statusText = $("status-text");

  async function paintStatus() {
    let list = [];
    try { list = (await (await fetch("/api/agents")).json()).agents || []; serverUp = true; }
    catch { serverUp = false; }
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
    let next = null, soonest = Infinity;
    for (const a of on) {
      if (a.running) continue;
      const t = nextAt(a.tag);
      if (t !== null && t < soonest) { soonest = t; next = a; }
    }
    const mins = () => {
      const t = Math.min(...running.map((a) => startedAt.get(a.id) || Infinity));
      if (!isFinite(t)) return "";
      const m = Math.floor((Date.now() - t) / 60000);
      return m >= 1 ? ` for ${m}m` : "";
    };

    const parts = [];
    if (!serverUp) parts.push(`<span class="bad">server not answering</span>`);
    else if (!brainUp) parts.push(`<span class="bad">no brain answering</span>`);
    if (running.length) parts.push(`<b>${esc(words(running))}</b> running${mins()}`);
    if (doneToday.length) {
      const shown = doneToday.slice(0, 2);
      const more = doneToday.length - shown.length;
      const hour = new Date(doneToday[0].lastRun).getHours();
      parts.push(`<b>${esc(words(shown))}</b>${more ? ` and ${more} more` : ""} ran ${hour < 12 ? "this morning" : hour < 18 ? "today" : "this evening"}`);
    }
    if (attention.length) parts.push(`<u>${attention.length} need${attention.length === 1 ? "s" : ""} attention</u>`);
    else if (blocked.length) parts.push(`${blocked.length} blocked on config`);
    if (next) parts.push(`next: <b>${esc(next.label.toLowerCase())}</b> at ${esc(String(next.tag).toLowerCase())}`);
    if (!parts.length) parts.push("nothing running");

    const html = parts.join(" &middot; ");
    if (html === lastStatusHtml) return;
    lastStatusHtml = html;
    if (statusText) statusText.innerHTML = html;
    if (statusEl) {
      statusEl.className = !serverUp || !brainUp ? "bad" : attention.length ? "warn attn" : running.length ? "busy" : "";
    }
  }
  if (statusEl) statusEl.onclick = () => {
    const list = lastAgents.filter((a) => a.id !== "runner" && a.enabled !== false && needsAttention(a));
    if (list.length) attentionModal(list);
  };
  async function syncBrain() {
    try { const s = await (await fetch("/api/status")).json(); brainUp = Boolean((s.brain || {}).active); }
    catch { brainUp = false; }
  }
  (async () => { await syncBrain(); await paintStatus(); })();
  setInterval(async () => { await syncBrain(); await paintStatus(); }, 20000);

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
   * STALE NUMBERS
   *
   * STALE · 12d beside the subscriber number. Amber, not red: the numbers are
   * real, they are just old, and the fix is one command, named in the
   * tooltip. Removed again the moment a fresh collect lands, so the absence
   * of the badge means something. The server decides (vitals_age from
   * /api/data, against vitals.stale_hours); this only paints it.
   * ======================================================================= */
  {
    function paintStale(age) {
      const stale = Boolean(age && age.stale);
      const days = age && age.hours != null ? Math.round(age.hours / 24) : null;
      const word = stale ? `STALE · ${age && age.hours == null ? "never" : days >= 1 ? `${days}d` : `${Math.round(age.hours)}h`}` : "";
      const when = age && age.updated_at ? new Date(age.updated_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "never";
      const tip = `last collected ${when}; run jarvis collect --fetch`;
      const put = (host) => {
        if (!host) return;
        let b = host.querySelector(".v2stale");
        if (!stale) { if (b) b.remove(); return; }
        if (!b) { b = document.createElement("span"); b.className = "v2stale"; host.appendChild(b); }
        if (b.textContent !== word) b.textContent = word;
        b.title = tip;
      };
      const vit = $("vitals");
      put(vit && (vit.querySelector(".herohead") || vit));
      const fl = $("focusline");
      put(fl && fl.querySelector(".fl-nums"));
    }
    function paintFromData() {
      const d = typeof DATA !== "undefined" ? DATA : null;
      if (!d || !d.vitals) return;
      paintStale(d.vitals_age);
    }
    // app.js's render() rebuilds #vitals and #focusline, so repaint after it
    if (typeof loadData === "function") {
      const orig = loadData;
      loadData = async function (...a) {
        const r = await orig.apply(this, a);
        try { paintFromData(); } catch {}
        return r;
      };
    }
    setTimeout(paintFromData, 600);
  }

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
        cmd && cmd.focus();
      }
    });
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
   * THE SHEET, THE PILLS, AND FOCUS
   *
   * The rail is gone. Documents, Radar, Playbook, Knowledge and Memory are
   * one sheet that slides over the sphere: the DOCUMENTS pill opens it on
   * Documents, the tabs move between views (app.js's selectView), Escape
   * closes it. SETTINGS opens the same dialog the composer's gear does.
   *
   * Focus hides the numbers column and shows the same numbers as a line of
   * text under the sphere (app.js's renderFocusLine draws it). The ring
   * re-centres by itself because layoutAgents() measures the column rather
   * than assuming it. Persisted, so a reload lands where you left it.
   * ======================================================================= */
  {
    const body = document.body;
    const sheet = $("sheet");
    const pillDocs = $("pill-docs"), pillSettings = $("pill-settings"), pillFocus = $("pill-focus");
    const cmd = $("cmd");

    const sheetOpen = () => Boolean(sheet && sheet.classList.contains("open"));
    function openSheet(view) {
      if (!sheet) return;
      if (view && typeof selectView === "function") selectView(view);
      sheet.classList.add("open");
      sheet.setAttribute("aria-hidden", "false");
      if (pillDocs) pillDocs.classList.add("on");
    }
    function closeSheet() {
      if (!sheet) return;
      sheet.classList.remove("open");
      sheet.setAttribute("aria-hidden", "true");
      if (pillDocs) pillDocs.classList.remove("on");
    }
    if (pillDocs) pillDocs.onclick = () => (sheetOpen() ? closeSheet() : openSheet("documents"));
    { const x = $("sheet-close"); if (x) x.onclick = closeSheet; }
    if (pillSettings) pillSettings.onclick = () => {
      if (window.JarvisPanels && window.JarvisPanels.openSettings) window.JarvisPanels.openSettings();
      else { const b = $("settings-btn"); b && b.click(); }
    };
    // a notification link (?view=radar) lands on its sheet
    {
      const wanted = new URLSearchParams(location.search).get("view");
      if (wanted && document.querySelector(`#railbody .panel[data-view="${CSS.escape(wanted)}"]`)) {
        addEventListener("load", () => openSheet(wanted));
      }
    }

    // the focus switch in the dock head, beside New conversation
    const head = document.querySelector("#comms .dockhead");
    let btn = $("dock-focus");
    if (head && !btn) {
      btn = document.createElement("button");
      btn.id = "dock-focus";
      btn.className = "dockbtn";
      btn.innerHTML = "&#9678;";
      btn.dataset.tip = "Focus — the sphere and the conversation.  ⌘/";
      btn.setAttribute("aria-label", "Focus mode");
      head.appendChild(btn);
    }

    function setFocus(on, quiet) {
      if (quiet) {
        body.classList.add("nofx");
        requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove("nofx")));
      }
      body.classList.toggle("focus", on);
      if (pillFocus) pillFocus.classList.toggle("on", on);
      try { localStorage.setItem("jarvis_focus", on ? "1" : "0"); } catch {}
      if (!quiet) { relayout(); setTimeout(relayout, 460); }
      if (on && cmd && !quiet) cmd.focus();
    }
    const isFocus = () => body.classList.contains("focus");
    window.JarvisFocus = { set: setFocus, is: isFocus };

    if (btn) btn.onclick = () => setFocus(!isFocus());
    if (pillFocus) pillFocus.onclick = () => setFocus(!isFocus());
    addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") { e.preventDefault(); setFocus(!isFocus()); return; }
      if (e.key !== "Escape") return;
      // Escape closes the top-most thing: a dialog (settings.js and app.js
      // keep their own handlers), then the sheet, then focus.
      const modal = $("modal");
      const openDlg = document.querySelector(".v2dlg.open");
      if ((modal && modal.classList.contains("open")) || openDlg) return;
      if (sheetOpen()) { closeSheet(); return; }
      if (isFocus()) setFocus(false);
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
    const panel = document.querySelector('#railbody .panel[data-view="memory"]');
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

  /* The column and the chat are placed in CSS; the ring is laid out in JS
   * against their measured rectangles, so it needs a nudge once the
   * stylesheet has landed. */
  requestAnimationFrame(relayout);
  addEventListener("load", relayout);
  addEventListener("resize", relayout);
})();
