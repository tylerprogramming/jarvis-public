# Changelog

## Unreleased

- `nightly` moved from 21:00 to 20:00, and now closes out `{{journal_day}}`
  rather than `{{today}}`. An end-of-day agent that slips past midnight was
  reviewing a day minutes old, finding nothing, and reporting that the whole
  system had died. Before 04:00 it treats the day as still being yesterday's.
- `doctor` catches a clock that is lying. launchd reads the timezone once at
  boot and never again, so changing it afterwards leaves every scheduled agent
  firing in the old zone - silently, surviving a job reload, and looking
  exactly like a machine that sleeps. The check compares scheduled times
  against what the logs say actually happened, and only trusts an offset that
  shows up across two or more agents, so a run started by hand cannot fake it.

## 2.3.0

### The day, written down

- `nightly` agent: at 21:00 it reads its own agent logs, the reports written
  that day, and the numbers, then writes one dated entry into `journal/`. It
  records the days nothing happened as plainly as the days something did, which
  is the only version of a journal worth keeping.
- The recap can reach your inbox. `journal.deliver` is `none` by default;
  `gmail` creates a draft you press send on (the connector cannot send, and that
  is the better default anyway); `resend` actually sends, through
  `scripts/mail.py` and the standard library. `agents check` catches the
  half-configured states rather than letting them fail quietly.
- Agents declare MCP servers by kind (`mcp: [gmail]`) instead of naming a token.
  The token is resolved from whatever you called that server, so an agent file
  is portable between two setups. Each agent still gets only the kinds it asked
  for, so enabling Gmail for the recap does not let the morning agent send mail.
- Agent runs no longer log a stdin warning on every run.
- `data/posts.json`, one post store across platforms. YouTube fills it free via
  yt-dlp; the optional social agent adds IG/TikTok/X via Apify; plugins or an
  official API can fill it too. Consumers read the store, not the collector.
- Radar flags your own breakouts, not just watched channels.
- The postmortem reasons across platforms, so a topic that stalled in one format
  can be recognised as working in another.
- Breakouts compare a post against where others stood at the same age, falling
  back to lifetime average only when history is too short, and saying which was
  used. Lifetime alone systematically favours new posts.
- The social agent collects per-post numbers alongside follower counts, and logs
  what each run cost. `doctor` reports the running total.

### Ready for someone else's machine

- The four folders that ship empty now explain themselves. `data/`, `reports/`,
  and `drafts/` get a README; `journal/` gets a CLAUDE.md and an example entry,
  because it is the folder an agent writes into and the shape is the hard part.
  Labels ship, contents stay gitignored.
- Nothing assumes the repo lives at `~/jarvis`. `documents_dirs` had that path
  hardcoded, which meant anyone who cloned elsewhere got a documents trail and
  an indexer pointing at a folder that did not exist. It now defaults to empty
  and means what it always claimed: extra folders, beyond the built-in three.
- `index.md`, `README.md`, `CLAUDE.md`, and `*.example.md` are folder furniture.
  The documents trail and the indexer both skip them, so a README cannot sit at
  the top of a nine-slot panel burying the reports it exists to surface.

## 2.2.0

### Themes

- Eight themes, up from three. Nord, Catppuccin Mocha, Tokyo Night, and Gruvbox
  use their upstream projects' published palettes, so they match the editor
  theme you already run. Daylight is the light one.
- A theme now sets the chrome as well as the colours: `glass` is blurred with
  sharp corners, `soft` is rounded with a heavier blur, `flat` has no blur and
  goes opaque. Gruvbox on flat reads as a different program to Tokyo Night on
  soft.
- The stylesheet no longer contains a single colour literal. Twenty were
  hardcoded, including every large number, so they ignored the theme entirely.
- Cycling replaced by a picker whose swatches are painted from each theme's own
  tokens.

### MCP servers

- Jarvis inherits the servers your `claude` CLI is connected to, and can now be
  allowed to use them. Default is still none, since these are the tools that
  send email and post publicly.
- `jarvis mcp`, `jarvis mcp allow <name>`, checkboxes in settings, a section in
  `doctor`, and a list on first run. The failure this prevents is specific: a
  connected server that is not allowed is rejected locally and reads exactly
  like the service being down.
- The persona is told the difference, so it says "not enabled for Jarvis yet"
  rather than "unreachable".

