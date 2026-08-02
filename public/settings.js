/* Settings panel. Everything here writes config.json through /api/config, so
 * a new user never has to open a JSON file. Secrets are deliberately not
 * editable from the browser - the server rejects them and points at .env.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const panel = document.createElement("div");
  panel.id = "settings";
  panel.innerHTML = `<div class="sinner"><div class="shead">
      <h3>SETTINGS</h3><button id="s-close" title="close">✕</button></div>
      <div id="s-body">loading...</div></div>`;
  document.body.appendChild(panel);
  panel.onclick = (e) => { if (e.target === panel) close(); };
  $("s-close").onclick = close;

  function close() { panel.classList.remove("open"); }

  const field = (id, label, value, hint = "") => `
    <label class="sfield"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</span>
    <input id="${id}" value="${esc(value)}"></label>`;

  const yesno = (b) => `<span class="pill ${b ? "on" : "off"}">${b ? "ready" : "off"}</span>`;

  async function open() {
    panel.classList.add("open");
    const [cfg, status, agents] = await Promise.all([
      fetch("/api/config").then((r) => r.json()),
      fetch("/api/status").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json()),
    ]);
    const e = cfg.effective;
    const ch = e.profile.channels || {};
    const cards = e.primary_cards || [];

    $("s-body").innerHTML = `
      <section><h4>IDENTITY</h4>
        ${field("s-name", "HUD name", e.name)}
        ${field("s-owner", "Your name", e.profile.owner)}
        ${field("s-about", "What you do", e.profile.about, "used for topic picks")}
        ${field("s-hours", "Working windows", e.profile.working_hours, "when you can actually do the work")}
      </section>

      <section><h4>CHANNELS</h4>
        ${field("s-yt", "YouTube", ch.youtube, "@handle - drives most of the HUD")}
        ${field("s-ig", "Instagram", ch.instagram)}
        ${field("s-tt", "TikTok", ch.tiktok)}
        ${field("s-li", "LinkedIn", ch.linkedin)}
        ${field("s-x", "X", ch.x)}
      </section>

      <section><h4>TARGETS</h4>
        ${cards.map((c, i) => field(`s-target-${i}`, c.label, c.target)).join("")}
      </section>

      <section><h4>RESEARCH</h4>
        ${field("s-radar", "Radar channels", (e.radar.channels || []).join(", "), "comma separated, watched for breakouts")}
        ${field("s-lanes", "Scout lanes", ((e.research || {}).lanes || []).join(", "), "comma separated topics")}
        ${field("s-brain", "Playbook files", (e.knowledge.brain_files || []).join(", "), "paths agents read before advising")}
      </section>

      <section><h4>AGENTS</h4>
        <div class="sagents">${agents.agents.filter((a) => a.id !== "runner").map((a) => `
          <label class="scheck">
            <input type="checkbox" data-agent="${esc(a.id)}" ${a.enabled ? "checked" : ""}>
            <b>${esc(a.label)}</b> <small>${esc(a.tag)}</small>
            <div class="sdesc">${esc(a.description || "")}</div>
            ${(a.unmet || []).length ? `<div class="swarn">needs ${esc(a.unmet.join(", "))}</div>` : ""}
          </label>`).join("")}</div>
        <div class="snote">Schedules apply after running <code>jarvis agents install</code>.</div>
      </section>

      <section><h4>BRAIN</h4>
        <div class="srow">
          <span>claude code ${yesno(status.brain.providers["claude-code"])}</span>
          <span>openai-compatible ${yesno(status.brain.providers.openai)}</span>
          <span>active: <b>${esc(status.brain.active || "none")}</b></span>
        </div>
        ${field("s-brain-url", "OpenAI-compatible base URL", (e.brain.openai || {}).base_url, "any /v1 endpoint: OpenAI, Ollama, LM Studio, OpenRouter")}
        ${field("s-brain-model", "Model", (e.brain.openai || {}).model)}
        <div class="snote">Claude Code is used when installed; it brings its own tools and is
        the better option. The OpenAI path needs <code>OPENAI_API_KEY</code> in <code>.env</code>,
        or no key at all if the base URL is a local server.</div>
      </section>

      <section><h4>VOICE OUT</h4>
        <div class="srow">${["elevenlabs", "kokoro", "piper", "system", "browser"]
          .map((k) => `<span>${k} ${yesno(status.voice[k])}</span>`).join("")}</div>
        <div class="snote">First ready provider in the chain wins. Kokoro and Piper are
        free and local. ElevenLabs needs <code>ELEVENLABS_API_KEY</code> in <code>.env</code>.</div>
      </section>

      <section><h4>VOICE IN</h4>
        <div class="srow">
          <span>local whisper ${yesno(status.stt.local)}</span>
          <span>openai ${yesno(status.stt.openai)}</span>
          <span>ffmpeg ${yesno(status.stt.ffmpeg)}</span>
        </div>
        <div class="snote">${status.stt_server_side
          ? "Your audio is transcribed by the server."
          : "Falling back to the browser, which sends audio to Google. Install whisper.cpp or add an OpenAI key to keep it local."}</div>
      </section>

      <div class="sactions">
        <button id="s-save">SAVE</button>
        <span id="s-msg"></span>
      </div>`;

    $("s-save").onclick = () => save(cards);
  }

  const listVal = (id) => $(id).value.split(",").map((s) => s.trim()).filter(Boolean);

  async function save(cards) {
    const patch = {
      name: $("s-name").value,
      profile: {
        owner: $("s-owner").value,
        about: $("s-about").value,
        working_hours: $("s-hours").value,
        channels: {
          youtube: $("s-yt").value,
          instagram: $("s-ig").value,
          tiktok: $("s-tt").value,
          linkedin: $("s-li").value,
          x: $("s-x").value,
        },
      },
      primary_cards: cards.map((c, i) => ({
        ...c,
        target: Number($(`s-target-${i}`).value) || c.target,
      })),
      radar: { channels: listVal("s-radar") },
      research: { lanes: listVal("s-lanes") },
      brain: { openai: { base_url: $("s-brain-url").value, model: $("s-brain-model").value } },
      knowledge: { brain_files: listVal("s-brain") },
      agents: {
        enabled: [...document.querySelectorAll("[data-agent]")]
          .filter((el) => el.checked)
          .map((el) => el.dataset.agent),
      },
    };

    const msg = $("s-msg");
    msg.textContent = "saving...";
    const r = await (await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch }),
    })).json();
    if (r.error) { msg.textContent = r.error; return; }
    msg.textContent = "saved - restart Jarvis to apply";
    if (window.loadData) window.loadData();
  }

  const btn = document.getElementById("settings-btn");
  if (btn) btn.onclick = open;
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (e.key === "," && e.metaKey) { e.preventDefault(); open(); }
  });
})();
