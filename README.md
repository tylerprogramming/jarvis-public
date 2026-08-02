# J.A.R.V.I.S.

A self-hosted operations HUD for people who run something on their own.

Most "Jarvis" projects are a voice chatbot with a glowing orb. This one is
wired to your actual numbers. It watches your channels, runs agents on a
schedule that write their own reports, and puts a command bar in front of a
real coding agent so you can ask it to go do the work.

Zero npm dependencies. Runs on your machine. Your data never leaves it unless
you hand it a key that makes it leave.

```
┌─ SYSTEM VITALS ──────┐                              ┌─ COMMS ─────────────┐
│  Subscribers  23,600 │         ●  MORNING           │ you: what should I  │
│  ▲ 240/wk  ╱‾╲╱‾     │      ●        ●  RADAR       │      film today?    │
│  ┌──────┬──────┐     │   ●    ( brain )   ●         │ jarvis: your last   │
│  │ IG   │ TT   │     │      ●        ●              │  three showcase     │
│  └──────┴──────┘     │         ●  SCOUT             │  videos beat the    │
├─ DIRECTIVES ─────────┤                              │  tutorials 3 to 1.  │
│ ☐ Film the agent one │   PRIMARY DIRECTIVE          │  Film the agent one.│
└──────────────────────┘   23,600 SUBS                └─────────────────────┘
```

## What it actually does

**Live vitals.** Subscriber count, recent video traction, and follower counts
across your channels, pulled with `yt-dlp` - no API key, no OAuth, no Google
Cloud project. Sparklines come from a daily snapshot it keeps itself.

**Agents that run themselves.** Each one is a markdown file with a cron
schedule. They wake up, do research, and leave a report in the documents trail.

| Agent | When | What it does |
|---|---|---|
| `morning` | daily 07:00 | Refresh the numbers, write a status report, reset your top 3 |
| `radar` | daily 06:30 | Sweep channels you watch, flag videos breaking out against their own baseline |
| `postmortem` | daily 08:00 | Review each video at 48h and 7d, turn the result into a rule |
| `scout` | Fri 15:00 | Search what is actually pulling right now, hand back two topics with evidence |
| `study` | Wed 16:00 | Reads the transcripts of the strongest videos in your lanes and writes down what's reusable |
| `weekly-review` | Sun 18:00 | What shipped, what moved, and one experiment for next week |

