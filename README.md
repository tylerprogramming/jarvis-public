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
| `social` | daily 06:00 | Follower counts for your other platforms, via Apify. Off by default, needs a paid scraper |
| `nightly` | daily 20:00 | Closes out the day into `journal/` — what ran, what moved, what didn't. Can mail you the recap |

**A journal it keeps for you.** At the end of the day the `nightly` agent reads
its own agent logs, the reports written that day, and the numbers, then writes
one dated entry in `journal/`. Not a summary of your plans — a record of what
the evidence says happened, including the days nothing did. A week of those is
what makes Sunday's review honest. It can also drop the recap in your inbox;
see [journal](docs/CONFIGURATION.md#journal).

**A command bar with hands.** Type or talk, and it goes to a real agent with
your context loaded — it reads your files, edits your data, runs your tools.
[Claude Code](https://claude.com/claude-code) is the default and the best
option; if you don't have it, any OpenAI-compatible endpoint works instead,
including a local model. Voice in and voice out both work for free.

**It draws its own conclusions.** A number on a dashboard is not insight. The
agents compare, judge, and write down what they learned, so next week starts
ahead of this week.

## Install

**You need:** [Node 18+](https://nodejs.org) and `python3` (macOS and most
Linux ship it). Everything else the setup will offer to handle.

**You want:** [Claude Code](https://claude.com/claude-code). It is the default
brain and the best one. Without it, Jarvis runs on any OpenAI-compatible
endpoint instead, including a local model, so it is not a hard requirement.

### 1. Clone it

```bash
git clone <this-repo> jarvis && cd jarvis
```

There is nothing to build and nothing to `npm install`. Zero dependencies.

### 2. Run setup

```bash
npm run setup
```

It asks who you are, which channels to track, what number you care about, which
channels to watch, and which agents to turn on. Every question has a usable
default and you can change all of it later.

If `yt-dlp` is missing it offers to install a self-contained copy for you, so
you do not need brew, pip, or a particular python version. At the end it pulls
your real numbers so the dashboard is not empty on first open.

### 3. Check it

```bash
jarvis doctor
```

This is the honest inventory: which brain answers, whether yt-dlp can actually
*fetch* rather than merely exist, which voice providers are live, and whether
your microphone audio stays on this machine. Fix anything it flags before
moving on.

### 4. Open it

```bash
npm start          # http://localhost:4747
```

Type in the command bar, or press the mic and talk. Ask it "what can you do?"
and it will tell you, based on what you actually turned on.

### 5. Put the agents on a schedule

```bash
jarvis agents check     # would each one work? does it have what it needs?
jarvis agents install   # launchd on macOS, cron on Linux
```

`check` runs first for a reason. It catches agents that will silently skip
because a requirement is missing, before you rely on them running at 7am.

That is the whole install. Steps 6 and 7 are optional.

### 6. Free local voice (optional)

```bash
jarvis voice install    # Docker if you have it, native if you do not
jarvis voice start
```

### 7. Keep your microphone off the internet (optional)

Without this, speech recognition falls back to the browser, which is
Chrome-only and uploads your audio to Google. `jarvis doctor` tells you which
one you are on.

```bash
brew install whisper-cpp        # or your distro's package
curl -L -o ~/models/ggml-base.en.bin --create-dirs \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

Then point `stt.local.model_path` at that file, in `config.json` or the
settings panel.

### Will the agents actually run at those times

Only if the machine is awake. Neither launchd nor cron wakes a sleeping
computer, and nothing runs during sleep because the CPU is halted. Power Nap
does not change this: it wakes briefly for a few Apple services, not for your
jobs.

What happens when it is asleep differs by platform, and the difference matters:

- **macOS** replays what it missed once it wakes, spread over a few hours. You
  still get the day's data, just late.
- **Linux cron** skips a missed job permanently. That day is simply gone.

`jarvis doctor` reports which situation you are in rather than letting you find
out days later, and `jarvis agents install` says it at the moment you set the
schedules. Three ways to fix it:

```bash
sudo pmset repeat wakeorpoweron MTWRFSU 05:55:00   # wake just before the run
sudo pmset -a sleep 0                              # or never sleep at all
```

Or run Jarvis on something that is always on. It is Node 18+ with zero
dependencies plus python3, so any small VPS works. Two cautions if you do:
the Claude Code brain needs the `claude` CLI authenticated on that machine, or
point `brain.openai` at an API endpoint instead; and do not expose the HUD to
the internet, because `/api/chat` reaches a brain that reads files and runs
commands. Put it behind a VPN or an SSH tunnel. See
[docs/SECURITY.md](docs/SECURITY.md).

### If the mic will not start

The HUD tells you which of the five ways it failed, because they need different
fixes and only one of them is a permission:

| What it says | What is actually wrong |
|---|---|
| no microphone found | Nothing is plugged in. A Mac Studio and most desktops have no built-in mic. |
| microphone blocked | Allow it for the site in your browser, and check System Settings > Privacy & Security > Microphone. |
| something else is holding it | Another app has the device open. Close it. |
| refused on this origin | You opened a LAN address. Use localhost or 127.0.0.1. |

`jarvis doctor` reports whether a capture device exists at all, separately from
whether Whisper is ready, because the whole chain can be green on a machine that
cannot record a single sample.

### Day to day

```bash
jarvis doctor              # what is wired up and what is missing
jarvis agents              # list agents, schedules, last run
jarvis agent morning       # run one now instead of waiting for 7am
jarvis transcript <url>    # transcript of any YouTube video
jarvis index               # rebuild index.md in every documents folder
jarvis ytdlp status        # is yt-dlp current and can it fetch
jarvis mcp                 # which MCP servers Jarvis is allowed to call
```

## Post-level data, and your own breakouts

`data/posts.json` is one list of posts across every platform. YouTube fills it
for free through yt-dlp, so this works with no keys and no scraper. The optional
`social` agent adds Instagram, TikTok, and X if you pay for Apify, and anything
else can write to it from `plugins/collectors/` or an official API with a key
you hold. Everything downstream reads the store rather than the collector, so
missing a source costs you that platform, not the feature.

Two things read it today. Radar now flags **your own** posts that are outrunning
your own normal, not just the channels you watch. And the postmortem can ask
whether a topic that underperformed on one platform did well on another, which
is the question a single-platform review cannot reach.

The comparison is deliberately careful. Lifetime views over age always flatters
a new post, because a mature post's average is dragged down by its own long
tail, so each post carries a daily reading and a breakout is measured against
where your other posts stood at the **same age**. When there is not enough
history yet it falls back to the cruder lifetime average and labels itself
`method: lifetime`, so a weak comparison never gets mistaken for a strong one.
Platforms with fewer than four mature posts are skipped rather than guessed at.

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

**Pick a look.** The contrast button in the command bar opens the theme picker.
Eight ship: Reactor (the original blue), Nebula, Ember, Nord, Mocha, Tokyo
Night, Gruvbox, and Daylight, which is the light one for working near a window.
Four use their upstream projects' published palettes, so they match the editor
theme you probably already run.

A theme is more than colour. It also sets the chrome, meaning how panels are
built rather than what shade they are: `glass` is blurred with sharp corners,
`soft` is rounded with a heavier blur, `flat` has no blur at all and goes fully
opaque. Gruvbox on flat reads as a different program to Tokyo Night on soft.

Adding your own is one entry in `THEMES` at the top of `public/app.js`. Copy the
nearest one, change the tokens, pick a chrome and a brain mode. The stylesheet
holds no colour literals at all, every one is a token, so a theme really does
control the whole interface.

**Use the MCP servers you already have.** If your `claude` CLI is connected to
anything (ClickUp, Slack, Gmail, Notion, your own server), Jarvis inherits those
connections. It will not call them until you allow it, because these are the
tools that send email and post publicly.

```bash
jarvis mcp                  what you have, and what Jarvis can reach
jarvis mcp allow clickup    turn one on
jarvis mcp allow all        turn on everything
```

There are checkboxes for the same thing in settings, and `jarvis doctor` lists
them. This is worth knowing because of how the failure looks: a server that is
connected but not allowed gets rejected locally, before the request leaves your
machine, so it reads as the service being down when nothing is wrong with it.
Jarvis is told to say "not enabled yet" rather than "unreachable" for exactly
this reason.

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
