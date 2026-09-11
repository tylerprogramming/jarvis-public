/* ================= themes =================
 *
 * A theme is three things, not one:
 *   vars    the colour tokens, which style.css consumes exclusively. No colour
 *           literal lives in the stylesheet, so a theme can change all of it.
 *   chrome  how panels are built rather than what colour they are. "glass" is
 *           blurred and sharp cornered, "soft" is rounded with a heavier blur,
 *           "flat" has no blur at all. This is what makes themes read as
 *           different interfaces instead of the same one recoloured.
 *   mode    what the particle brain does, rings or sphere, plus the hue it and
 *           the starfield are drawn in.
 *
 * The four borrowed palettes use their projects' published values rather than
 * approximations, so they match the editor themes people already run.
 */
/* Radii live here rather than in the CSS because the theme owns them.
 *
 * "glass" shipped at 0px, which is why every card in the HUD was a hard
 * rectangle - blurred translucent panels with square corners read as a
 * terminal, not as glass. Every reference UI in this class rounds its cards to
 * 12-16px. "flat" keeps 0 on purpose; square IS the point of that one. */
const CHROME = {
  glass: { "--blur": "14px", "--radius": "20px", "--radius-sm": "12px" },
  soft:  { "--blur": "18px", "--radius": "22px", "--radius-sm": "14px" },
  flat:  { "--blur": "0px",  "--radius": "0px",  "--radius-sm": "0px" },
};

const THEMES = {
  reactor: { label: "Reactor", note: "The original. Arc reactor blue.",
    mode: "rings", hue: "127,211,255", chrome: "glass", vars: {
    /* Values from the Claude Design spec rather than the originals: a deeper
       ground, softer hairlines and a slightly cooler accent. */
    "--bg": "#05080F", "--panel": "rgba(12,21,36,0.92)", "--panel-deep": "rgba(7,13,24,0.96)",
    "--line": "rgba(127,211,255,0.14)", "--line-soft": "rgba(127,211,255,0.09)",
    "--accent": "#7FD3FF", "--accent-hi": "#BFE6FF", "--accent-rgb": "127,211,255",
    "--accent-deep": "#2D6FD1",
    "--text": "#E6EEF9", "--dim": "#6F86A6", "--strong": "#EAF5FF",
    "--red": "#f38ba8", "--red-rgb": "243,139,168", "--green": "#a6e3a1", "--amber": "#f9e2af",
    "--blue": "#89b4fa", "--pink": "#f5c2e7",
    "--scrim": "rgba(4,3,10,0.82)", "--modal": "#0b0817", "--shadow": "rgba(0,0,0,0.5)" } },

  nebula: { label: "Nebula", note: "Deep violet, quieter than it looks.",
    mode: "sphere", hue: "167,139,250", chrome: "glass", vars: {
    "--bg": "#06050c", "--panel": "rgba(20,16,38,0.55)", "--panel-deep": "rgba(12,9,24,0.72)",
    "--line": "rgba(167,139,250,0.22)", "--line-soft": "rgba(167,139,250,0.10)",
    "--accent": "#a78bfa", "--accent-hi": "#cba6f7", "--accent-rgb": "167,139,250",
    "--text": "#e0dbf5", "--dim": "#8d87b3", "--strong": "#ffffff",
    "--red": "#f38ba8", "--red-rgb": "243,139,168", "--green": "#a6e3a1", "--amber": "#f9e2af",
    "--blue": "#89b4fa", "--pink": "#f5c2e7",
    "--scrim": "rgba(6,5,12,0.84)", "--modal": "#100c20", "--shadow": "rgba(0,0,0,0.55)" } },

  ember: { label: "Ember", note: "Warm amber. Easiest at night.",
    mode: "sphere", hue: "251,191,36", chrome: "glass", vars: {
    "--bg": "#0c0703", "--panel": "rgba(38,24,10,0.55)", "--panel-deep": "rgba(24,15,6,0.72)",
    "--line": "rgba(251,191,36,0.25)", "--line-soft": "rgba(251,191,36,0.10)",
    "--accent": "#f59e0b", "--accent-hi": "#fbbf24", "--accent-rgb": "245,158,11",
    "--text": "#f7efe2", "--dim": "#b8a688", "--strong": "#fffaf0",
    "--red": "#f38ba8", "--red-rgb": "243,139,168", "--green": "#a6e3a1", "--amber": "#fbbf24",
    "--blue": "#89b4fa", "--pink": "#f5c2e7",
    "--scrim": "rgba(12,7,3,0.84)", "--modal": "#1a1006", "--shadow": "rgba(0,0,0,0.55)" } },

  /* nordtheme.com published palette */
  nord: { label: "Nord", note: "Cold and desaturated. Arctic.",
    mode: "sphere", hue: "136,192,208", chrome: "soft", vars: {
    "--bg": "#2e3440", "--panel": "rgba(59,66,82,0.55)", "--panel-deep": "rgba(46,52,64,0.75)",
    "--line": "rgba(136,192,208,0.25)", "--line-soft": "rgba(136,192,208,0.10)",
    "--accent": "#88c0d0", "--accent-hi": "#8fbcbb", "--accent-rgb": "136,192,208",
    "--text": "#eceff4", "--dim": "#99a5bb", "--strong": "#eceff4",
    "--red": "#bf616a", "--red-rgb": "191,97,106", "--green": "#a3be8c", "--amber": "#ebcb8b",
    "--blue": "#81a1c1", "--pink": "#b48ead",
    "--scrim": "rgba(46,52,64,0.82)", "--modal": "#3b4252", "--shadow": "rgba(0,0,0,0.45)" } },

  /* catppuccin/palette, Mocha flavour */
  mocha: { label: "Mocha", note: "Catppuccin. Soft contrast, easy to sit with.",
    mode: "rings", hue: "137,180,250", chrome: "soft", vars: {
    "--bg": "#1e1e2e", "--panel": "rgba(49,50,68,0.55)", "--panel-deep": "rgba(24,24,37,0.75)",
    "--line": "rgba(137,180,250,0.25)", "--line-soft": "rgba(137,180,250,0.10)",
    "--accent": "#89b4fa", "--accent-hi": "#b4befe", "--accent-rgb": "137,180,250",
    "--text": "#cdd6f4", "--dim": "#a6adc8", "--strong": "#e4eaf9",
    "--red": "#f38ba8", "--red-rgb": "243,139,168", "--green": "#a6e3a1", "--amber": "#f9e2af",
    "--blue": "#74c7ec", "--pink": "#f5c2e7",
    "--scrim": "rgba(17,17,27,0.85)", "--modal": "#181825", "--shadow": "rgba(0,0,0,0.5)" } },

  /* folke/tokyonight.nvim, Storm variant */
  tokyo: { label: "Tokyo Night", note: "Blue on slate. The screenshot favourite.",
    mode: "sphere", hue: "122,162,247", chrome: "soft", vars: {
    "--bg": "#24283b", "--panel": "rgba(41,46,66,0.60)", "--panel-deep": "rgba(31,35,53,0.78)",
    "--line": "rgba(122,162,247,0.25)", "--line-soft": "rgba(122,162,247,0.10)",
    "--accent": "#7aa2f7", "--accent-hi": "#7dcfff", "--accent-rgb": "122,162,247",
    "--text": "#c0caf5", "--dim": "#8b93b8", "--strong": "#d5dcfb",
    "--red": "#f7768e", "--red-rgb": "247,118,142", "--green": "#9ece6a", "--amber": "#e0af68",
    "--blue": "#2ac3de", "--pink": "#bb9af7",
    "--scrim": "rgba(27,30,45,0.85)", "--modal": "#1f2335", "--shadow": "rgba(0,0,0,0.55)" } },

  /* morhetz/gruvbox, dark */
  gruvbox: { label: "Gruvbox", note: "Warm retro terminal. No blur, hard edges.",
    mode: "rings", hue: "254,128,25", chrome: "flat", vars: {
    "--bg": "#282828", "--panel": "rgba(60,56,54,0.92)", "--panel-deep": "rgba(29,32,33,0.95)",
    "--line": "rgba(254,128,25,0.30)", "--line-soft": "rgba(254,128,25,0.12)",
    "--accent": "#fe8019", "--accent-hi": "#fabd2f", "--accent-rgb": "254,128,25",
    "--text": "#ebdbb2", "--dim": "#a89984", "--strong": "#fbf1c7",
    "--red": "#fb4934", "--red-rgb": "251,73,52", "--green": "#b8bb26", "--amber": "#fabd2f",
    "--blue": "#83a598", "--pink": "#d3869b",
    "--scrim": "rgba(29,32,33,0.88)", "--modal": "#32302f", "--shadow": "rgba(0,0,0,0.6)" } },

  daylight: { label: "Daylight", note: "The one you can read near a window.",
    mode: "rings", hue: "37,99,235", chrome: "soft", vars: {
    "--bg": "#f4f6fb", "--panel": "rgba(255,255,255,0.72)", "--panel-deep": "rgba(255,255,255,0.86)",
    "--line": "rgba(30,64,120,0.20)", "--line-soft": "rgba(30,64,120,0.08)",
    "--accent": "#1266c9", "--accent-hi": "#0a4fa0", "--accent-rgb": "18,102,201",
    "--text": "#16202e", "--dim": "#5b6b81", "--strong": "#0b1220",
    "--red": "#c62828", "--red-rgb": "198,40,40", "--green": "#1e7f4f", "--amber": "#a86400",
    "--blue": "#2563eb", "--pink": "#b4468a",
    "--scrim": "rgba(20,28,42,0.35)", "--modal": "#ffffff", "--shadow": "rgba(20,30,50,0.16)" } },
};