**A command bar with hands.** Type or talk, and it goes to a real agent with
your context loaded — it reads your files, edits your data, runs your tools.
[Claude Code](https://claude.com/claude-code) is the default and the best
option; if you don't have it, any OpenAI-compatible endpoint works instead,
including a local model. Voice in and voice out both work for free.

**It draws its own conclusions.** A number on a dashboard is not insight. The
agents compare, judge, and write down what they learned, so next week starts
ahead of this week.

## Install

You need [Node 18+](https://nodejs.org), [Claude Code](https://claude.com/claude-code),
and [yt-dlp](https://github.com/yt-dlp/yt-dlp) (`pipx install yt-dlp`).

```bash
git clone <your-fork> jarvis && cd jarvis
npm run setup      # asks who you are, writes config.json
npm start          # http://localhost:4747
```

That is the whole install. There is nothing to build and nothing to npm install.

```bash
jarvis doctor              # what is wired up and what is missing
jarvis agents              # list agents and schedules
jarvis agent morning       # run one right now instead of waiting for 7am
jarvis agents install      # put them on launchd (macOS) or cron (Linux)
jarvis transcript <url>    # transcript of any YouTube video
jarvis index               # rebuild the index.md in every documents folder
```

## Transcripts cost nothing

Most YouTube videos already have captions. `jarvis transcript` grabs those —
about a second, no model involved, no tokens. It never downloads the video.
Only when a video genuinely has no captions does it fall back to pulling the
audio stream and running **local Whisper**, or OpenAI's if you've set a key.

```
captions → auto-captions → local whisper → openai whisper
```

That's what the `study` agent runs on, which is why it can read three full
videos a week for free.

## Notes, indexes, and Obsidian

Every documents folder gets an `index.md` listing what's in it with dates and
one-line summaries, rebuilt after each agent run. Agents are told to read the
index and open what they need rather than grepping the tree — grep costs more
and gets *less* accurate as folders grow, which is exactly backwards.

Because it's all plain markdown in ordinary folders, **you can point
[Obsidian](https://obsidian.md) at this directory and it becomes a vault** —
graph view, backlinks, search, no migration and no lock-in. The indexes work
the same whether Obsidian is ever installed or not.

## The brain

The command bar needs a model with tools behind it. Jarvis walks a chain and
uses the first that works:

| Provider | Cost | Notes |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | your existing subscription | **Default.** Brings its own tools, sessions, and any skills you've installed. Nothing to configure. |
| OpenAI-compatible | your key, or free locally | Any `/v1/chat/completions` endpoint. Set `OPENAI_API_KEY`, or point `brain.openai.base_url` at [Ollama](https://ollama.com) / LM Studio / llama.cpp and run with no key and no cloud. |

A raw chat endpoint has no tools of its own, so Jarvis supplies them: file
read, write, search, directory listing, and an allowlisted shell. That's what
lets an OpenAI-backed Jarvis actually open `vitals.json` and edit a directive
rather than just talk about them.

Those tools are bounded twice — paths must resolve inside your working
directory or the Jarvis folder, and `brain.denied_patterns` refuses secrets
(`.ssh/`, `.env`, `credentials.json`, private keys) even inside it. Worth
reading [docs/SECURITY.md](docs/SECURITY.md) before pointing it at a hosted
API, since whatever a tool reads gets sent there.

## Voice

Jarvis talks out of the box with no account anywhere. It walks a chain and uses
the first thing that works:

| Provider | Cost | Notes |
|---|---|---|
| [ElevenLabs](https://elevenlabs.io) | paid | Best quality. Set `ELEVENLABS_API_KEY` in `.env`. |
| [Kokoro](https://github.com/hexgrad/kokoro) | free, local | **Default.** `jarvis voice install` sets it up either way — Docker if you have it, native if you don't. |
| [Piper](https://github.com/rhasspy/piper) | free, local | MIT, 900+ voices, fast on small hardware. |
| system | free | macOS `say` / Linux `espeak-ng`. Robotic but always there. |
| browser | free | `speechSynthesis`. The last resort. |

Listening works the same way. **Local [Whisper](https://github.com/ggerganov/whisper.cpp)
is the default** so your audio stays on your machine. OpenAI's Whisper endpoint
is used only if you supply `OPENAI_API_KEY`. If neither exists it falls back to
the browser's speech recognition, which is Chrome-only and uploads your audio to
Google - `jarvis doctor` tells you which one you are on.

### Installing Kokoro

```bash
jarvis voice install     # picks Docker if present, native otherwise
jarvis voice start
```

Upstream Kokoro runs via Docker, which is one command if you already have it and
a large detour if you don't. The native path avoids it: `kokoro-onnx` uses
onnxruntime rather than PyTorch, so it's ~200MB of wheels plus a 337MB model
instead of a multi-gigabyte CUDA stack. Both serve the same
`/v1/audio/speech` endpoint, so nothing else in Jarvis changes.

Force one or the other with `--docker` / `--native`. Once it's running Jarvis
uses it automatically, since Kokoro is first in the chain. `jarvis voice stop`
falls back to whatever is next.

Measured on an M-series Mac: about 1.2 seconds to generate 4.8 seconds of
speech, so it stays ahead of playback.

Press `W` to arm the wake word, then say "jarvis, ..." hands free.

## Making it yours

Open settings with the gear button (or `cmd+,`) - name, channels, targets,
watched channels, research lanes, and which agents run. No JSON editing.

Everything lives in `config.json`, which is gitignored and deep-merged over
`config.default.json`, so pulling an update never touches your setup. See
`config.example.json` for the full surface and
[docs/CONFIGURATION.md](docs/CONFIGURATION.md) for what each key does.

**Teach it your own commands.** Create `PERSONA.md` in the project root and
write instructions in plain English. It is appended to the system prompt on
every turn, so "when I say `ship it`, do X" just works. Also gitignored.

**Write your own agent.** Drop a markdown file in `agents/`:

```markdown
---
name: inbox
label: INBOX
schedule: "0 9 * * 1"
tools: Read Write WebSearch
---
Check X for {{owner}} and write a summary to {{reports}}/{{today}}-inbox.md.
```

Add `inbox` to `agents.enabled`, run `jarvis agents install`, done. Placeholders
come from your config - see [docs/AGENTS.md](docs/AGENTS.md).

**Wire in a platform Jarvis has never heard of.** Anything in
`plugins/collectors/` runs on every refresh and merges its JSON into your
vitals. Twelve lines gets a new number onto the dashboard, and the folder is
gitignored so your private integrations stay private.

## Security

`/api/chat` runs a coding agent with write access to your machine. Jarvis binds
to `127.0.0.1` and **refuses to start on a public interface without a token**.
If you want it on your iPad on the couch, read
[docs/SECURITY.md](docs/SECURITY.md) first - it takes one line.

Secrets go in `.env`, never in `config.json`. The settings endpoint rejects
anything that looks like a credential.

## License

Public domain ([Unlicense](LICENSE)). No copyright, no attribution required, no
conditions. Copy it, sell it, rename it, strip every trace of where it came
from. It is yours.
