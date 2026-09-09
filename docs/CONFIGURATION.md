# Configuration

Three layers, each overriding the one before:

1. `config.default.json` - ships with the repo. Do not edit it; updates
   overwrite it.
2. `config.json` - yours. Gitignored, deep-merged over the defaults, so it only
   needs the keys you actually change.
3. Environment - `.env` or real env vars. Secrets only.

Most people never open these files: `jarvis setup` writes the first version and
the settings panel (gear button, or `cmd+,`) edits it afterwards.

Objects merge key by key. **Arrays replace wholesale** - setting
`radar.channels` gives you exactly your list, not yours appended to the default.

## name and tagline

```json
{ "name": "J.A.R.V.I.S.", "tagline": "JUST A RATHER VERY INTELLIGENT SYSTEM" }
```

What the HUD writes across the top. Two strings, no other effect; rename the
whole thing if you want it to be yours.

## directives.max

```json
{ "directives": { "max": 6 } }
```

How many entries the DIRECTIVES panel keeps. Agents are given this number as
`{{max_directives}}` and told to trim to it when they add one, so the list
stays a short set of next actions rather than a backlog nobody reads.

## profile

Who you are. This drives the persona, so vagueness here produces vague advice.

```json
{
  "profile": {
    "owner": "Your Name",
    "about": "I build AI automation tutorials and run a paid community",
    "working_hours": "weekdays 4-6pm, Sat mornings",
    "channels": { "youtube": "@handle", "instagram": "", "tiktok": "", "linkedin": "", "x": "" },
    "community": { "label": "Members", "url": "https://..." }
  }
}
```

`about` is used by the scout agent to filter topics to what you can credibly
make. `working_hours` is how the brief knows not to suggest filming a
video during your day job. A channel left blank is not drawn on the HUD.

## primary_cards

The big rotating number. `metric` is `audience` (all channels summed),
`yt_subs`, or `arr` (reads `vitals.business`). Cards cycle every 20 seconds.

```json
{ "primary_cards": [{ "label": "SUBSCRIBERS", "metric": "yt_subs", "target": 100000, "unit": "SUBS" }] }
```

## vitals.show

Which tiles are drawn: `yt_subs`, `instagram`, `tiktok`, `linkedin`, `x`,
`community`, `latest_video`, `checkin`. A tile also needs its channel
configured and its number present, so unused ones disappear on their own.

`vitals.stale_hours` (default 36): when `data/vitals.json` `updated_at` is
older than this, the primary card and the dashboard show a STALE badge with
the age, and the watchdog lists it. The collector only moves `updated_at`
when a fetch really returned data, so the badge means the numbers are old,
not that nothing ran.

## radar

Channels watched for breakouts. A breakout is a recent upload whose views per
day exceed `breakout_multiple` times **that channel's own median** - comparing
a channel against itself surfaces an overperforming topic rather than a big
channel.

```json
{ "radar": { "channels": ["@SomeCreator"], "breakout_multiple": 3.0, "min_views": 5000, "recent_days": 7, "per_channel": 8 } }
```

Lower `breakout_multiple` to 2.0 for more signal and more noise.

`radar.names` maps a channel id or handle to the label the HUD shows, for
channels whose own name is unreadable or too long for the panel:
`{"radar": {"names": {"@SomeCreator": "Some Creator"}}}`.

## research.lanes

Topic areas the scout agent sweeps weekly. Leave empty and it infers them from
your `about` and recent titles, then tells you what it chose.

## knowledge

```json
{ "knowledge": { "brain_files": ["~/notes/playbook.md"], "context_dirs": ["~/notes/research"] } }
```

`brain_files` are read before any content advice, and agents update them when a
result confirms or contradicts a rule - this is what makes Jarvis compound
instead of restarting from zero every week. The chat prompt carries a heading
index of each file (its `##` and `###` lines) rather than the body, so the
model knows what each covers and reads the section it needs.

## documents_dirs

Folders scanned for the DOCUMENTS panel; the nine most recent `.md`/`.txt`
files win. `reports/` and `drafts/` are always included. A directory containing
`report.md` is listed as a single entry.

This is also the allowlist for `/api/doc` - Jarvis will not open a file outside
these directories.

## journal

Where the `journal` agent writes the day, and what it does with it afterwards.