let themeName = localStorage.getItem("jarvis_theme") || "reactor";
if (!THEMES[themeName]) themeName = "reactor";
let THEME = THEMES[themeName];
function applyTheme(name) {
  if (!THEMES[name]) name = "reactor";
  themeName = name; THEME = THEMES[name];
  localStorage.setItem("jarvis_theme", name);
  window.__jarvisTheme = THEME;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(THEME.vars)) root.style.setProperty(k, v);
  for (const [k, v] of Object.entries(CHROME[THEME.chrome] || CHROME.glass))
    root.style.setProperty(k, v);
  // lets CSS special-case a light background without knowing which theme it is
  root.dataset.theme = name;
  root.dataset.chrome = THEME.chrome;
  if (window.__drawStars) window.__drawStars();
  if (window.__brain3d) window.__brain3d.setTheme(THEME);
  const btn = document.getElementById("theme");
  if (btn) btn.dataset.tip = `Theme — ${THEME.label}. Click to change.`;
  paintFavicon(THEME);
}

/* The tab icon follows the theme.
 *
 * A static favicon is fine until you switch to Daylight and a near-black disc
 * is sitting in a light tab strip. Redrawing it from the same tokens costs one
 * data URI and keeps the tab recognisable as this dashboard rather than as a
 * generic page. Built as a string rather than fetched so it needs no request
 * and cannot 404. */
