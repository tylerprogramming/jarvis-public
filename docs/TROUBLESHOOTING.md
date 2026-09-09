# Troubleshooting

Organised by symptom. Find what you are looking at, read what it means, then do
the fix. If nothing here matches, `jarvis doctor` is the honest inventory of
what is actually wired up on this machine, end to end.

## Install and runtimes

### `node: command not found`

**What it means.** macOS does not ship Node. Cloning the repo does not install
it either. Nothing in Jarvis runs without it.

**What to do.** `brew install node`, or download the macOS **LTS** installer
from [nodejs.org](https://nodejs.org) and open a new terminal so `PATH` picks
it up. `npm: command not found` is the same problem with the same fix, because
npm is bundled with Node.

On Windows: `winget install OpenJS.NodeJS.LTS`, or the installer from
nodejs.org, then a new terminal.

### Node is installed, but Jarvis dies with a syntax error

**What it means.** Your Node is older than 18. On Ubuntu 22.04 and Debian 11,
`apt install nodejs` still installs Node 12, so the install succeeds and the
failure looks like a bug in the code. Ubuntu 24.04 and Debian 12 ship 18 and
are fine.

**What to do.** Check first, then replace it:

```bash
sudo apt install nodejs npm && node --version    # 18 or higher?
```

```bash
# NodeSource - system-wide, survives reboots, good for a server
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# or nvm - per-user, no sudo, easy to switch versions
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install --lts
```

`bin/jarvis` checks the version before it requires anything else and prints
this same advice, so an old Node reaches a message rather than a stack trace.

### `jarvis: command not found`

**What it means.** Setup offers to link `bin/jarvis` into your npm global bin,
and you skipped it, or the link went somewhere not on `PATH`.

**What to do.** `node bin/jarvis ...` from the repo root does the same thing
everywhere, and `npm run doctor`, `npm run agents` and `npm start` are wired up
too. To get the short form back, re-run `node bin/jarvis setup` and accept the
PATH offer.

## The dashboard

### The numbers are all zero or blank

**What it means.** `yt-dlp` could not fetch. A copy on `PATH` that answers
`--version` is not enough: a stale build answers perfectly and then fails every
real request, which is why `jarvis doctor` fetches rather than asking.

**What to do.**

```bash
jarvis ytdlp status     # is it current, and can it actually fetch
jarvis ytdlp install    # bundle a known-good copy in bin/, no brew, no pip
```

A blank handle is the other cause: a channel left empty in `profile.channels`
is not drawn at all.

### The numbers have a STALE badge

**What it means.** `data/vitals.json` has an `updated_at` older than
`vitals.stale_hours` (default 36). The collector only moves that timestamp when
a fetch really returned data, so the badge means the numbers are old, not that
nothing ran.

**What to do.** `jarvis collect --fetch` to refresh by hand, then look at
whether the agent that normally does it is failing, under
[the agents did not run](#the-agents-did-not-run-at-the-time-i-set).

### An agent shows FAILED, OVERDUE, STALE or NOT LOADED

**What it means.** Each of those is a distinct verdict computed from the run
ledger in `data/runs.json`, not guessed from a log timestamp. They are defined
in [AGENTS.md](AGENTS.md#the-run-ledger).

**What to do.** Hover the badge in the HUD for the reason, or run
`jarvis agents`, which prints the same detail per line. `jarvis doctor` adds
whether the OS job is loaded and when the agent should have run.

## Chat

### Chat answers with something strange, then shows an error

**What it means.** The brain failed and the failure text is being rendered as
Jarvis's answer. A usage cap, an expired login and an overloaded server all end
the turn politely, so the text reads like a reply.

**What to do.** `jarvis doctor` runs a real turn and reports it under BRAIN as
`answers`, with the classified reason. For an expired login,
`claude auth login --claudeai`. For a cap on the CLI's default model, pin a
model that works as `chat.model` in `config.json`.

### Chat says a connected MCP server is unreachable

**What it means.** Almost always the opposite: the server is connected to your
`claude` CLI but not listed in `chat.mcp_servers`, so Jarvis rejects the call
locally, before the request leaves your machine. It looks identical to an
outage.

**What to do.** `jarvis mcp` shows what you have and whether Jarvis can reach
it; `jarvis mcp allow <name>` turns one on. Default is none on purpose, because
these are the tools that send email and post publicly. See
[chat.mcp_servers](CONFIGURATION.md#chatmcp_servers).

## The microphone

### The mic will not start

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

### My voice is being transcribed by Google

**What it means.** Speech recognition fell through to the browser, which is
Chrome-only and uploads your audio. That is the last resort in the chain, used
when neither local Whisper nor an OpenAI key is available. `jarvis doctor` says
which one you are on under VOICE IN.

**What to do.** Install local Whisper and point
[`stt.local.model_path`](CONFIGURATION.md#voice-and-stt) at a model:

```bash
brew install whisper-cpp        # or your distro's package
curl -L -o ~/models/ggml-base.en.bin --create-dirs \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

`ffmpeg` is required for the CLI path.

## Scheduling

### The agents did not run at the time I set

**What it means.** Most likely the machine was asleep. Neither launchd nor cron
wakes a sleeping computer, and nothing runs during sleep because the CPU is
halted. Power Nap does not change this: it wakes briefly for a few Apple
services, not for your jobs.

What happens afterwards differs by platform, and the difference matters:

- **macOS** replays what it missed once it wakes, spread over a few hours. You
  still get the day's data, just late.
- **Linux cron** skips a missed job permanently. That day is simply gone.

**What to do.** `jarvis doctor` reports which situation you are in rather than
letting you find out days later, and `jarvis agents install` says it at the
moment you set the schedules. Three fixes:

```bash
sudo pmset repeat wakeorpoweron MTWRFSU 05:55:00   # wake just before the run
sudo pmset -a sleep 0                              # or never sleep at all
```

Or run Jarvis on something that is always on. It is Node 18+ with zero
dependencies plus python3, so any small VPS works. Two cautions if you do: the
Claude Code brain needs the `claude` CLI authenticated on that machine, or
point `brain.openai` at an API endpoint instead; and do not expose the HUD to
the internet, because `/api/chat` reaches a brain that reads files and runs
commands. Put it behind a VPN or an SSH tunnel. See
[SECURITY.md](SECURITY.md).

### Every agent ran, but hours off the time I set

**What it means.** launchd caches the timezone at boot. If the machine's zone
was changed after it started, every job fires in the old zone until it is
restarted. This is a real bug from this repo's history: it went unnoticed for
two weeks because reading the config said everything was correct.

**What to do.** `jarvis doctor` reads the run history rather than the config
and reports the observed offset, requiring it across two agents so one manual
run cannot fake it. Restart the machine to clear the cached zone.

### An agent shows NOT LOADED right after `agents install`

**What it means.** The OS job is missing, or on macOS the plist points at a
`node` binary that no longer exists. A Homebrew upgrade that moves the Node
path does exactly this.

**What to do.** `jarvis agents install` again to rewrite the jobs with the
current path, then `jarvis doctor` to confirm `loaded yes`.

### The `social` agent charged me

**What it means.** It is working as designed. `social` pays an Apify scraper
per platform per run, which is why it is not in `agents.enabled` by default and
why it records its own spend to `data/spend.log`. See
[social](CONFIGURATION.md#social).

**What to do.** Remove it from `agents.enabled` and run
`jarvis agents install` again, or narrow what it costs with
`social.post_window_days` and `social.max_posts_per_platform`.

## Delivery

### A notify channel is configured but nothing arrives

**What it means.** A webhook that exists is not a webhook that works, and a
failed delivery deliberately does not change the agent's exit code, so the run
still reports success.

**What to do.**

```bash
jarvis notify              # which channels and providers are configured
jarvis notify test phone   # really posts a one-line ping
jarvis agents check        # a half-configured channel is reported as a problem
```

The failure itself is written to `data/logs/<agent>.log` as
`notify <channel>: FAILED: <reason>`. Per-platform setup is in
[NOTIFY.md](NOTIFY.md#when-it-does-not-work).

### Telegram sends nothing and the chat id looks right

**What it means.** A guessed chat id is the usual cause. It is not your
username and not the bot's id.

**What to do.** Message the bot once from the phone, then
`jarvis notify telegram-id`, which lists the chats that have messaged it with
their ids. Use exactly what it prints.
