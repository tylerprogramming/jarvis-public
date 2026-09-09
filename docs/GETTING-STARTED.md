# Getting started

The one path from an empty folder to a HUD with agents running on a schedule.
Every step says what you should see when it worked, because most of these
commands are quiet when they succeed and quiet when they do nothing.

Do the steps in order. Scheduling is last on purpose: a schedule that fires an
agent you have never watched run is a cron job you will not trust.

## 1. Check the two runtimes

```bash
node --version      # needs v18 or higher
python3 --version   # 3.8 or higher
```

**You should see** two version numbers. macOS ships `python3` but does not ship
Node, so on a clean Mac the first one says `command not found`: `brew install
node`, or the LTS installer from [nodejs.org](https://nodejs.org), then open a
new terminal so `PATH` picks it up. On Ubuntu 22.04 and Debian 11,
`apt install nodejs` gives you Node 12, which looks installed and then fails;
see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#node-is-installed-but-jarvis-dies-with-a-syntax-error).

There is nothing else to install. `package.json` has an empty dependency list,
so there is no `npm install`, and the Python helpers import only the standard
library, so there is nothing to pip install.

## 2. Clone it

```bash
git clone https://github.com/tylerprogramming/jarvis-public.git jarvis
cd jarvis
```

**You should see** a folder with `bin/`, `agents/` and `docs/` in it. There is
no build step, so this is already runnable.

## 3. Run setup

```bash
node bin/jarvis setup
```

It asks two things it cannot guess, your name and your YouTube handle, then
offers to install a self-contained `yt-dlp`, put a `jarvis` command on your
PATH, and pull your numbers once so the dashboard is not empty.

**You should see** `wrote config.json - you are set up.` and a `Done. Next:`
block at the end. If you accepted the PATH offer, plain `jarvis` works from
here; if you skipped it, put `node bin/` in front of every `jarvis` below.

`config.json` is yours and gitignored. Never edit `config.default.json`. Every
key is in [CONFIGURATION.md](CONFIGURATION.md).

## 4. Read the doctor

```bash
jarvis doctor
```

It is deliberately slow, up to a few minutes, because it fetches with `yt-dlp`
rather than reading `--version`. A stale copy answers `--version` perfectly and
then fails every real request.

**You should see** sections for PLATFORM, CONFIG, BRAIN, TOOLS, VOICE, SERVER,
MCP SERVERS, NOTIFY, MEMORY, EXPERIMENTS and SCHEDULE. Read it as three
questions:

- **CONFIG `config.json  yes`.** If it says `no <- run 'jarvis setup'`, step 3
  did not finish.
- **BRAIN `answers  ok`.** That line is a real turn against the real brain. Any
  other value means chat and every agent will fail; step 6 is about fixing it.
- **TOOLS `yt-dlp  yes ... fetch verified`.** Anything else means your YouTube
  numbers will be blank.

Everything under SCHEDULE is expected to be empty until step 8. Fix anything
else it flags now; symptoms and fixes are in
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 5. Start the HUD

```bash
jarvis            # or: npm start
```

**You should see** `JARVIS online -> http://127.0.0.1:4747` in the terminal,
and at that address in a browser the vitals panel, the agent ring, and a
command bar. The server binds loopback and refuses to start on a public
interface without a token; see [SECURITY.md](SECURITY.md) before changing that.
If the port is already held, the message says so and suggests the next one.

## 6. Connect the brain

The command bar needs a model with tools behind it. Claude Code is the default.

```bash
claude auth status      # should say loggedIn: true
```

If `claude` is missing: `npm install -g @anthropic-ai/claude-code`, then run
`claude` once to sign in. If you would rather not use it, any
OpenAI-compatible endpoint works instead, including a local model; set
[`brain.openai.base_url`](CONFIGURATION.md#brain).

**You should see**, typing `what can you do?` into the command bar, an answer
that lists only what you actually turned on. Two free ways to test the chat
path without spending anything: `/memory` and `remember that I only film on
Tuesdays` are intercepted by the server before any brain is spawned.

If chat returns an odd paragraph and then an error card, the brain failed and
the failure is being rendered as the answer. See
[TROUBLESHOOTING.md](TROUBLESHOOTING.md#chat-answers-with-something-strange-then-shows-an-error).

## 7. Run one agent in the foreground

Watch one work before you let seven of them run unattended.

```bash
jarvis agents check     # would each one work, and does it have what it needs
jarvis agent brief      # run one now, output streams to your terminal
```

**You should see** from `check` a line per agent, `ok` or `FAIL`, with notes
under it; a note like `will skip: missing youtube` is config it needs and does
not have. Then from `agent brief`, the model's output live, and at the end a
new file in `reports/`. `jarvis agents` afterwards shows `brief` with its last
run and no flag. Agent runs cost real money against your Claude subscription
or your API key; `social` costs the most, pays a scraper per platform per run,
and is off by default.

## 8. Only now, put them on a schedule

```bash
jarvis agents install   # launchd on macOS, Task Scheduler on Windows, cron on Linux
```

**You should see** `installed on launchd:` and one line per agent, possibly
followed by a `HEADS UP` about the machine sleeping. `jarvis doctor` afterwards
lists each scheduled agent with `loaded yes`, and `jarvis agents` shows no
`NOT-LOADED` flags.

This writes real OS jobs that survive a reboot. `jarvis agents uninstall`
removes them.

**Whether they actually fire at those times depends on the machine being
awake**, and macOS and Linux differ in what happens when it is not. Read
[TROUBLESHOOTING.md](TROUBLESHOOTING.md#the-agents-did-not-run-at-the-time-i-set)
before relying on a 07:00 report.

## Where to go next

[README.md](../README.md) has the map of every other document: what each agent
does, the config surface, chat delivery to Discord or your phone, voice, and
the threat model.