function paintFavicon(theme) {
  const v = theme.vars;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<circle cx="16" cy="16" r="16" fill="${v["--bg"]}"/>
<g fill="none" stroke="${v["--accent"]}" stroke-linecap="round">
<circle cx="16" cy="16" r="11.5" stroke-width="1.4" opacity=".45"/>
<circle cx="16" cy="16" r="7.5" stroke-width="1.8" opacity=".85"/>
<path d="M16 1.6v3.2M16 27.2v3.2M1.6 16h3.2M27.2 16h3.2" stroke-width="1.6" opacity=".7"/>
</g><circle cx="16" cy="16" r="3.4" fill="${v["--accent-hi"]}"/></svg>`;
  const href = "data:image/svg+xml," + encodeURIComponent(svg);
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    document.head.appendChild(link);
  }
  link.href = href;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = v["--bg"];
}


let state = "idle"; // idle | listening | thinking | speaking
applyTheme(themeName);


/* ================= data ================= */
const $ = (id) => document.getElementById(id);
const fmt = (n) => n == null ? "—" : n.toLocaleString("en-US");


/* The design's sparkline: a filled area under the line with a dot on the last
 * point, not a bare polyline. Gradient id is unique per call because several
 * of these can be on screen and duplicate ids silently share the first fill. */
let sparkSeq = 0;
function sparkArea(hist, key) {
  const vals = hist.map((r) => r[key]).filter((x) => x != null);
  if (vals.length < 2) return "";
  const W = 200, H = 44, PAD = 6;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = (i) => (i / (vals.length - 1)) * W;
  const y = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L");
  const id = "spk" + (++sparkSeq);
  return `<svg class="sparkarea" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="M${line} L${W},${H} L0,${H} Z" fill="url(#${id})"/>
    <path d="M${line}" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="${W}" cy="${y(vals[vals.length - 1]).toFixed(1)}" r="2.6" fill="var(--accent)"/>
  </svg>`;
}

function weekDelta(hist, key) {
  const rows = hist.filter((r) => r[key] != null);
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1];
  const anchor = rows.find((r) => (new Date(last.date) - new Date(r.date)) / 86400000 <= 7.5) || rows[0];
  const days = Math.max((new Date(last.date) - new Date(anchor.date)) / 86400000, 1);
  return Math.round((last[key] - anchor[key]) / days * 7);
}

let DATA = null;
async function loadData() {
  DATA = await (await fetch("/api/data")).json();
  render(DATA);
}

function render(d) {
  $("name").textContent = d.config.name;
  { const t = $("tagline"); if (t) t.textContent = d.config.tagline || ""; }
  const v = d.vitals, h = d.history;

  // vitals - every tile is driven by config, so an unconfigured channel simply
  // is not drawn rather than sitting there permanently blank
  const cfg = d.config;
  const show = (k) => (cfg.vitals_show || []).includes(k);
  const channels = cfg.channels || {};
  const cell = (lab, val, delta, na) =>
    `<div class="vcell"><div class="lab">${esc(lab)}</div><div class="n">${val}</div><div class="d ${na ? "na" : ""}">${delta}</div></div>`;
  const wkTxt = (wk) => wk == null ? "tracking" : (wk >= 0 ? "▲ " : "▼ ") + fmt(Math.abs(wk)) + "/wk";

  /* Dashboard body, to the Claude Design spec: a hero metric with a progress
   * bar against the target, a 2x2 grid of channel tiles, then the latest video
   * with its sparkline. */
  let html = "";
  const PLAT_DOT = { Instagram: "#F0658F", TikTok: "#7FD3FF", LinkedIn: "#4DA3FF",
                     X: "#EAF5FF", YouTube: "#E85C4A" };

  if (show("yt_subs") && channels.youtube) {
    const subsWk = weekDelta(h, "yt_subs");
    /* The subs card's metric is "yt_subs", not "subs". Getting that wrong fell
     * through to primary_cards[0] - the TOTAL AUDIENCE card - so it printed
     * a follower count against the WRONG target, with the bar pinned at 100%,
     * that has stopped being about anything. */
    const card = (cfg.primary_cards || []).find((c) => c.metric === "yt_subs");
    const target = (card || {}).target || 0;
    const pct = target ? Math.min(100, (v.yt_subs / target) * 100) : 0;
    const pace = subsWk > 0 ? { txt: "on pace", col: "#5BE6A8" } : { txt: "stalled", col: "#E0A15C" };
    html += `<div class="hero">
      <div class="herohead">
        <span class="microlabel">SUBSCRIBERS</span>
        <span class="pill">${esc(wkTxt(subsWk))}</span>
      </div>
      <div class="heronum">
        <b>${fmt(v.yt_subs)}</b>${target ? `<span>of ${fmt(target)}</span>` : ""}
      </div>
      ${target ? `<div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>` : ""}
      <div class="pace" style="color:${pace.col}">
        <i style="background:${pace.col}"></i>At this pace &middot; ${pace.txt}
      </div>
    </div>`;
  }

  const tiles = [];
  const tile = (label, value, wk) => {
    const up = wk != null && wk > 0;
    tiles.push(`<div class="ctile">
      <div class="ctop"><i style="background:${PLAT_DOT[label] || "var(--accent)"}"></i>${esc(label)}</div>
      <div class="cnum"><b>${value}</b>${wk != null
        ? `<span class="${up ? "up" : "flat"}">${up ? "&#9650; " : ""}${wk === 0 ? "0" : Math.abs(wk)}</span>` : ""}</div>
    </div>`);
  };
  const maybe = (key, label, valueKey, histKey) => {
    if (!show(key)) return;
    tile(label, fmt(v[valueKey]), weekDelta(h, histKey));
  };
  if (channels.tiktok) maybe("tiktok", "TikTok", "tiktok_followers", "tiktok_followers");
  if (channels.linkedin) maybe("linkedin", "LinkedIn", "linkedin_followers", "linkedin_followers");
  if (channels.instagram) maybe("instagram", "Instagram", "ig_followers", "ig_followers");
  if (channels.x) maybe("x", "X", "x_followers", "x_followers");
  if (show("community") && v.community_members != null)
    tile(cfg.community_label || "Community", fmt(v.community_members), v.community_joins_7d);
  if (tiles.length) {
    // the dashed "add channel" tile only makes sense while a slot is empty
    const missing = ["instagram", "tiktok", "linkedin", "x"].some((k) => !channels[k]);
    if (missing) tiles.push(`<div class="ctile add" id="add-channel" title="Open settings to add a channel">
      <span>+</span> Add channel</div>`);
    html += `<div class="ctiles">${tiles.join("")}</div>`;
  }

  const latest = v.yt_latest || {};
  if (show("latest_video") && latest.title) {
    html += `<div class="latest">
      <div class="herohead">
        <span class="microlabel">LATEST VIDEO</span>
        ${latest.views_per_day ? `<span class="rate">&asymp;${fmt(latest.views_per_day)} /day</span>` : ""}
      </div>
      <div class="latestrow"><b>${fmt(latest.views)}</b>${sparkArea(h, "latest_views")}</div>
      <div class="latesttitle">${esc(latest.title)}</div>
    </div>`;
  }

  const canary = v.canary || {};
  if (show("checkin") && canary.last_checkin) {
    const darkDays = Math.round((Date.now() - new Date(canary.last_checkin)) / 86400000);
    html += vital("Check-in", darkDays + "<small> days dark</small>",
      darkDays > 3 ? "revive it" : "ok", "", darkDays > 3 ? "bad" : "good");
  }

  $("vitals").innerHTML = html ||
    `<div class="msg sys">no channels configured yet - run <b>jarvis setup</b> or open settings</div>`;

  // directives - the empty state has to teach, since a new user has none
  // an agent's suggestion and your own note look identical otherwise, which
  // matters more now that six can be queued at once
  /* Progress bar, then cards with a rounded checkbox and mono tags. The tags
   * come from the directive text itself - a time, a day, or the agent that
   * proposed it - rather than being invented. */
  {
    const done = d.directives.filter((x) => x.done).length;
    const pct = d.directives.length ? (done / d.directives.length) * 100 : 0;
    const tagsFor = (x) => {
      const out = [];
      const time = (x.text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/) || [])[0];
      if (/\btoday\b/i.test(x.text)) out.push(['<span class="dtag due">TODAY</span>']);
      else if (time) out.push([`<span class="dtag soon">${esc(time)}</span>`]);
      else if (/\bthis week\b/i.test(x.text)) out.push(['<span class="dtag">THIS WEEK</span>']);
      if (x.source) out.push([`<span class="dtag">${esc(x.source)}</span>`]);
      return out.flat().join("");
    };
    $("directives").innerHTML =
      (d.directives.length
        ? `<div class="dprogress">
             <span class="track"><i style="width:${pct.toFixed(0)}%"></i></span>
             <span class="lbl">${done} / ${d.directives.length} DONE</span>
           </div>` : "") +
      (d.directives.map((x, i) =>
        `<div class="directive ${x.done ? "done" : ""}${OPEN_DIRECTIVES.has(i) ? " open" : ""}" data-i="${i}"
           title="${x.source ? `proposed by the ${esc(x.source)} agent${x.added ? " on " + esc(x.added) : ""}` : "added by you"}">
          <span class="box" title="mark done"></span>
          <span class="dbody">
            <span class="txt">${esc(x.text)}</span>
            <span class="tags">${tagsFor(x)}</span>
          </span>
          <span class="chev" title="expand">&#8943;</span>
        </div>`).join("") ||
        `<div class="msg sys">nothing queued. ask jarvis to "add a directive to ..." or let the
         morning agent set them.</div>`);
  }

  /* The box ticks it off; the text expands it. Those used to be the same click,
   * which is fine on a one-line directive and wrong the moment they are
   * paragraphs - you could not read one without completing it. */
  document.querySelectorAll(".directive").forEach((el) => {
    const i = +el.dataset.i;
    const toggleOpen = () => {
      el.classList.toggle("open");
      if (el.classList.contains("open")) OPEN_DIRECTIVES.add(i);
      else OPEN_DIRECTIVES.delete(i);
    };
    el.querySelector(".txt").onclick = toggleOpen;
    el.querySelector(".chev").onclick = toggleOpen;
    el.querySelector(".box").onclick = async () => {
      await fetch("/api/directives", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggle: i }),
      });
      loadData();
    };
  });

  // radar
  const radar = d.radar || {};
  const brks = (radar.breakouts || []).slice(0, 4);
  const watching = (radar.channels || []).length;
  const names = (radar.names) || {};
  // channel + views alongside the multiple: the multiple says "unusual for
  // them", the view count says whether it is worth your time
  /* Cards, with the multiple as a chip and a bar showing it relative to the
   * biggest breakout in the list - so "8.3x" is legible as a number and as a
   * magnitude without doing the comparison yourself. */
  {
    const max = Math.max(...brks.map((b) => b.multiple), 1);
    const above = brks.filter((b) => b.multiple >= 6).length;
    const head = brks.length
      ? `<div class="grouphead"><span>OUTLIERS &middot; 7D</span><span class="line"></span>
           <span class="n${above ? " hot" : ""}">${above ? above + " ABOVE 6x" : brks.length}</span></div>`
      : "";
    $("radar").innerHTML = head + (brks.length
      ? brks.map((b, i) => {
          const who = esc(names[b.channel] || String(b.channel).replace(/^@|^channel\//, ""));
          return `<div class="brk${i === 0 ? " top" : ""}"
              onclick="window.open('https://youtube.com/watch?v=${esc(b.id)}')"
              title="${esc(b.title)}">
            <div class="brkhead">
              <span class="brk-mult">${b.multiple}x</span>
              <span class="brkbar"><i style="width:${Math.round((b.multiple / max) * 100)}%"></i></span>
            </div>
            <div class="brk-title">${esc(b.title)}</div>
            <div class="brk-meta"><b>${who}</b><i>&middot;</i>${fmt(b.views)} views<i>&middot;</i>${b.age_days}d</div>
          </div>`;
        }).join("")
      : watching
        ? `<div class="msg sys">no breakouts - watching ${watching} channel${watching > 1 ? "s" : ""}</div>`
        : `<div class="msg sys">add channels to watch in settings, then run the radar agent</div>`);
  }

  // playbook - what the agents have concluded
  const pb = d.playbook || { rules: [], count: 0, newest: "", sections: 0 };
  $("pb-cap").textContent = pb.count
    ? `${pb.count} RULE${pb.count === 1 ? "" : "S"}` : "LEARNED";
  /* Filter pills over cards. The pills are the sections actually present in
   * the loaded rules, not a fixed list - an agent inventing a new section
   * tomorrow gets a pill without anyone maintaining one. */
  {
    const rules = pb.rules || [];
    const sections = [...new Set(rules.map((r) => r.section).filter(Boolean))].slice(0, 4);
    if (PB_FILTER !== "ALL" && !sections.includes(PB_FILTER)) PB_FILTER = "ALL";
    const shown = PB_FILTER === "ALL" ? rules : rules.filter((r) => r.section === PB_FILTER);

    const pills = rules.length
      ? `<div class="pillrow">` +
        [["ALL", "ALL"], ...sections.map((s2) => [s2, s2])].map(([key, label]) =>
          `<button class="fpill${PB_FILTER === key ? " on" : ""}" data-pb="${esc(key)}">${esc(String(label).toUpperCase())}</button>`).join("") +
        `</div>` : "";

    $("playbook").innerHTML = pills + (shown.length
      ? shown.slice(0, 8).map((r) => {
          const text = r.text.replace(/\s*\[(?:confirmed |updated )?\d{4}-\d{2}-\d{2}\]:?\s*/, " ").trim();
          const hue = hueFor(r.section || "unfiled");
          return `<div class="rule" data-f="${esc(r.source)}" title="click to open the playbook">
            <div class="rulehead">
              <span class="sdot" style="background:hsl(${hue} 72% 64%)"></span>
              <span class="sect" style="color:hsl(${hue} 60% 76%)">${esc(r.section || "unfiled")}</span>
              <span class="when">${esc(r.date || "undated")}</span>
            </div>
            <div class="rtext">${inlineMd(text.slice(0, 190))}${text.length > 190 ? "&hellip;" : ""}</div>
          </div>`;
        }).join("")
      : `<div class="msg sys">nothing learned yet. the post-mortem and study agents
         write what they confirm into your playbook, and it shows up here.</div>`);

    document.querySelectorAll("#playbook .fpill").forEach((b) => {
      b.onclick = () => { PB_FILTER = b.dataset.pb; loadData(); };
    });
    document.querySelectorAll("#playbook .rule").forEach((el) =>
      el.onclick = async () => {
        const r = await (await fetch("/api/doc?f=" + encodeURIComponent(el.dataset.f))).json();
        $("modal-title").textContent = r.name || "playbook";
        $("modal-body").className = "plain";
        $("modal-body").textContent = r.content || r.error;
        $("modal").classList.add("open");
      });
  }

  // documents
  /* Grouped by age, the way the spec splits them. Today's items keep their
   * card; older ones drop to a bare row, so the list reads as a timeline
   * rather than a stack of equal-weight things. */
  {
    const now = Date.now();
    const fresh = d.documents.filter((x) => now - x.mtime < 864e5);
    const older = d.documents.filter((x) => now - x.mtime >= 864e5);
    const dot = (x) => x.name && /fail|stall|down|decl/i.test(x.name) ? "#E0A15C"
                     : x.name && /success|wrote|done|clean/i.test(x.name) ? "#5BE6A8"
                     : "var(--accent)";
    const row = (x, old) => `<div class="doc${old ? " old" : ""}" data-f="${esc(x.file)}" title="${esc(x.name)}">
        <span class="ddot" style="background:${old ? "" : dot(x)}"></span>
        <span class="dname">${esc(x.name)}</span>
        <span class="age">${esc(x.age)}</span>
      </div>`;
    const group = (label, items, old) => items.length
      ? `<div class="grouphead"><span>${label}</span><span class="line"></span>
           <span class="n">${items.length}</span></div>` + items.map((x) => row(x, old)).join("")
      : "";
    $("documents").innerHTML = (group("TODAY", fresh, false) + group("EARLIER", older, true))
      || `<div class="msg sys">empty. agent reports and drafts land here.</div>`;
  }

  renderKnowledge(d.knowledge, d.playbook);
  refreshBadges(d);
  reapplySearch();
  { const a = $("add-channel"); if (a) a.onclick = () => $("settings-btn")?.click(); }
  renderFocusLine();
  renderCalendar(d.calendar);
  greet(d);
}

/* First thing a new user sees in COMMS. A blinking cursor teaches nothing, so
 * open with what to actually type - tailored to whether setup is done. */
let greeted = false;
function greet(d) {
  if (greeted) return;
  greeted = true;
  const asked = (t) =>
    `<span class="try" onclick="send('${t.replace(/'/g, "\\'")}')">${esc(t)}</span>`;
  const el = document.createElement("div");
  el.className = "msg sys";
  el.dataset.agent = "jarvis";   // stamped like everything else, or the tab filter hides it
  el.innerHTML = d.config.configured
    ? `try asking: ${[
        "what can you do?",
        "how am I tracking this week?",
        "add a directive to film the agent video",
      ].map(asked).join(" · ")}`
    : `setup isn't finished, so most numbers will be blank. run <b>jarvis setup</b> in a
       terminal, or press the gear button. then try ${asked("what can you do?")}`;
  msgs.appendChild(el);
  pinBottom();
}

