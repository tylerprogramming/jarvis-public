# Changelog

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
