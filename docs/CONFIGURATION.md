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
JARVIS_TOKEN=...         # required for any non-loopback bind
JARVIS_HOST=127.0.0.1
JARVIS_PORT=4747
```

Real environment variables beat `.env`, which beats `config.json`.