/* Legacy slot types map onto platforms so a hand-written calendar.json from
 * before the Blotato agent still colours correctly. */
const SLOT_ALIAS = { long: "youtube", short: "youtube", li: "linkedin", ig: "instagram",
                     tt: "tiktok", x: "twitter", yt: "youtube", pin: "pinterest" };
const PLATFORM_LABEL = { youtube: "YouTube", linkedin: "LinkedIn", instagram: "Instagram",
  tiktok: "TikTok", twitter: "X", pinterest: "Pinterest", threads: "Threads",
  bluesky: "Bluesky", facebook: "Facebook" };
const slotKind = (type) => {
  const k = String(type || "").toLowerCase();
  return SLOT_ALIAS[k] || k;
};

function renderCalendar(cal) {
  const el = $("calstrip");
  if (!cal || !cal.days || !cal.days.length) { el.style.display = "none"; return; }
  el.style.display = "";
  const names = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const todayIso = new Date().toLocaleDateString("sv-SE");

  /* The month sits above the strip rather than inside it. Parsing the date as
   * UTC noon rather than `new Date("2026-08-10")`: that string is treated as
   * UTC midnight, which is the previous day for anyone west of Greenwich, and
   * the header showed the wrong month for the first day of any month. */
  const first = cal.days[0] && cal.days[0].date;
  const monthName = cal.month || (first
    ? new Date(first + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }).toUpperCase()
    : "");

  const kinds = [...new Set(cal.days.flatMap((d2) => (d2.items || []).map((i2) => slotKind(i2.type))))];

  const grid = cal.days.map((day, i) => {
    const dom = day.date ? Number(day.date.slice(8, 10)) : "";
    const items = day.items || [];
    return `<div class="day ${day.date === todayIso ? "today" : ""}">
      <div class="dow">${names[i % 7]}</div>
      <div class="dom">${dom}</div>
      <div class="slots">${items.map((it) => {
        const k = slotKind(it.type);
        const when = it.time ? it.time + " " : "";
        const what = it.title ? " - " + it.title : "";
        return `<span class="slot p-${esc(k)} ${it.done ? "done" : ""}"
           title="${esc(when + (PLATFORM_LABEL[k] || k) + what)}"></span>`;
      }).join("") || `<span class="slot none" title="nothing scheduled"></span>`}
      </div></div>`;
  }).join("");

  /* The legend is a SIBLING of the week, not a child of it. While it sat
   * inside .calbox it was a grid item in a 7-column grid, so it got one
   * column - 60px - and stacked one platform per line. */
  el.innerHTML =
    `<div class="calmonth">${esc(monthName)} <em title="${cal.source === "blotato"
      ? "refreshed from your scheduler" + (cal.updated ? " at " + esc(cal.updated) : "")
      : "hand-written calendar.json"}">· Content calendar</em></div>
     <div class="calbox">${grid}</div>` +
    (kinds.length
       ? `<div class="legend">${kinds.map((k) =>
           `<span class="lg"><i class="p-${esc(k)}"></i>${esc(PLATFORM_LABEL[k] || k)}</span>`).join("")}</div>`
       : "");
}

/* Declared above selectView, not beside the badge code it belongs to.
 * selectView() clears the dot for whatever you just opened, and it runs during
 * initial script execution to restore the saved view - so if these sat further
 * down the file the very first call hit the temporal dead zone and killed the
 * whole script. The HUD rendered its shell and no data at all. */
const SEEN = {};
let BADGE_DATA = null;

/* ---------- left sidebar ----------
 *
 * One panel visible at a time, chosen from the icon rail. The choice is
 * remembered, because a HUD that resets to the first tab on every reload
 * teaches you to stop using the other five.
 */
function selectView(name) {
  document.querySelectorAll("#nav .tab[data-view]").forEach((b) =>
    b.classList.toggle("on", b.dataset.view === name));
  document.querySelectorAll("#railbody .panel").forEach((p) =>
    p.classList.toggle("on", p.dataset.view === name));
  try { localStorage.setItem("jarvis_view", name); } catch {}
  // clear the attention dot for whatever you just looked at
  const b = document.querySelector(`#nav .tab[data-view="${name}"]`);
  if (b) { b.dataset.badge = ""; SEEN[name] = badgeKey(name); }
  if (name === "documents") { const p = $("pill-docs"); if (p) p.dataset.badge = ""; }
  const s = document.querySelector(`#railbody .panel[data-view="${name}"] .panelsearch`);
  if (s) s.focus({ preventScroll: true });
}

document.querySelectorAll("#nav .tab[data-view]").forEach((b) => {
  b.onclick = () => selectView(b.dataset.view);
});
{
  const saved = (() => { try { return localStorage.getItem("jarvis_view"); } catch { return null; } })();
  selectView(saved && document.querySelector(`#railbody .panel[data-view="${saved}"]`) ? saved : "documents");
}

/* Attention dots.
 *
 * A badge that means "there is something here" has to be keyed on the CONTENT,
 * not on a counter: reloading the page should not light up every icon, and
 * looking at a panel should clear it until the underlying thing actually
 * changes. So each view reduces to a short signature and the dot is on when
 * the signature differs from the one you last saw. */
function badgeKey(view) {
  const d = BADGE_DATA;
  if (!d) return "";
  if (view === "directives") return (d.directives || []).filter((x) => !x.done).length + "";
  if (view === "documents") return String((d.documents || [])[0] && (d.documents || [])[0].file || "");
  if (view === "radar") return String(((d.radar || {}).breakouts || []).length);
  if (view === "playbook" || view === "knowledge") return String((d.playbook || {}).newest || "");
  return "";
}
function refreshBadges(d) {
  BADGE_DATA = d;
  const sheetOpen = $("sheet") && $("sheet").classList.contains("open");
  for (const view of ["documents", "radar", "playbook", "knowledge"]) {
    const b = document.querySelector(`#nav .tab[data-view="${view}"]`);
    if (!b) continue;
    const key = badgeKey(view);
    if (SEEN[view] === undefined) { SEEN[view] = key; b.dataset.badge = ""; }
    else {
      // a view you are looking at right now is seen; one behind a closed
      // sheet is not, even if its tab is the selected one
      const active = sheetOpen && b.classList.contains("on");
      if (active) { SEEN[view] = key; b.dataset.badge = ""; }
      else b.dataset.badge = key !== SEEN[view] ? "1" : "";
    }
    if (view === "documents") { const p = $("pill-docs"); if (p) p.dataset.badge = b.dataset.badge; }
  }
}

/* Panel search filters the rows that are already rendered rather than
 * re-fetching, so it stays instant and cannot fight the 20s poll. */
function wireSearch(id, rowSel, textOf) {
  const input = document.getElementById(id);
  if (!input) return;
  input.oninput = () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll(rowSel).forEach((el) => {
      el.style.display = !q || textOf(el).toLowerCase().includes(q) ? "" : "none";
    });
  };
}
/* The knowledge panel's bottom action opens the real playbook file rather than
 * a synthesised list, so you land in the thing agents actually write to. */
{
  const b = document.getElementById("kn-open");
  if (b) b.onclick = () => openArea("");
}
wireSearch("kn-search", "#knowledge .area", (el) => el.dataset.area || el.textContent);
wireSearch("doc-search", "#documents .doc", (el) => el.textContent);

/* The 20s poll rebuilds those rows, which silently un-filters a list you were
 * halfway through searching. Re-fire the handlers after every render. */
function reapplySearch() {
  for (const id of ["kn-search", "doc-search"]) {
    const el = document.getElementById(id);
    if (el && el.value) el.oninput();
  }
}

/* ---------- knowledge base ----------
 *
 * Colour is derived from the area name rather than assigned, so a new section
 * an agent invents tomorrow gets a stable colour without anyone maintaining a
 * lookup table. Same string always lands on the same hue.
 */
