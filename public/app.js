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
const CHROME = {
  glass: { "--blur": "6px",  "--radius": "0px", "--radius-sm": "2px" },
  soft:  { "--blur": "12px", "--radius": "8px", "--radius-sm": "3px" },
  flat:  { "--blur": "0px",  "--radius": "0px", "--radius-sm": "0px" },
};

const THEMES = {
  reactor: { label: "Reactor", note: "The original. Arc reactor blue.",
    mode: "rings", hue: "125,211,252", chrome: "glass", vars: {
    "--bg": "#040810", "--panel": "rgba(10,22,38,0.55)", "--panel-deep": "rgba(6,14,26,0.72)",
    "--line": "rgba(125,211,252,0.25)", "--line-soft": "rgba(125,211,252,0.10)",
    "--accent": "#38bdf8", "--accent-hi": "#7dd3fc", "--accent-rgb": "56,189,248",
    "--text": "#e6f0fb", "--dim": "#8fa3bd", "--strong": "#ffffff",
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

function spark(hist, key) {
  const vals = hist.map((r) => r[key]).filter((v) => v != null);
  if (vals.length < 2) return "";
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const ptsStr = vals.map((v, i) =>
    `${(i / (vals.length - 1)) * 100},${16 - ((v - min) / span) * 14}`).join(" ");
  return `<svg viewBox="0 0 100 18" preserveAspectRatio="none"><polyline points="${ptsStr}"/></svg>`;
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
  $("tagline").textContent = d.config.tagline;
  const v = d.vitals, h = d.history;

  // vitals - every tile is driven by config, so an unconfigured channel simply
  // is not drawn rather than sitting there permanently blank
  const cfg = d.config;
  const show = (k) => (cfg.vitals_show || []).includes(k);
  const channels = cfg.channels || {};
  const cell = (lab, val, delta, na) =>
    `<div class="vcell"><div class="lab">${esc(lab)}</div><div class="n">${val}</div><div class="d ${na ? "na" : ""}">${delta}</div></div>`;
  const wkTxt = (wk) => wk == null ? "tracking" : (wk >= 0 ? "▲ " : "▼ ") + fmt(Math.abs(wk)) + "/wk";

  let html = "";

  if (show("yt_subs") && channels.youtube) {
    const subsWk = weekDelta(h, "yt_subs");
    html += vital("Subscribers", fmt(v.yt_subs), wkTxt(subsWk), spark(h, "yt_subs"), subsWk > 0 ? "good" : "");
  }

  const grid = [];
  const maybe = (key, label, valueKey, histKey) => {
    if (!show(key)) return;
    const wk = weekDelta(h, histKey);
    grid.push(cell(label, fmt(v[valueKey]), v[valueKey] == null ? "tell jarvis" : wkTxt(wk), wk == null));
  };
  if (channels.instagram) maybe("instagram", "Instagram", "ig_followers", "ig_followers");
  if (channels.tiktok) maybe("tiktok", "TikTok", "tiktok_followers", "tiktok_followers");
  if (channels.linkedin) maybe("linkedin", "LinkedIn", "linkedin_followers", "linkedin_followers");
  if (channels.x) maybe("x", "X", "x_followers", "x_followers");
  if (show("community") && v.community_members != null) {
    grid.push(cell(cfg.community_label || "Community", fmt(v.community_members),
      (v.community_joins_7d || 0) + " joins/wk", !v.community_joins_7d));
  }
  if (grid.length) html += `<div class="vgrid">${grid.join("")}</div>`;

  const latest = v.yt_latest || {};
  if (show("latest_video") && latest.title) {
    html += vital("Latest video", fmt(latest.views),
      latest.views_per_day ? "≈" + fmt(latest.views_per_day) + " /day" : "",
      spark(h, "latest_views"), "", latest.title);
  }

  // the check-in tile only appears once something is actually writing check-ins
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
  $("directives").innerHTML = d.directives.map((x, i) =>
    `<div class="directive ${x.done ? "done" : ""}" data-i="${i}"
       title="${x.source ? `proposed by the ${esc(x.source)} agent${x.added ? " on " + esc(x.added) : ""}` : "added by you"}">
      <span class="box"></span>
      <span>${esc(x.text)}${x.source ? `<span class="src">${esc(x.source)}</span>` : ""}</span>
    </div>`
  ).join("") ||
    `<div class="msg sys">nothing queued. ask jarvis to "add a directive to ..." or let the
     morning agent set them.</div>`;
  document.querySelectorAll(".directive").forEach((el) =>
    el.onclick = async () => {
      await fetch("/api/directives", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toggle: +el.dataset.i }) });
      loadData();
    });

  // radar
  const radar = d.radar || {};
  const brks = (radar.breakouts || []).slice(0, 4);
  const watching = (radar.channels || []).length;
  const names = (radar.names) || {};
  // channel + views alongside the multiple: the multiple says "unusual for
  // them", the view count says whether it is worth your time
  $("radar").innerHTML = brks.length
    ? brks.map((b) => {
        const who = esc(names[b.channel] || String(b.channel).replace(/^@|^channel\//, ""));
        const hot = b.multiple >= 5;
        return `<div class="brk" onclick="window.open('https://youtube.com/watch?v=${esc(b.id)}')"
              title="${esc(b.title)}
${who} · ${fmt(b.views)} views in ${b.age_days}d · ${b.multiple}x that channel's normal pace">
          <div class="brk-top">
            <span class="brk-mult ${hot ? "hot" : ""}">${b.multiple}x</span>
            <span class="brk-title">${esc(b.title.slice(0, 46))}</span>
          </div>
          <div class="brk-meta">${who} · <b>${fmt(b.views)}</b> views · ${b.age_days}d</div>
        </div>`;
      }).join("")
    : watching
      ? `<div class="msg sys">no breakouts - watching ${watching} channel${watching > 1 ? "s" : ""}</div>`
      : `<div class="msg sys">add channels to watch in settings, then run the radar agent</div>`;

  // playbook - what the agents have concluded
  const pb = d.playbook || { rules: [], count: 0, newest: "", sections: 0 };
  $("pb-cap").textContent = pb.count
    ? `${pb.count} RULE${pb.count === 1 ? "" : "S"}` : "LEARNED";
  $("playbook").innerHTML = pb.rules.length
    ? pb.rules.slice(0, 5).map((r) => {
        // strip the inline date stamp - the panel already shows it in the meta
        const text = r.text.replace(/\s*\[(?:confirmed |updated )?\d{4}-\d{2}-\d{2}\]:?\s*/, " ")
          .replace(/\*\*/g, "").trim();
        return `<div class="rule" data-f="${esc(r.source)}" title="click to open the playbook">
          <div class="rtext">${esc(text.slice(0, 150))}${text.length > 150 ? "…" : ""}</div>
          <div class="rmeta">${esc(r.section)}${r.date ? " · " + esc(r.date) : ""}</div>
        </div>`;
      }).join("")
    : `<div class="msg sys">nothing learned yet. the post-mortem and study agents
       write what they confirm into your playbook, and it shows up here.</div>`;
  document.querySelectorAll(".rule").forEach((el) =>
    el.onclick = async () => {
      const r = await (await fetch("/api/doc?f=" + encodeURIComponent(el.dataset.f))).json();
      $("modal-title").textContent = r.name || "playbook";
      $("modal-body").textContent = r.content || r.error;
      $("modal").classList.add("open");
    });

  // documents
  $("documents").innerHTML = d.documents.map((x) =>
    `<div class="doc" data-f="${esc(x.file)}" title="click to read"><span>${esc(x.name.slice(0, 32))}</span><span class="age">${x.age}</span></div>`
  ).join("") ||
    `<div class="msg sys">empty. agent reports and drafts land here - click any agent on the
     ring to see what it does, and run it from there.</div>`;
  document.querySelectorAll(".doc").forEach((el) =>
    el.onclick = async () => {
      const r = await (await fetch("/api/doc?f=" + encodeURIComponent(el.dataset.f))).json();
      $("modal-title").textContent = r.name || "document";
      $("modal-body").textContent = r.content || r.error;
      $("modal").classList.add("open");
    });

  renderPrimary();
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
  el.innerHTML = d.config.configured
    ? `try asking: ${[
        "what can you do?",
        "how am I tracking this week?",
        "add a directive to film the agent video",
      ].map(asked).join(" · ")}`
    : `setup isn't finished, so most numbers will be blank. run <b>jarvis setup</b> in a
       terminal, or press the gear button. then try ${asked("what can you do?")}`;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

function renderCalendar(cal) {
  const el = $("calstrip");
  if (!cal || !cal.days) { el.style.display = "none"; return; }
  const names = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const todayIso = new Date().toLocaleDateString("sv-SE");
  // legend lists only the slot types this week's plan actually uses
  const types = [...new Set(cal.days.flatMap((d2) => d2.items.map((i2) => i2.type)))];
  el.innerHTML = cal.days.map((day, i) =>
    `<div class="day ${day.date === todayIso ? "today" : ""}">
      <div class="d">${names[i]}</div>
      <div class="slots">${day.items.map((it) =>
        `<span class="slot ${esc(it.type)} ${it.done ? "done" : ""}" title="${esc(it.type)}"></span>`).join("")}
      </div></div>`
  ).join("") + (types.length
    ? `<div class="legend"><span>${types.map((t) => `■ ${esc(t)}`).join(" ")}</span></div>`
    : "");
}

/* primary directive cards cycle every 20s (subs <-> ARR) */
let cardIdx = 0;
function renderPrimary() {
  if (!DATA) return;
  const v = DATA.vitals, h = DATA.history;
  const cards = DATA.config.primary_cards || [];
  const pd = cards[cardIdx % cards.length];
  if (!pd) return;
  const latest = v.yt_latest || {};
  $("pd-label").textContent = "PRIMARY DIRECTIVE · " + pd.label;
  const meta = (pairs) => pairs.map(([l, x]) => `<span>${l} <b>${x}</b></span>`).join("");
  if (pd.metric === "audience") {
    const parts = [["YT", v.yt_subs], ["IG", v.ig_followers], ["TT", v.tiktok_followers], ["LI", v.linkedin_followers]];
    const total = parts.reduce((s2, [, x]) => s2 + (x || 0), 0);
    const wk = ["yt_subs", "ig_followers", "tiktok_followers", "linkedin_followers"]
      .map((k) => weekDelta(h, k)).filter((x) => x != null).reduce((a, b) => a + b, 0);
    $("pd-num").textContent = fmt(total);
    document.querySelector("#primary .big small").textContent = "FOLLOWERS";
    $("pd-meta").innerHTML = meta([
      ["TARGET", fmt(pd.target)],
      ["THIS WEEK", (wk >= 0 ? "+" : "") + fmt(wk)],
      ["PLATFORMS", "4"],
    ]);
    $("pd-deploy").innerHTML = parts.map(([l, x]) => `${l} <b>${fmt(x)}</b>`).join(" · ");
  } else if (pd.metric === "arr") {
    const biz = v.business || {};
    $("pd-num").textContent = "$" + fmt(biz.arr);
    document.querySelector("#primary .big small").textContent = "ARR";
    $("pd-meta").innerHTML = meta([
      ["TARGET", "$" + fmt(pd.target)],
      ["MRR", biz.mrr != null ? "$" + fmt(biz.mrr) : "—"],
      ["EMAIL LIST", biz.email_subs != null ? fmt(biz.email_subs) : "—"],
    ]);
    $("pd-deploy").innerHTML = biz.week_start
      ? `last business snapshot · <b>week of ${esc(biz.week_start)}</b>` : "";
  } else {
    const subsWk = weekDelta(h, "yt_subs");
    $("pd-num").textContent = fmt(v.yt_subs);
    document.querySelector("#primary .big small").textContent = "SUBS";
    // "—" told you nothing. Say why there is no pace yet, or that it stalled.
    let pace;
    if (subsWk > 0) {
      const weeks = (pd.target - v.yt_subs) / subsWk;
      const eta = new Date(Date.now() + weeks * 7 * 86400000);
      pace = eta.toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase();
    } else if (subsWk != null) {
      pace = "STALLED";
    } else {
      const days = (DATA.history || []).length;
      pace = days < 2 ? `NEEDS ${2 - days} MORE DAY` : "NO DATA";
    }
    $("pd-meta").innerHTML = meta([
      ["TARGET", fmt(pd.target)],
      ["THIS WEEK", subsWk == null ? "tracking" : (subsWk >= 0 ? "+" : "") + fmt(subsWk)],
      ["AT THIS PACE", pace],
    ]);
    $("pd-deploy").innerHTML = latest.title
      ? `latest deploy · <b>${esc(latest.title)}</b> - ${fmt(latest.views)} views` : "";
  }
}
setInterval(() => { cardIdx++; renderPrimary(); }, 20000);

function vital(label, num, delta, sparkHtml, deltaCls = "", title = "") {
  return `<div class="vital" title="${esc(title || "")}">
    <div class="row1"><span>· ${label}</span><span class="delta ${deltaCls}">${delta}</span></div>
    <div class="num">${num}</div>${sparkHtml}</div>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- agent ring ---------- */
let AGENTS_LIST = [];
function layoutAgents() {
  const cx = innerWidth / 2, cy = innerHeight / 2 - 30;
  const R = Math.min(innerWidth, innerHeight) * 0.40;
  const els = document.querySelectorAll(".agent");
  els.forEach((el, i) => {
    const a = -Math.PI / 2 + (i / els.length) * Math.PI * 2;
    el.style.left = cx + Math.cos(a) * R * 1.34 + "px";
    el.style.top = cy + Math.sin(a) * R * 0.70 + "px";
  });
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
    for (const a of AGENTS_LIST) {
      const el = $("ag-" + a.id);
      if (!el) continue;
      el.classList.toggle("live", a.running || (a.id === "runner" && state !== "idle"));
      el.classList.toggle("off", a.enabled === false || (a.unmet || []).length > 0);
    }
  } catch {}
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
    addMsg("sys", `${a.label.toLowerCase()} needs config: ${a.unmet.join(", ")}`);
    return;
  }
  addMsg("sys", `running ${a.label.toLowerCase()} agent - output lands in the documents trail`);
  try {
    const r = await (await fetch("/api/agents/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: a.id }),
    })).json();
    if (r.error) addMsg("sys", `${a.label.toLowerCase()}: ${r.error}`);
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
function addMsg(cls, text) {
  const el = document.createElement("div");
  el.className = "msg " + cls; el.textContent = text;
  msgs.appendChild(el); msgs.scrollTop = msgs.scrollHeight;
  return el;
}
function setState(s) {
  state = s;
  window.__hudState = s;
  const r = document.getElementById("ag-runner");
  if (r) r.classList.toggle("live", s !== "idle");
  $("m-runner").textContent = s === "thinking" ? "WORKING" : s === "speaking" ? "SPEAKING" : s === "listening" ? "LISTENING" : "IDLE";
  $("dot-runner").className = "dot" + (s !== "idle" ? " busy" : "");
}

async function send(message) {
  if (!message.trim()) return;
  addMsg("you", message);
  $("cmd").value = "";
  setState("thinking");
  const ack = ACKS[Math.floor(Math.random() * ACKS.length)];
  addMsg("sys", ack.toLowerCase());
  if (speakOn) speak(ack, true);
  const reply = addMsg("jarvis", "");
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
        else if (ev === "delta") { acc += data.text; reply.textContent = acc; msgs.scrollTop = msgs.scrollHeight; }
        else if (ev === "tool") {
          const c = document.createElement("span");
          c.className = "toolchip"; c.textContent = data.name;
          tools.appendChild(c);
        }
        else if (ev === "done") {
          if (data.result && !acc) reply.textContent = acc = data.result;
          if (data.sessionId) { sessionId = data.sessionId; localStorage.setItem("jarvis_session", sessionId); }
        }
        else if (ev === "error") reply.textContent = acc + "\n[runner error " + data.code + "]";
      }
    }
  } catch (e) { reply.textContent = acc + "\n[link error: " + e.message + "]"; }
  loadData();
  if (speakOn && acc) speak(acc); else setState("idle");
}

$("cmd").addEventListener("keydown", (e) => { if (e.key === "Enter") send($("cmd").value); });

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
    // name the brain that is actually answering, rather than assuming one
    const label = $("brain-label");
    const active = (s.brain || {}).active;
    if (label) label.textContent = active ? active.replace("-", ".").toUpperCase() : "NO BRAIN";
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