```json
{
  "journal": {
    "dir": "~/jarvis/journal",
    "deliver": "none",
    "to": ""
  }
}
```

One file per day, named `YYYY-MM-DD.md`. The folder is in `documents_dirs` by
default, so entries show up in the DOCUMENTS panel, and `journal/*` is
gitignored - it is a record of your business, not of the software.

`deliver` is one of three values, and the default does nothing on purpose:

| | |
|---|---|
| `none` | Write the file and stop. Nothing leaves the machine. |
| `gmail` | Create a **draft** in Gmail. You press send. |
| `resend` | Actually send the email. |

**`gmail`** needs a Gmail MCP server enabled in
[`chat.mcp_servers`](#chatmcp_servers). It creates a draft rather than sending
because the Gmail connector has no send tool — and that turns out to be the
better default anyway, since a recap you glance at before it goes anywhere is
hard to regret. If the server is not enabled the agent still writes the file
and tells you the draft was skipped.

**`resend`** genuinely sends, through [Resend](https://resend.com), using
`scripts/mail.py` and the standard library — no package to install. Two lines
in `.env`:

```
RESEND_API_KEY=re_...
JARVIS_MAIL_FROM=jarvis@yourdomain.com
```

The from address has to be on a domain you verified with Resend. That is not a
Jarvis rule; every provider works that way. Send it to yourself.

`jarvis agents check` catches the half-configured states — a `deliver` with no
`to`, an unknown method, `resend` with no key — before they turn into a recap
you assumed went out and didn't.

## notify

Chat delivery: a finished report reaches a Discord channel, a Telegram chat, a
Slack channel, an ntfy topic, or any URL that takes a JSON POST. Off by
default, and opted into per agent rather than globally.

```json
{
  "notify": {
    "channels": {
      "phone":  { "provider": "telegram" },
      "team":   { "provider": "discord" },
      "alerts": { "provider": "discord", "env": "DISCORD_WEBHOOK_URL_ALERTS" },
      "push":   { "provider": "ntfy" }
    }
  }
}
```

`channels` is a map of names you choose to a `provider`, one of `discord`,
`telegram`, `slack`, `ntfy`, `webhook`. The names are what agents refer to:
`notify: [phone]` in frontmatter, or `agents.radar.notify: ["phone"]` here.
Secrets never go in this file. Each provider reads its own variables from
`.env`:

| provider | `.env` |
|---|---|
| `discord` | `DISCORD_WEBHOOK_URL` |
| `telegram` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| `slack` | `SLACK_WEBHOOK_URL` |
| `ntfy` | `NTFY_TOPIC` (and `NTFY_URL` for a self-hosted server) |
| `webhook` | `NOTIFY_WEBHOOK_URL` |

Two targets on the same provider, say one Discord channel for the daily brief
and another for alerts, need two webhooks. The optional `env` key names the
variable the second channel reads instead of the default, so `alerts` above
reads `DISCORD_WEBHOOK_URL_ALERTS`. For a provider with two variables, `env`
can be an object: `{"TELEGRAM_CHAT_ID": "TELEGRAM_CHAT_ID_ALERTS"}`.

Delivery is a step in the runner, not an instruction in the prompt. After the
agent exits cleanly, code finds the file it wrote (the newest report or journal
entry whose `agent:` matches, written since the run began) and calls
`scripts/notify.py` once per channel. The model never chooses whether to send,
where to, or what; it cannot send twice or paste the wrong file, because it is
not involved. A failed delivery is written to `data/logs/<agent>.log` as
`notify <channel>: FAILED: <reason>` and does not change the agent's exit code.
One attempt, fifteen seconds, no retries: a retry loop on a webhook is how one
report becomes three pings.

What to send per agent is set in the agent's frontmatter or under
`agents.<name>`; see [notify in AGENTS.md](AGENTS.md#notify). To turn it on
for a shipped agent without editing its file:

```json
{
  "agents": {
    "radar":   { "notify": ["phone"] },
    "journal": { "notify": ["team"], "notify_mode": "full" }
  }
}
```

`jarvis notify` shows which channels and providers are configured without
sending. `jarvis notify test phone` really posts a one-line ping, because a
webhook that exists is not a webhook that works. `jarvis doctor` lists the
channels and the test command but never sends. `jarvis agents check` reports a
channel that is named but missing, a provider it does not know, or a variable
that is not in `.env` as a problem rather than a note: half-configured push is
worse than none, because you stop checking the file.

## chat

```json
{
  "chat": {
    "cwd": "",
    "permission_mode": "acceptEdits",
    "allowed_tools": "Read Glob Grep WebSearch WebFetch Write Edit ToolSearch Skill Bash(yt-dlp:*) Bash(python3:*) Bash(ls:*)",
    "disallowed_tools": "",
    "speak_replies": true,
    "model": null
  }
}
```

`cwd` is where the chat brain starts. Empty means the repo root, the same
place the scheduled agents run, so chat and agents read the same `CLAUDE.md`
and the same project memory. It used to default to `~`, which quietly loaded
`~/.claude/CLAUDE.md` and your personal Claude project notes into every Jarvis
reply while the agents saw none of it. Set it only if you want chat to start
somewhere else. See [SECURITY.md](SECURITY.md) before widening `allowed_tools`.

`speak_replies` (default `true`) is whether the HUD speaks an answer out loud
as well as printing it. It is sent to the browser with the rest of the config,
so turning it off in settings takes effect on the next reply.

`model` is `null` by default, meaning whichever model the `claude` CLI would
pick on its own. Set it to pin one, which is the fix when the CLI's default is
capped: chat fails, and because a cap ends the turn politely the failure gets
rendered as an answer.

## memory

What Jarvis carries from one conversation to the next, in tiers. All of it
lives under `data/` and is gitignored.

```json
{
  "memory": {
    "operator_budget": 3000,
    "recap_days": 14,
    "recap_chars": 1500,
    "chat_log": true
  }
}
```

**`data/memory.md`, the operator tier.** Facts you tell Jarvis to keep. In
chat, `remember that I only film on Tuesdays` writes exactly that line, dated,
under one of four headings (Preferences, Corrections, Decisions, Standing
rules; a few leading words pick the heading: "we decided" or "decision:" is a
decision, "never", "always" or "rule:" is a standing rule, "correction:" or
"actually" is a correction, everything else is a preference). `/forget
<words>` drops every line containing them, `/memory` prints the file. The
same three things from the terminal: `jarvis memory`, `jarvis memory add
"<text>"`, `jarvis memory forget <words>`. The MEMORY view in the HUD lists the
lines with a delete per line.

The model never writes this file. Code intercepts those commands before any
brain is spawned, so what persists is what you typed, not a paraphrase. The
whole file goes into every chat prompt and into `{{memory}}` for the `brief`,
`review` and `journal` agents, which is why `operator_budget` caps it in
characters: an append that would go past the cap is refused with the reason,
so you prune rather than the file growing until nobody reads it.

**`data/decisions.jsonl`, the recap.** One JSON line per dated decision,
experiment or result (`{date, kind, text, source}`). A `remember that we
decided ...` adds one; agents can append their own. The last `recap_days` days
are rendered into the chat prompt as RECENT DECISIONS and into
`{{recent_decisions}}`, cut to `recap_chars` from the oldest end.

**`data/chat.log`.** Every chat turn, one JSON line each, when `chat_log` is
true. **`data/session.json`** holds the Claude Code session between page
loads, so a refresh continues the conversation; the `+` in the dock head
starts a new one. `jarvis doctor` has a MEMORY section reporting all four.

## experiments

The ledger the Sunday `review` keeps in `data/decisions.jsonl` through
`scripts/experiments.py`: one line per hypothesis (`kind: experiment`, with
`id`, `metric`, `target`, `deadline`) and one per verdict (`kind: result`,
`confirmed`, `refuted` or `unmeasured`). Append only; the latest result for
an id decides its status.

```json
{
  "experiments": {
    "max_open": 2
  }
}
```

`max_open` is how many can be open at once. `add` refuses past it, so the
review must close an old experiment with evidence before it can propose the
next one. `jarvis experiments` lists them, `jarvis doctor` has an EXPERIMENTS
line (`N open, M overdue`), and the HUD's Playbook panel shows the open ones
with OVERDUE in amber when a deadline has passed. See
[AGENTS.md](AGENTS.md#experiments) for the commands and the agent steps.

## chat.mcp_servers

Which MCP servers Jarvis may call. Names exactly as `claude mcp list` shows
them, or the string `"all"`.

```json
"chat": { "mcp_servers": ["clickup", "claude.ai Gmail"] }
```

Jarvis does not connect to MCP servers itself. It inherits whatever your
`claude` CLI already has, and this key decides which of those it is allowed to
use. Default is `[]`, none, because these are the tools that send email, post
to channels, and delete records. Opt in per server.

Manage it without editing JSON:

```bash
jarvis mcp                  list servers and whether Jarvis can reach them
jarvis mcp allow clickup    turn one on
jarvis mcp deny clickup     turn it off
jarvis mcp allow all
```

Settings has checkboxes for the same thing, and `jarvis doctor` reports it.

Worth understanding the failure mode: a server that is connected but not listed
here gets rejected locally, before the request ever leaves your machine. It
looks identical to the service being down. That is why the persona is told to
say "not enabled for Jarvis yet" rather than "unreachable", and why setup
mentions your servers on first run.

## brain

Which model answers the command bar. Ordered chain, first available wins.

```json
{
  "brain": {
    "chain": ["claude-code", "openai"],
    "openai": { "base_url": "https://api.openai.com/v1", "model": "gpt-4.1" },
    "allowed_commands": ["yt-dlp", "python3", "ls", "cat", "wc", "date"]
  }
}
```

`claude-code` needs nothing configured — if the `claude` CLI is installed it is
used, with its own tools and skills. It reads `chat.*` for working directory,
permission mode, and allowed tools.

`openai` is any OpenAI-compatible `/v1/chat/completions` endpoint. Point
`base_url` at a local server (`http://127.0.0.1:11434/v1` for Ollama,
`http://127.0.0.1:1234/v1` for LM Studio) to run with no key and no cloud, or
leave it at OpenAI and set `OPENAI_API_KEY` in `.env`. `BRAIN_API_KEY`
overrides the key for third-party gateways.

Because a chat endpoint has no tools of its own, Jarvis gives this brain file
read/write/search plus `run_command`. `allowed_commands` is a binary allowlist
— anything not listed is refused.

**`brain.denied_patterns` is not in `config.default.json`.** Set it only to
override the built-in list, `DEFAULT_DENIED` in `lib/brain/tools.js`, which
refuses `.ssh/`, `.aws/`, `.gnupg/`, `.kube/`, `.docker/config`, `.netrc`,
`.npmrc`, `.pypirc`, `.git-credentials`, `.env`, `credentials.json`, `.pem`,
`.key`, `.p12`, `id_rsa`, `id_ed25519`, `Keychains/` and `.password-store/`.
They are regexes checked against every resolved path and refused even inside an
allowed directory. Setting the key **replaces** the built-in list rather than
adding to it, so include what you still want refused; leaving it unset is the
safe choice. This matters more for `openai` than for `claude-code`, because
whatever a tool reads gets sent to whichever API is serving the brain.

```json
{ "brain": { "denied_patterns": ["\\.ssh/", "\\.env", "credentials\\.json"] } }
```

To force one provider, set the chain to a single entry:

```json
{ "brain": { "chain": ["openai"] } }
```

## voice and stt

Ordered fallback chains. The first provider that works wins.

```json
{
  "voice": { "chain": ["kokoro", "elevenlabs", "piper", "system", "browser"] },
  "stt": { "chain": ["local", "openai", "browser"], "local": { "binary": "whisper-cli", "model_path": "~/models/ggml-base.en.bin" } }
}
```

For Kokoro, run any OpenAI-compatible speech server and point `voice.kokoro.url`
at it. For local Whisper, either set `stt.local.url` to a compatible server or
install `whisper-cli` and set `model_path`. `ffmpeg` is required for the CLI
path. Run `jarvis doctor` to see what is actually live.

Each provider in the voice chain has its own block, and only the one being used
is read:

```json
{
  "voice": {
    "elevenlabs": {
      "voice_id": "onwK4e9ZLuTAKqWW03F9",
      "model_id": "eleven_flash_v2_5",
      "stability": 0.45,
      "similarity_boost": 0.75
    },
    "kokoro": { "url": "http://127.0.0.1:8880/v1/audio/speech", "voice": "am_michael", "speed": 1.0 },
    "piper":   { "binary": "piper", "model": "" },
    "system":  { "voice": "Daniel", "rate": 190 }
  }
}
```

| | |
|---|---|
| `elevenlabs.voice_id` | Which ElevenLabs voice. Required; without it the provider is skipped even when the key is set. |
| `elevenlabs.model_id` | Their model. The default is their fast one, which is what keeps a spoken reply ahead of playback. |
| `elevenlabs.stability`, `.similarity_boost` | Passed through as `voice_settings`. Lower stability is more expressive and less consistent. |
| `kokoro.speed` | Playback rate sent to the speech server, `1.0` being normal. |
| `piper.binary`, `piper.model` | The `piper` executable and the path to a `.onnx` voice. Both must exist or the provider is skipped, because Piper ships no default voice. |
| `system.voice` | The named OS voice: a `say` voice on macOS, a SAPI voice on Windows. |
| `system.rate` | Words per minute for macOS `say`. On Windows the same key drives SAPI's rate, which runs -10 to 10 and is clamped to it. |

`stt.local.language` (default `en`) is passed to whisper as `-l`. Set it to the
language you actually speak; leaving it wrong is a common reason transcription
comes back as plausible nonsense. `stt.local.model` (default `small`) is only
used by the OpenAI-style `whisper` CLI, not by `whisper-cli` from whisper.cpp,
which takes a model file through `model_path` instead. `stt.local.binary`
(default `whisper-cli`) is which executable to call.

`stt.openai` is `{ "url": "https://api.openai.com/v1/audio/transcriptions",
"model": "whisper-1" }`. It is used only when `OPENAI_API_KEY` is set; point
`url` elsewhere for an API-compatible transcription server.

## social

**This one spends real money every time it runs.** The `social` agent is the
paid-scraper path for the platforms Jarvis cannot read for free, and it pays
[Apify](https://apify.com) per actor run, per platform. It is not in
`agents.enabled` by default and it has no schedule of its own; it is chained
from `brief` when you turn it on. Before enabling it, read
[agents](#agents) and expect a bill.

```json
{
  "social": {
    "actors": {
      "instagram": "apify/instagram-profile-scraper",
      "tiktok": "clockworks/tiktok-profile-scraper",
      "x": "delicious_zebu/advanced-x-twitter-profile-scraper",
      "linkedin": "harvestapi/linkedin-profile-scraper"
    },
    "post_window_days": 30,
    "max_posts_per_platform": 25
  }
}
```

`actors` pins one Apify actor per platform, and the agent is told to use exactly
these and never to substitute. That is deliberate: an agent free to search the
store every morning silently changes its own cost, its output shape, and its
reliability, with nothing in the log saying why. Swap an actor by editing this
key. When a pinned actor fails, the agent reports which one and what it said
rather than reaching for another.

`post_window_days` (30) is how far back the post sweep looks, and
`max_posts_per_platform` (25) caps how many it pulls per platform. Both exist to
keep the cost of a run predictable; lower them to spend less. The agent appends
what each run cost to `data/spend.log`, so the spend does not stay invisible.

The agent needs both an Apify MCP server listed in
[`chat.mcp_servers`](#chatmcp_servers) and at least one non-YouTube handle in
`profile.channels`; without either it skips with the reason rather than running
against nothing. See [requires](AGENTS.md#requires).


## server

```json
{ "server": { "host": "127.0.0.1", "port": 4747, "token": null } }
```

`JARVIS_HOST`, `JARVIS_PORT`, and `JARVIS_TOKEN` override these. Put the token
in `.env`, not here. Non-loopback without a token refuses to start.

## agents

```json
{ "agents": { "enabled": ["brief", "radar", "scout", "review"] } }
```

Only enabled agents get scheduled. See [AGENTS.md](AGENTS.md).

`agents.timeout_minutes` (default 45): the ceiling on one `claude` run. Past
it the process is killed, the run is recorded in `data/runs.json` with exit
124 and the error `timed out after N min`, and `jarvis agent <name>` exits
124. Without a ceiling a run that hung on a dropped connection sat until the
next scheduled fire started a second copy on top of it.

`agents.<name>.notify` also applies to `watchdog`: `{ "agents": { "watchdog":
{ "notify": ["phone"] } } }` sends its report, which it only writes when some
agent failed, is overdue, is not loaded, or wrote nothing. A quiet day sends
nothing.

`agents.dir` (default `agents`) is where the agent files are read from,
resolved against the repo root, so `../my-agents` keeps your own outside the
clone where `git pull` will not touch them.

## calendar.week_plan

The weekly content grid, keyed `"0"` (Monday) through `"6"`. Values are slot
labels of your choosing; `long` and `short` auto-tick from your actual YouTube
uploads, and agents reconcile the rest.

```json
{ "calendar": { "week_plan": { "0": ["long", "li"], "1": ["short"], "3": ["long"] } } }
```

Set `calendar.enabled` to `false` to hide the strip.

## Environment (.env)

```bash
ELEVENLABS_API_KEY=...   # premium voice
OPENAI_API_KEY=...       # hosted Whisper, only if you want it
KOKORO_API_KEY=...       # only if your local server requires one
RESEND_API_KEY=...       # only for journal.deliver = resend
JARVIS_MAIL_FROM=...     # the from address, on a domain verified with Resend
DISCORD_WEBHOOK_URL=...  # notify channels, one or two lines per provider;
TELEGRAM_BOT_TOKEN=...   # see .env.example for the full list
TELEGRAM_CHAT_ID=...
NTFY_TOPIC=...
JARVIS_TOKEN=...         # required for any non-loopback bind
JARVIS_HOST=127.0.0.1
JARVIS_PORT=4747
```

Real environment variables beat `.env`, which beats `config.json`.

## Indexes and Obsidian

`jarvis index` writes an `index.md` into every documents folder: each document
with its title, date, and first line, plus links to subfolders. It runs
automatically after every agent run, so reports stay listed as they land.

Agents and chat are told to read the index first and open what they need. Grep
still works, but it costs more per lookup and gets less accurate as a folder
fills up — an index is a fixed small read that gets *better* as it grows.

Titles come from YAML frontmatter `title:` if present, otherwise the first `#`
heading, otherwise the filename. Dates come from frontmatter `date:`, then a
`YYYY-MM-DD` in the filename, then the file's mtime.

The files are plain markdown with relative links, so **pointing Obsidian at this
folder turns it into a vault** with no migration: the indexes read as ordinary
notes, and the graph view picks up the links. Nothing here depends on Obsidian
being installed.

Index specific folders instead of the configured ones:

```bash
jarvis index ~/notes ~/some/other/folder
```

## transcript

`jarvis transcript <url-or-id>` returns a transcript, cheapest path first:

1. manual captions (human-written)
2. auto-captions (YouTube's ASR — free, about a second)
3. local Whisper on the extracted audio (`whisper-cli` + `stt.local.model_path`)
4. OpenAI Whisper, only if `OPENAI_API_KEY` is set

Steps 3 and 4 only run when a video has no captions at all. The video itself is
never downloaded — captions are a few KB, and the fallback pulls audio only.

```bash
jarvis transcript dQw4w9WgXcQ --out notes/transcript.txt
jarvis transcript <url> --force-asr   # skip captions, transcribe the audio
```

For local Whisper: `brew install whisper-cpp`, download a `ggml-*.bin` model,
and set `stt.local.model_path` to it. That same setup powers the microphone.

## Running Kokoro

```bash
jarvis voice install [--docker|--native]
jarvis voice start | stop | status
```

Two ways to run the same thing:

| | Size | Notes |
|---|---|---|
| Docker | ~1.5GB image | `ghcr.io/remsky/kokoro-fastapi-cpu`. Upstream's own build. |
| Native | ~200MB venv + 337MB model | `kokoro-onnx` on onnxruntime, no PyTorch. Served by `scripts/kokoro_server.py`. |

With no flag, the installer uses Docker when the daemon is reachable and falls
back to native otherwise. The choice is remembered in `data/.kokoro-mode`, so
`start` and `stop` do the right thing afterwards.

Both expose `POST /v1/audio/speech` and `GET /v1/models` on port 8880, which is
what `voice.kokoro.url` points at by default. Jarvis reads the response's
`Content-Type`, so it does not matter that the Docker build returns mp3 while
the native server returns wav.

Change the voice with `voice.kokoro.voice` (default `am_michael`); the model
ships 54 of them. Set `KOKORO_PORT` to move it off 8880.