function hueFor(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
let KN_ALL = false;
function renderKnowledge(kn, pb) {
  const box = $("knowledge");
  if (!box) return;
  const areas = (kn && kn.areas) || [];
  $("kn-cap").textContent = areas.length ? `${(pb && pb.count) || 0} RULES` : "BASE";
  if (!areas.length) {
    box.innerHTML = `<div class="msg sys">nothing yet. point <b>knowledge.brain_files</b> at a
      playbook in settings, or let the post-mortem agent write one.</div>`;
    return;
  }
  const shown = KN_ALL ? areas : areas.slice(0, 8);
  const top = Math.max(...areas.map((a) => a.count), 1);
  box.innerHTML =
    `<div class="grouphead"><span>AREAS</span><span class="line"></span>
       <span class="n">${areas.length}</span></div>` +
    shown.map((a) => {
    const hue = hueFor(a.name);
    return `<div class="area" data-area="${esc(a.name)}"
       title="${a.count} rule${a.count === 1 ? "" : "s"}${a.newest ? ", newest " + esc(a.newest) : ""}${
         a.sources && a.sources.length ? " - " + esc(a.sources.join(", ")) : ""}">
      <span class="dot2" style="background:hsl(${hue} 72% 64%)"></span>
      <span class="nm">${esc(a.name)}</span>
      <span class="kbar"><i style="width:${Math.round((a.count / top) * 100)}%;background:hsl(${hue} 72% 64%)"></i></span>
      <span class="ct">${a.count}</span>
    </div>`;}).join("") +
    (areas.length > 8
      ? `<div class="more" id="kn-more">${KN_ALL ? "&#9662; show less"
          : `&#9656; ${areas.length - 8} more area${areas.length - 8 === 1 ? "" : "s"}`}</div>`
      : "");

  const more = $("kn-more");
  if (more) more.onclick = () => { KN_ALL = !KN_ALL; renderKnowledge(kn, pb); };
  box.querySelectorAll(".area").forEach((el) =>
    el.onclick = () => openArea(el.dataset.area));
}

/* Playbook rules are markdown - agents write **bold** and `code` into them.
 * Printing the asterisks and backticks raw is what the panel was doing.
 *
 * Escape FIRST, then promote a closed set of markers. Order matters: doing it
 * the other way round would let a rule's own text inject tags. Only bold and
 * code, because that is all the agents actually emit. */
function inlineMd(raw) {
  return esc(raw)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

/* Clicking an area shows every rule in it, from the full playbook rather than
 * the 12 the panel carries - the point of the knowledge base is depth. */
async function openArea(name) {
  $("modal-title").textContent = name || "Playbook - everything";
  const body = $("modal-body");
  body.className = "structured";
  body.textContent = "reading...";
  $("modal").classList.add("open");
  try {
    const d = await (await fetch("/api/playbook?section=" + encodeURIComponent(name))).json();
    const rules = d.rules || [];
    body.innerHTML = rules.length
      ? rules.map((r) => `<div class="rule">
<div class="rtext">${inlineMd(r.text)}</div>
          <div class="rmeta">${esc(r.date || "undated")}${r.source
            ? " &middot; " + esc(String(r.source).split("/").pop()) : ""}</div>
        </div>`).join("")
      : "nothing in this area yet.";
  } catch (e) { body.textContent = "could not read the playbook: " + e.message; }
}

/* primary directive cards cycle every 20s (subs <-> ARR) */
/* In focus the numbers column is gone, and this is what stands in for it:
 * the subscriber count with its target and pace, the other platforms as a
 * row of pairs, and the first open directive with its box. The box ticks it
 * off; "N more" leaves focus, where the whole queue is. */
function renderFocusLine() {
  const el = $("focusline");
  if (!el || !DATA) return;
  const v = DATA.vitals || {}, h = DATA.history || [], cfg = DATA.config || {};
  const cards = cfg.primary_cards || [];
  const card = cards.find((c) => c.metric === "yt_subs") || {};
  const channels = cfg.channels || {};
  const plats = [["IG", "ig_followers", channels.instagram], ["TT", "tiktok_followers", channels.tiktok],
                 ["LI", "linkedin_followers", channels.linkedin], ["X", "x_followers", channels.x]]
    .filter((p) => p[2]);
  const subsWk = weekDelta(h, "yt_subs");
  const open = (DATA.directives || []).map((x, i) => ({ text: x.text, done: x.done, i })).filter((x) => !x.done);
  const first = open[0];
  const lab = ["SUBSCRIBERS"];
  if (card.target) lab.push("TARGET " + fmt(card.target));
  if (subsWk != null) lab.push((subsWk >= 0 ? "+" : "") + fmt(subsWk) + " THIS WEEK");
  el.innerHTML =
    `<div class="fl-nums">
       <span class="fl-subs"><span class="fl-big">${fmt(v.yt_subs)}</span><span class="fl-lab">${lab.join(" · ")}</span></span>
       ${plats.length ? `<span class="fl-plats">${plats.map(([l, k]) => `<span>${l} <b>${fmt(v[k])}</b></span>`).join("")}</span>` : ""}
     </div>` +
    (first
      ? `<div class="fl-dir">
           <span class="box" title="mark done"></span>
           <span class="txt">${esc(first.text)}</span>
           ${open.length > 1 ? `<span class="more" title="leave focus to see the queue">${open.length - 1} more</span>` : ""}
         </div>`
      : `<div class="fl-dir"><span class="txt dim">nothing queued</span></div>`);
  const box = el.querySelector(".fl-dir .box");
  if (box && first) box.onclick = async () => {
    await fetch("/api/directives", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toggle: first.i }),
    });
    loadData();
  };
  const more = el.querySelector(".fl-dir .more");
  if (more) more.onclick = () => { if (window.JarvisFocus) window.JarvisFocus.set(false); };
}