### Fixed

- Settings apply on save. The server read config once at boot, so every change
  really did need a restart. Only the bind address and port do now.
- The microphone failure message claimed "permission denied" for all five ways
  `getUserMedia` can fail. The common one on a desktop is no capture device at
  all. `doctor` now checks for one, separately from whether Whisper is ready.
- MCP discovery returned an empty list when it timed out or the `claude` CLI was
  missing, which rendered as "you have no MCP servers".
- Selects in settings had no styling and rendered as raw OS dropdowns. The
  sticky header let content scroll through the title.

### Changed

- Jarvis answers in one to three sentences. The persona said "keep it tight",
  which is an adjective, and it was read as a suggestion.

## 2.1.0

The first release meant for other people to run. Everything before this assumed
it was running on one specific machine, with one specific set of paid accounts.

### You do not need any paid account

- **Brain is pluggable.** Claude Code by default, then any OpenAI-compatible
  endpoint, which includes a local Ollama. No subscription required, and no key
  unless you choose a provider that needs one.
- **Voice out is free and local first.** Chain is Kokoro, then ElevenLabs, then
  Piper, then the system voice, then the browser. First available wins.
  `jarvis voice install` sets Kokoro up with or without Docker.
- **Voice in is free and local first.** whisper.cpp on your machine, OpenAI only
  if you supply a key, browser as the last resort. Nothing leaves the machine on
  the default path.
- **Transcripts cost nothing.** Captions via yt-dlp, Whisper only when there are
  no captions to pull.
- **Public domain.** Unlicense. No attribution, no copyright headers, take it
  and change it.

### Agents

- Six agents ship: morning, radar, scout, study, postmortem, weekly-review.
  Each is a markdown file with frontmatter, no code and no registration.
- `jarvis agents check` preflights every one before you trust a schedule, so a
  missing binary or unset config surfaces now rather than at 7am.
- Real OS scheduling through launchd or cron, generated from the same
  frontmatter. Survives reboot.
- Postmortem writes what it learned back into a playbook file, so the rules get
  better over time instead of staying whatever they were on day one.
- Agents no longer flatter the newest video. Lifetime views per day always
  favours the most recent upload and will call a flop a win, so comparisons are
  age-normalised or explicitly declined.

### Reliability

- **Bundled yt-dlp.** A stale copy answers `--version` perfectly and then fails
  every real request while the dashboard fills with zeroes. `jarvis ytdlp
  install` drops in a known-good build that bundles its own Python, no brew and
  no pip, and verifies it can actually fetch before keeping it.
- **`doctor` exercises things instead of looking at them.** It fetches with
  yt-dlp rather than reading a version string, and checks the Whisper model
  rather than the Whisper binary. Both of those previously reported ready while
  silently falling back.
- Setup heals a missing yt-dlp rather than failing at first use.

### Security

- Binds loopback by default, and refuses a non-loopback bind without a token.
  `/api/chat` reaches a brain that can read files and run commands, so exposing
  it is handing out a shell.
- File tools are path-scoped with a denylist covering ssh keys, cloud
  credentials, and keychains.
- The persona states the exact tools the session has and is told not to imply
  anything beyond them. It used to read the config, notice skills it could not
  run, and offer them anyway.

### Interface

- Self-describing. Ask what it can do and it answers from the panels and agents
  actually enabled, not from a hardcoded list.
- Tighter command bar with real icons and hover tooltips.
- Documents trail shows titles rather than filenames.
- One document naming convention, defined in one function and injected into
  every agent.

### Setup

- Numbered first-run steps in the README.
- Layered config: `config.default.json` is the shipped baseline,
  `config.json` is yours and gitignored, env vars win. Arrays replace rather
  than merge, so your list is exactly your list.
- `CLAUDE.md` so Claude Code understands the invariants before it suggests
  adding a build step or binding to 0.0.0.0.
- Directive cap raised from 3 to 6, and made configurable.

### Fixed

- Whisper failed three ways at once: the model path was not tilde-expanded, the
  status check tested the binary rather than the model so `doctor` claimed
  ready, and temp filenames could collide so ffmpeg read and wrote the same
  file. The underlying error was also swallowed by a bare catch.
- `data/.kokoro-mode` was committed by accident and recorded one machine's
  install mode. A cloner would have inherited the wrong backend.
