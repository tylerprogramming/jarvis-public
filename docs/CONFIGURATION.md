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
make. `working_hours` is how the morning agent knows not to suggest filming a
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

## radar

Channels watched for breakouts. A breakout is a recent upload whose views per
day exceed `breakout_multiple` times **that channel's own median** - comparing
a channel against itself surfaces an overperforming topic rather than a big
channel.

```json
{ "radar": { "channels": ["@SomeCreator"], "breakout_multiple": 3.0, "min_views": 5000, "recent_days": 7, "per_channel": 8 } }
```

Lower `breakout_multiple` to 2.0 for more signal and more noise.

## research.lanes

Topic areas the scout agent sweeps weekly. Leave empty and it infers them from
your `about` and recent titles, then tells you what it chose.

## knowledge

```json
{ "knowledge": { "brain_files": ["~/notes/playbook.md"], "context_dirs": ["~/notes/research"] } }
```

`brain_files` are read before any content advice, and agents update them when a
result confirms or contradicts a rule - this is what makes Jarvis compound
instead of restarting from zero every week. The first file is inlined into the
system prompt if it is under 4 KB.

## documents_dirs

Folders scanned for the DOCUMENTS panel; the nine most recent `.md`/`.txt`
files win. `reports/` and `drafts/` are always included. A directory containing
`report.md` is listed as a single entry.

This is also the allowlist for `/api/doc` - Jarvis will not open a file outside
these directories.

## journal

Where the `nightly` agent writes the day, and what it does with it afterwards.

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

## chat

```json
{
  "chat": {
    "cwd": "~",
    "permission_mode": "acceptEdits",
    "allowed_tools": "Read Glob Grep WebSearch WebFetch Write Edit ToolSearch Bash(yt-dlp:*) Bash(python3:*) Bash(ls:*)",
    "disallowed_tools": "",
    "model": null
  }
}
```

`cwd` is where the agent starts, so point it at the folder you actually work
in. See [SECURITY.md](SECURITY.md) before widening `allowed_tools`.

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
    "allowed_commands": ["yt-dlp", "python3", "ls", "cat", "wc", "date"],
    "denied_patterns": ["\\.ssh/", "\\.env", "credentials\\.json"]
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
— anything not listed is refused. `denied_patterns` are regexes checked against
every resolved path and refused even inside an allowed directory; omit the key
to keep the built-in secret list, or set your own to replace it.

To force one provider, set the chain to a single entry:

```json
{ "brain": { "chain": ["openai"] } }
```

## voice and stt

Ordered fallback chains. The first provider that works wins.

```json
{
  "voice": { "chain": ["kokoro", "elevenlabs", "system", "browser"] },
  "stt": { "chain": ["local", "openai", "browser"], "local": { "binary": "whisper-cli", "model_path": "~/models/ggml-base.en.bin" } }
}
```

For Kokoro, run any OpenAI-compatible speech server and point `voice.kokoro.url`
at it. For local Whisper, either set `stt.local.url` to a compatible server or
install `whisper-cli` and set `model_path`. `ffmpeg` is required for the CLI
path. Run `jarvis doctor` to see what is actually live.

## server

```json
{ "server": { "host": "127.0.0.1", "port": 4747, "token": null } }
```

`JARVIS_HOST`, `JARVIS_PORT`, and `JARVIS_TOKEN` override these. Put the token
in `.env`, not here. Non-loopback without a token refuses to start.

## agents

```json
{ "agents": { "enabled": ["morning", "radar", "postmortem", "scout", "weekly-review"] } }
```

Only enabled agents get scheduled. See [AGENTS.md](AGENTS.md).

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