function vital(label, num, delta, sparkHtml, deltaCls = "", title = "") {
  return `<div class="vital" title="${esc(title || "")}">
    <div class="row1"><span>· ${label}</span><span class="delta ${deltaCls}">${delta}</span></div>
    <div class="num">${num}</div>${sparkHtml}</div>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Which directives the operator has expanded. Kept outside the render so the
 * 20-second poll does not collapse a paragraph you were halfway through. */
const OPEN_DIRECTIVES = new Set();
let PB_FILTER = "ALL";   // playbook section filter

/* ---------- agent ring ---------- */
let AGENTS_LIST = [];
let AGENTS_OK = true;   // did the last poll answer
/* The ring is laid out in the gap BETWEEN the two rails, not across the whole
 * viewport.
 *
 * It used to use min(innerWidth, innerHeight) * 0.40 * 1.34 as the horizontal
 * radius, which on any wide monitor puts the leftmost and rightmost agents
 * underneath the rails - and the rails are z-index 4 against the ring's 3, so
 * those agents were painted and then covered. They were not missing, they were
 * behind the panels, which is why they looked like they "sometimes don't show".
 *
 * Measuring the rails rather than hardcoding their widths, so this stays correct
 * if a panel is resized or a rail is hidden.
 */
/* Re-lay the ring on every frame for the length of a panel transition.
 *
 * Panel transitions used to call layoutAgents twice - once immediately
 * and once after 300ms - so the agents jumped to their old place, sat there
 * through the animation, then snapped to the new one. Following the frames
 * costs ~18 layouts and makes the ring move with the panel instead of after it.
 */
function relayoutDuring(ms = 420) {
  const end = performance.now() + ms;
  const step = () => {
    layoutAgents();
    if (performance.now() < end) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* The stage is what is left between the numbers column and the chat column,
 * or the whole width when either stands down (focus hides the column; narrow
 * windows drop the chat to a strip along the bottom). Measured, not assumed,
 * so a resized column is handled without touching this. The sphere canvas is
 * full-viewport, so its centre is shifted to the stage's centre through
 * --stage-x, and the ring is centred on the same number. */
function stageEdges() {
  const focus = document.body.classList.contains("focus");
  const narrow = innerWidth <= 900;
  const rect = (sel) => { const e = document.querySelector(sel); return e && e.getBoundingClientRect(); };
  const side = focus || narrow ? null : rect("#side");
  const comms = narrow ? null : rect("#comms");
  const leftEdge = side && side.width > 0 ? side.right : 0;
  const rightEdge = comms && comms.width > 0 && comms.left > innerWidth / 2 ? comms.left : innerWidth;
  return { leftEdge, rightEdge, focus, narrow, rect };
}

function layoutAgents() {
  const { leftEdge, rightEdge, focus, narrow, rect } = stageEdges();
  const cx = (leftEdge + rightEdge) / 2;
  const cy = narrow ? (innerHeight - 260) / 2 : innerHeight / 2 - 8;
  document.body.style.setProperty("--stage-x", (cx - innerWidth / 2).toFixed(1) + "px");

  const els = [...document.querySelectorAll(".agent")];
  if (!els.length) return;

  // Fixed furniture the ring must not sit under. In focus the numbers line
  // sits at the bottom left; the status line is always at the top left.
  const reserved = [rect("#topline"), rect("#toppills"), focus ? rect("#focusline") : null, narrow ? rect("#comms") : null]
    .filter((r) => r && r.width > 0 && r.height > 0);

  const PAD = 22;
  let halfW = 0, halfH = 0;
  els.forEach((el) => {
    halfW = Math.max(halfW, el.offsetWidth / 2);
    halfH = Math.max(halfH, el.offsetHeight / 2);
  });

  const place = (rx, ry) => els.map((el, i) => {
    const a = -Math.PI / 2 + (i / els.length) * Math.PI * 2;
    return { el, x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });
  const clashes = (pts) => pts.some((p) => {
    const b = { left: p.x - halfW, right: p.x + halfW, top: p.y - halfH, bottom: p.y + halfH };
    if (b.left < leftEdge + PAD || b.right > rightEdge - PAD) return true;
    if (b.top < 8 || b.bottom > innerHeight - 8) return true;
    return reserved.some((r) => !(b.right < r.left - PAD || b.left > r.right + PAD
                               || b.bottom < r.top - PAD || b.top > r.bottom + PAD));
  });

  /* Shrink until nothing collides - but not past the point where the agents
   * start colliding with EACH OTHER. The floor is the circumference needed
   * to seat every label without touching: n labels of width w need at least
   * n*w of perimeter, so r >= n*w / 2pi. */
  const n = els.length;
  const minR = (n * (halfW * 2 + 14)) / (2 * Math.PI);

  let rx = Math.min(cx - leftEdge, rightEdge - cx) - halfW - PAD;
  let ry = Math.min(innerHeight * 0.36, rx * 0.95);
  let pts = place(rx, ry);
  for (let i = 0; i < 20 && clashes(pts); i++) {
    if (rx * 0.96 < minR || ry * 0.96 < minR * 0.55) break;
    rx *= 0.96; ry *= 0.96;
    pts = place(rx, ry);
  }

  /* Set the TARGET; the animator eases toward it, so the ring settles a beat
   * after the panel does, which is what reads as organic. Anything still
   * sitting on furniture at the floor is dimmed rather than moved. */
  pts.forEach((p) => {
    p.el._tx = p.x; p.el._ty = p.y;
    if (p.el._cx == null) { p.el._cx = p.x; p.el._cy = p.y; }   // no slide on first paint
    const b = { left: p.x - halfW, right: p.x + halfW, top: p.y - halfH, bottom: p.y + halfH };
    const buried = reserved.some((r) => !(b.right < r.left || b.left > r.right
                                       || b.bottom < r.top || b.top > r.bottom));
    p.el.classList.toggle("buried", buried);
  });
  startAgentAnim();
}

/* Critically-damped-ish easing toward the target, one rAF loop for all agents,
 * running only while something is actually moving. 0.16 per frame settles in
 * about 350ms at 60fps without the overshoot wobble a spring would add on top
 * of the panel's own spring. */
let agentAnim = 0;
function startAgentAnim() {
  if (agentAnim) return;
  const step = () => {
    let moving = false;
    document.querySelectorAll(".agent").forEach((el) => {
      if (el._tx == null) return;
      const dx = el._tx - el._cx, dy = el._ty - el._cy;
      if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) {
        el._cx = el._tx; el._cy = el._ty;
      } else {
        el._cx += dx * 0.16; el._cy += dy * 0.16;
        moving = true;
      }
      el.style.left = el._cx.toFixed(1) + "px";
      el.style.top = el._cy.toFixed(1) + "px";
    });
    agentAnim = moving ? requestAnimationFrame(step) : 0;
  };
  agentAnim = requestAnimationFrame(step);
}

async function loadAgents() {
  try {
    const d = await (await fetch("/api/agents")).json();
    const changed = AGENTS_LIST.length !== d.agents.length;
    AGENTS_LIST = d.agents;
    const box = $("agents");
    if (!box.children.length || changed) {
      box.innerHTML = AGENTS_LIST.map((a) =>
        `<div class="agent" id="ag-${esc(a.id)}" title="${esc(a.description || a.label)}${a.id === "runner" ? "" : " - click to see what it does"}">
          <span class="adot"></span>${esc(a.label)}<span class="atag">${esc(a.tag)}</span></div>`
      ).join("");
      layoutAgents();
      // clicking an agent explains it, with a button to run it there and then
      AGENTS_LIST.filter((a) => a.id !== "runner").forEach((a) => {
        const el = $("ag-" + a.id);
        if (el) el.onclick = () => explainAgent(AGENTS_LIST.find((x) => x.id === a.id) || a);
      });
    }
    dispatchFromAgents(AGENTS_LIST);
    for (const a of AGENTS_LIST) {
      const el = $("ag-" + a.id);
      if (!el) continue;
      el.classList.toggle("live", a.running || (a.id === "runner" && state !== "idle"));
      el.classList.toggle("off", a.enabled === false || (a.unmet || []).length > 0);
    }
    AGENTS_OK = true;
  } catch { AGENTS_OK = false; }
  // one poll, one event: the status line and the plate health words follow
  // this rather than fetching the same list again on their own timers
  document.dispatchEvent(new Event("jarvis:agents"));
}

/* Clicking an agent explains it before it does anything.
 *
 * It used to fire the agent immediately. That is a surprising amount of
 * consequence for one click on a word you have never seen - some of these
 * spend money - and it taught nobody what the agent was for. Now the click
 * answers "what is this and when does it run", and running is a deliberate
 * second click.
 */
const CRON_WORDS = (c) => {
  const p = String(c || "").trim().split(/\s+/);
  if (p.length < 5) return "on demand only";
  const [min, hr, , , dow] = p;
  const at = /^\d+$/.test(hr) && /^\d+$/.test(min)
    ? `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}` : c;
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  if (dow === "*") return `every day at ${at}`;
  if (/^\d$/.test(dow)) return `every ${days[+dow]} at ${at}`;
  return `${c} (cron)`;
};

function explainAgent(a) {
  const unmet = a.unmet || [];
  const rows = [
    ["Runs", a.enabled === false ? "not enabled" : CRON_WORDS(a.schedule)],
    ["Writes", "a report into the documents trail, bottom left"],
  ];
  if (unmet.length) rows.push(["Needs", `${unmet.join(", ")} - it will skip until you set that`]);

  $("modal-title").textContent = a.label;
  const body = $("modal-body");
  body.textContent = "";
  const p = document.createElement("p");
  p.textContent = a.description || "No description in this agent's frontmatter.";
  p.style.cssText = "margin:0 0 14px; line-height:1.5;";
  body.appendChild(p);
  for (const [k, v] of rows) {
    const line = document.createElement("div");
    line.style.cssText = "margin:4px 0; font-size:12px; opacity:.85;";
    line.textContent = `${k}: ${v}`;
    body.appendChild(line);
  }
  const btn = document.createElement("button");
  btn.textContent = unmet.length ? "Run anyway" : "Run it now";
  btn.style.cssText = "margin-top:16px; padding:8px 14px; cursor:pointer;" +
    "font-family:var(--mono); font-size:11px; letter-spacing:1.5px;" +
    "background:transparent; color:var(--accent-hi);" +
    "border:1px solid var(--accent); border-radius:var(--radius-sm);";
  btn.onclick = (e) => {
    e.stopPropagation();
    $("modal").classList.remove("open");
    runAgent(a);
  };
  body.appendChild(btn);
  $("modal").classList.add("open");
}

async function runAgent(a) {
  if ((a.unmet || []).length) {
    addMsg("sys", `${a.label.toLowerCase()} needs config: ${a.unmet.join(", ")}`, a.id);
    return;
  }
  addMsg("sys", `running ${a.label.toLowerCase()} agent - output lands in the documents trail`, a.id);
  try {
    const r = await (await fetch("/api/agents/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: a.id }),
    })).json();
    if (r.error) addMsg("sys", `${a.label.toLowerCase()}: ${r.error}`, a.id);
    else setTimeout(loadAgents, 1500);
  } catch (e) { addMsg("sys", "could not start agent: " + e.message); }
}
addEventListener("resize", layoutAgents);
loadAgents();
setInterval(loadAgents, 8000);

/* Tooltips report live state - a toggle whose tip always reads "on" is worse
 * than no tip, since it tells you the opposite of the truth half the time. */
const tip = (id, text) => { const el = $(id); if (el) el.dataset.tip = text; };

/* Cycling was fine with three themes. With eight it means clicking blind past
 * seven you did not want, so this opens a picker instead. Each swatch is
 * painted from the theme's own tokens, so it previews rather than describes. */
function themeMenu() {
  const open = $("thememenu");
  if (open) { open.remove(); return; }
  const el = document.createElement("div");
  el.id = "thememenu";
  el.innerHTML = Object.entries(THEMES).map(([k, t]) => `
    <button class="tm-opt${k === themeName ? " on" : ""}" data-theme="${k}">
      <span class="tm-sw" style="background:${t.vars["--bg"]};border-color:${t.vars["--accent"]}">
        <i style="background:${t.vars["--accent"]}"></i>
        <i style="background:${t.vars["--accent-hi"]}"></i>
        <i style="background:${t.vars["--green"]}"></i>
        <i style="background:${t.vars["--red"]}"></i>
      </span>
      <span class="tm-txt"><b>${t.label}</b><em>${t.note}</em></span>
    </button>`).join("");
  document.body.appendChild(el);
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme]");
    if (!b) return;
    applyTheme(b.dataset.theme);
    el.remove();
  });
  // one-shot: closing on the next outside click, without leaking a listener
  setTimeout(() => document.addEventListener("click", function away(ev) {
    if (!el.contains(ev.target) && ev.target.id !== "theme") {
      el.remove(); document.removeEventListener("click", away);
    }
  }), 0);
}
$("theme").onclick = themeMenu;
$("modal").onclick = () => $("modal").classList.remove("open");
loadData();
setInterval(loadData, 5 * 60 * 1000);

/* ================= chat -> claude code ================= */
let sessionId = localStorage.getItem("jarvis_session") || null, speakOn = true;
const ACKS = ["On it.", "Right away.", "Working on it now.", "Checking that now.", "Give me a moment.", "Running it now."];
const msgs = $("msgs");
/* Every message is stamped with the agent it produced it, so a reply and an
 * agent's "started" line can be told apart later. One transcript shows all
 * of it. */
function addMsg(cls, text, agent) {
  const el = document.createElement("div");
  el.className = "msg " + cls; el.textContent = text;
  el.dataset.agent = agent || "jarvis";
  el.dataset.time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  msgs.appendChild(el);
  pinBottom();
  return el;
}

/* Keep the transcript pinned to the bottom - but only if you were already
 * there, and at most once a frame.
 *
 * Every streamed token used to assign msgs.scrollTop directly. That is a
 * synchronous layout per token, which is the jitter, and it also yanked you
 * back down if you had scrolled up to read something while a reply was still
 * arriving.
 */
let pinned = true, pinQueued = false, lastSet = 0;
function pinBottom() {
  if (!pinned || pinQueued) return;
  pinQueued = true;
  requestAnimationFrame(() => {
    pinQueued = false;
    msgs.scrollTop = msgs.scrollHeight;
    lastSet = msgs.scrollTop;
  });
}
/* Unpin only when the scroll position moved UP from where pinBottom last put
 * it - that is a person. This used to unpin whenever the event found the
 * bottom more than 48px away, but scroll events arrive a frame late, and a
 * single streamed delta of three lines is more than 48px, so the transcript
 * routinely stranded itself on the question with the answer out of sight. */
msgs.addEventListener("scroll", () => {
  if (msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 48) pinned = true;
  else if (msgs.scrollTop < lastSet - 1) pinned = false;
}, { passive: true });

/* ---------- dispatch toasts ----------
 *
 * The "what is it doing right now" card. Fires when an agent starts or
 * finishes, and when the brain starts thinking. Deliberately transient: a
 * permanent status panel becomes wallpaper within a day, and the transcript on
 * the far right already keeps the durable record.
 */
const DISPATCH_MS = 7000;
function dispatch(who, tag, body) {
  const box = $("dispatch");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "disp";
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  el.innerHTML = `<span class="badge">J</span><div>
      <div><span class="who">${esc(who)}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ""}<span class="when">${now}</span></div>
      <div class="body">${esc(body)}</div></div>`;
  box.appendChild(el);
  // Three is enough to see a burst without the stack covering the ring.
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 400);
  }, DISPATCH_MS);
}

/* Agents that were running last poll, so a start and a finish each fire once
 * rather than every two seconds for as long as the agent runs. */
const WAS_RUNNING = new Set();
function dispatchFromAgents(list) {
  for (const a of list) {
    if (a.id === "runner") continue;
    if (a.running && !WAS_RUNNING.has(a.id)) {
      WAS_RUNNING.add(a.id);
      dispatch(a.label, "running", a.description || `${a.label.toLowerCase()} agent started`);
      addMsg("sys", `${a.label.toLowerCase()} started`, a.id);
    } else if (!a.running && WAS_RUNNING.has(a.id)) {
      WAS_RUNNING.delete(a.id);
      dispatch(a.label, "done", `${a.label.toLowerCase()} finished - output in the documents trail`);
      addMsg("sys", `${a.label.toLowerCase()} finished - output in the documents trail`, a.id);
    }
  }
}

/* Chips under a finished reply. COPY is real; the source chip only appears
 * when the reply actually came from an agent tab, so it never claims a
 * provenance that does not exist. */
/* URLs in a finished reply become links, and each distinct one also gets a
 * pill above the message, so a Loom or a doc is one click rather than a hunt
 * through a paragraph. Built from DOM nodes, never innerHTML: the text is the
 * model's, and it can say anything. Runs once streaming has ended - the live
 * reply writes textContent per token and must stay a plain node. */
const URL_RE = /https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/g;
function linkify(el, text) {
  /* One wrapper span. .msg.jarvis is a grid (avatar column, text column), so
   * loose text runs and <a>s would each become a grid item and the links
   * would wrap letter by letter down the 24px avatar column. */
  const body = document.createElement("span");
  body.className = "msgtext";
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    body.append(text.slice(last, m.index));
    const a = document.createElement("a");
    a.className = "msglink"; a.href = m[0]; a.textContent = m[0];
    a.target = "_blank"; a.rel = "noopener";
    body.append(a);
    last = m.index + m[0].length;
  }
  body.append(text.slice(last));
  el.textContent = "";
  el.appendChild(body);
}
function linkPills(el, text) {
  const urls = [...new Set([...text.matchAll(URL_RE)].map((m) => m[0]))];
  if (!urls.length) return;
  const row = document.createElement("div");
  row.className = "linkrow";
  for (const u of urls) {
    const a = document.createElement("a");
    a.className = "chip link"; a.href = u; a.title = u;
    a.target = "_blank"; a.rel = "noopener";
    let label = u;
    try {
      const p = new URL(u);
      const path = p.pathname.replace(/\/$/, "");
      label = p.hostname.replace(/^www\./, "") + (path.length > 1 ? path.slice(0, 40) + (path.length > 40 ? "\u2026" : "") : "");
    } catch {}
    a.textContent = label;
    row.appendChild(a);
  }
  el.before(row);
}

function chipRow(el, agent) {
  if (!el || el.querySelector(".msgfoot")) return;
  const foot = document.createElement("div");
  foot.className = "msgfoot";
  if (agent && agent !== "jarvis") {
    const src = document.createElement("span");
    src.className = "chip src";
    src.textContent = "SOURCE \u00b7 " + String(agent).toUpperCase();
    foot.appendChild(src);
  }
  const copy = document.createElement("button");
  copy.className = "chip";
  copy.textContent = "COPY";
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(el.textContent.replace(/COPY$|SOURCE.*$/g, "").trim());
      copy.textContent = "COPIED"; copy.classList.add("done");
      setTimeout(() => { copy.textContent = "COPY"; copy.classList.remove("done"); }, 1600);
    } catch { copy.textContent = "NO CLIPBOARD"; }
  };
  foot.appendChild(copy);
  el.appendChild(foot);
}

/* The + reveals wake / speak / theme / settings. Collapsed by default so the
 * composer reads as one input rather than a row of six controls. */
{
  const bar = $("bar"), more = $("more");
  if (bar && more) {
    more.onclick = () => {
      const open = bar.classList.toggle("open");
      more.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) layoutAgents();   // panel width is unchanged, but be safe
    };
  }
}
function setState(s) {
  state = s;
  window.__hudState = s;
  const bar = $("bar"), sd = $("statedot");
  if (bar) bar.classList.toggle("busy", s !== "idle");
  if (sd) sd.title = s === "thinking" ? "Working" : s === "speaking" ? "Speaking"
    : s === "listening" ? "Listening" : "Idle";
  const r = document.getElementById("ag-runner");
  if (r) r.classList.toggle("live", s !== "idle");
}

async function send(message) {
  if (!message.trim()) return;
  // Sending is the one moment you always want to be at the bottom, even if
  // you had scrolled up to reread something: the answer lands there.
  pinned = true;
  addMsg("you", message);
  $("cmd").value = "";
  setState("thinking");
  const ack = ACKS[Math.floor(Math.random() * ACKS.length)];
  addMsg("sys", ack.toLowerCase());
  if (speakOn) speak(ack, true);
  const reply = addMsg("jarvis", "");
  /* Three pulsing dots where the answer will land. The first delta assigns
   * textContent, which removes them; so do the error and done paths. The
   * ack line above says Jarvis heard you, this says it is still typing. */
  const typing = document.createElement("span");
  typing.className = "typing";
  typing.setAttribute("aria-label", "Jarvis is replying");
  typing.append(...[0, 1, 2].map(() => document.createElement("i")));
  reply.appendChild(typing);
  const tools = document.createElement("div");
  reply.before(tools);
  let acc = "";
  try {
    const resp = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
    });
    const rd = resp.body.getReader(), dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await rd.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const evm = chunk.match(/^event: (.+)$/m), dm = chunk.match(/^data: (.+)$/m);
        if (!evm || !dm) continue;
        const ev = evm[1], data = JSON.parse(dm[1]);
        if (ev === "session") { sessionId = data.sessionId; localStorage.setItem("jarvis_session", sessionId); }
        else if (ev === "delta") { acc += data.text; reply.textContent = acc; pinBottom(); }
        else if (ev === "tool") {
          const c = document.createElement("span");
          c.className = "toolchip"; c.textContent = data.name;
          tools.appendChild(c);
        }
        else if (ev === "done") {
          // The server's final text wins: it strips a `RUN:` line the brain
          // used to start agents and appends what actually started.
          if (typeof data.result === "string" && data.result !== acc) { reply.textContent = acc = data.result; pinBottom(); }
          if (data.sessionId) { sessionId = data.sessionId; localStorage.setItem("jarvis_session", sessionId); }
        }
        else if (ev === "error") {
          /* A brain failure is not an answer. The server classifies it
           * (kind, label, message, hint) so this can say what broke and what
           * fixes it, rather than appending an opaque code under text the
           * model never meant as a reply. */
          const box = document.createElement("div");
          box.className = "brainerr" + (data.kind ? " k-" + data.kind : "");
          const head = document.createElement("div");
          head.className = "brainerr-head";
          head.textContent = data.label || "the brain failed";
          box.appendChild(head);
          for (const [cls, text] of [["brainerr-msg", data.message || data.code], ["brainerr-hint", data.hint]]) {
            if (!text) continue;
            const el = document.createElement("div");
            el.className = cls;
            el.textContent = text;
            box.appendChild(el);
          }
          reply.textContent = acc;
          reply.parentNode.appendChild(box);
          // The box is the reply's last word. Without this the transcript sat
          // on the question with the failure out of sight below it.
          pinBottom();
        }
      }
    }
  } catch (e) { reply.textContent = acc + "\n[link error: " + e.message + "]"; }
  typing.remove();   // a reply that ended with nothing at all
  // Chips go on only once the reply has finished streaming - appending them
  // mid-stream would put them above text that is still arriving.
  if (acc) { linkify(reply, acc); linkPills(reply, acc); chipRow(reply, "jarvis"); }
  pinBottom();
  loadData();
  if (speakOn && acc) speak(acc); else setState("idle");
}

$("cmd").addEventListener("keydown", (e) => { if (e.key === "Enter") send($("cmd").value); });
// The spec draws a send button, so it has to actually send - Enter alone is
// not discoverable on a composer that looks like it has one.
{ const s = $("send"); if (s) s.onclick = () => send($("cmd").value); }

/* ---------- voice out (elevenlabs -> browser fallback) ---------- */
let audioEl = null;
function stopSpeaking() {
  if (audioEl) { audioEl.pause(); audioEl = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
}
async function speak(text, quiet = false) {
  const clean = text.replace(/```[\s\S]*?```/g, " code block omitted ")
    .replace(/[*_#`>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 1100);
  if (!clean) { if (!quiet) setState("idle"); return; }
  if (!quiet) stopSpeaking();
  try {
    const r = await fetch("/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
    });
    if (!r.ok) throw new Error("tts " + r.status);
    const blob = await r.blob();
    const el = new Audio(URL.createObjectURL(blob));
    if (!quiet) {
      audioEl = el;
      el.onplay = () => setState("speaking");
      el.onended = el.onerror = () => setState("idle");
    }
    await el.play();
    return;
  } catch (e) { /* fall back to browser voice */ }
  if (!window.speechSynthesis) { if (!quiet) setState("idle"); return; }
  if (quiet) return; // don't queue browser speech over a coming reply
  const u = new SpeechSynthesisUtterance(clean);
  const v = speechSynthesis.getVoices().find((v) => /Daniel|Oliver|en-GB/i.test(v.name + v.lang));
  if (v) u.voice = v;
  u.rate = 1.04; u.pitch = 0.92;
  u.onstart = () => setState("speaking");
  u.onend = u.onerror = () => setState("idle");
  speechSynthesis.speak(u);
}
const speakTip = () =>
  tip("speak", speakOn
    ? "Spoken replies — on. Answers are read aloud."
    : "Spoken replies — off. Click to hear answers.");

$("speak").onclick = () => {
  speakOn = !speakOn;
  $("speak").classList.toggle("off", !speakOn);
  if (!speakOn) stopSpeaking();
  speakTip();
};
speakTip();

/* ---------- voice in ----------
 * Two paths. If the server has a working speech-to-text provider (local
 * whisper, or OpenAI when a key is present), we record audio here and post it
 * there - the audio stays on the machine when whisper is local. Otherwise we
 * fall back to the browser's SpeechRecognition, which is Chrome only and
 * uploads audio to Google. */
let STT_SERVER = false;
fetch("/api/status")
  .then((r) => r.json())
  .then((s) => {
    STT_SERVER = Boolean(s.stt_server_side);
    const active = (s.brain || {}).active;
    if (!active)
      addMsg("sys", "no brain available - install claude code, or set OPENAI_API_KEY, or point brain.openai.base_url at a local model");
  })
  .catch(() => {});

let mediaRec = null, chunks = [], recording = false;

/* getUserMedia fails at least five distinct ways and this used to report all of
 * them as "permission denied", which sends you to check a permission that was
 * never the problem. A Mac Studio has no built-in microphone, so the common
 * case here is genuinely no device rather than a denied one. Say which. */
const MIC_ERRORS = {
  NotFoundError: "no microphone found. Nothing is plugged in, or macOS has no " +
    "audio input device. Check System Settings > Sound > Input.",
  NotAllowedError: "microphone blocked. Allow it for this site in Chrome, and " +
    "check System Settings > Privacy & Security > Microphone for your browser.",
  NotReadableError: "the microphone is there but something else is holding it. " +
    "Close whatever is recording and try again.",
  OverconstrainedError: "no microphone matches what was asked for.",
  SecurityError: "the browser refused mic access on this origin. Use " +
    "localhost or 127.0.0.1 rather than a LAN address.",
};

async function startRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    addMsg("sys", MIC_ERRORS[e.name] || `microphone failed: ${e.name} ${e.message}`);
    return false;
  }
  chunks = [];
  const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  mediaRec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  mediaRec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mediaRec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: mediaRec.mimeType || "audio/webm" });
    if (blob.size < 1200) { setState("idle"); return; } // basically silence
    setState("thinking");
    try {
      const r = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      const data = await r.json();
      if (data.text) { $("cmd").value = data.text; send(data.text); }
      else { addMsg("sys", "could not transcribe that"); setState("idle"); }
    } catch (e) {
      addMsg("sys", "transcription failed: " + e.message);
      setState("idle");
    }
  };
  mediaRec.start();
  recording = true;
  return true;
}

function stopRecording() {
  recording = false;
  $("mic").classList.remove("listening");
  try { mediaRec && mediaRec.state !== "inactive" && mediaRec.stop(); } catch {}
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
if (SR) {
  rec = new SR();
  rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false;
  rec.onresult = (e) => {
    const t = Array.from(e.results).map((r) => r[0].transcript).join("");
    $("cmd").value = t;
    if (e.results[e.results.length - 1].isFinal) { stopListen(); send(t); }
  };
  rec.onend = () => { if (listening) stopListen(); };
  rec.onerror = () => stopListen();
}
function stopListen() {
  listening = false; $("mic").classList.remove("listening");
  if (state === "listening") setState("idle");
  try { rec && rec.stop(); } catch {}
}
$("mic").onclick = async () => {
  if (recording) return stopRecording();
  if (listening) return stopListen();
  stopSpeaking();

  if (STT_SERVER && window.MediaRecorder && navigator.mediaDevices) {
    $("mic").classList.add("listening");
    setState("listening");
    if (!(await startRecording())) { $("mic").classList.remove("listening"); setState("idle"); }
    return;
  }
  if (!rec) {
    addMsg("sys", "no speech input available - install local whisper, add an OpenAI key, or use chrome");
    return;
  }
  listening = true; $("mic").classList.add("listening"); setState("listening");
  rec.start();
};
addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== $("cmd")) { e.preventDefault(); $("cmd").focus(); }
  if (e.key === "Escape") $("modal").classList.remove("open");
});

/* ---------- wake word: "jarvis ..." ---------- */
let wakeOn = localStorage.getItem("jarvis_wake") === "1", wakeRec = null, armed = false;
function syncWake() {
  if (!SR) return;
  const shouldRun = wakeOn && state === "idle" && !listening;
  if (shouldRun && !wakeRec) {
    wakeRec = new SR();
    wakeRec.lang = "en-US"; wakeRec.continuous = true; wakeRec.interimResults = false;
    wakeRec.onresult = (e) => {
      const t = e.results[e.results.length - 1][0].transcript.trim();
      const m = t.match(/\bjarvis\b[,.]?\s*(.*)/i);
      if (armed && t) { armed = false; send(t); return; }
      if (!m) return;
      const cmd = m[1].trim();
      if (cmd.split(/\s+/).filter(Boolean).length >= 2) send(cmd);
      else { armed = true; speak("Yes?"); setTimeout(() => (armed = false), 12000); }
    };
    wakeRec.onend = () => { wakeRec = null; setTimeout(syncWake, 400); };
    wakeRec.onerror = () => {};
    try { wakeRec.start(); } catch { wakeRec = null; }
  } else if (!shouldRun && wakeRec) {
    const r = wakeRec; wakeRec = null;
    try { r.onend = null; r.stop(); } catch {}
  }
}
const origSetState = setState;
setState = (s) => { origSetState(s); syncWake(); };
const wakeTip = () =>
  tip("wake", wakeOn
    ? "Wake word — armed. Say “jarvis, …” out loud; no clicking."
    : "Wake word — off. Turn on and just say “jarvis, …” out loud.");

function syncWakeButton() {
  $("wake").classList.toggle("on", wakeOn);
  $("wake").classList.toggle("off", !wakeOn);
  wakeTip();
}

syncWakeButton();
$("wake").onclick = () => {
  wakeOn = !wakeOn;
  localStorage.setItem("jarvis_wake", wakeOn ? "1" : "0");
  syncWakeButton();
  if (wakeOn) addMsg("sys", "wake word armed - say 'jarvis, <request>'");
  syncWake();
};
syncWake();
