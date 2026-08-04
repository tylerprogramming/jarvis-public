# Roadmap

Jarvis is a dashboard that closes loops. A number you look at changes nothing;
a loop that reads the number, decides, and writes down what it learned compounds.
Everything below is judged against that.

## Shipped

**v2 - the public release**
- Config-driven throughout: no identity in code, `config.json` deep-merged over
  defaults so updates never clobber a setup
- Agents are markdown files with cron frontmatter, one generic runner, launchd
  and cron installers generated from the same metadata
- Self-contained collector: YouTube via `yt-dlp` with a client fallback for
  stale installs, no API key or OAuth anywhere
- Free voice both ways: Kokoro / Piper / system TTS, local Whisper STT, with
  paid providers as an optional upgrade rather than a requirement
- Plugin collectors so private integrations drop in without a fork
- Hardened: loopback bind by default, refuses to expose itself without a token,
  path traversal closed, body limits, secrets rejected from the settings API
- In-app settings panel and a `jarvis` CLI (`setup`, `doctor`, `agents`)

**v1 - the original HUD**
- Particle brain, vitals, directives, documents trail, agent ring
- Voice command bar routed to headless Claude Code with session memory
- The five loops: morning report, post-mortem, scout, funnel watch, review

## Next

**Make the loops visibly compound.** Agents already write findings back to a
playbook file. What is missing is showing it: a panel of what Jarvis has
learned about your channel, with the evidence and the date it was confirmed.
This is the single most differentiating thing here and it is currently invisible.

**Local model support.** The command bar assumes Claude Code. An Ollama path
would let people run the whole thing with no subscription, at lower quality.
Worth it for adoption; the agent loop needs to degrade gracefully.

**Docker.** `docker compose up` with a mounted config volume. The blocker is
that Claude Code and `yt-dlp` both need to exist in the image and the agent
needs write access to real files, so it is less trivial than it looks.

**Push when something is urgent.** An agent that finds a 5x breakout at 6:30am
writes a report nobody reads until evening. ntfy or a webhook, opt-in.

**More ways for the recap to reach you.** The nightly journal already has the
seam: `journal.deliver` names a method, `journalDelivery()` hands the agent one
exact instruction, and the default is to do nothing. Slack is the obvious next
one - a DM to yourself is where a lot of people actually read things, and the
MCP server for it is already common, so it is `mcp: [slack]` plus one branch
rather than new plumbing. Discord and ntfy drop into the same slot. The rule
that has to survive: every method is named and never improvised, and each one
stays off until someone turns it on.

**Pre-flight gate.** Score a planned title against the playbook plus a live
search before the work gets made. This existed in v1 as a chat command and
should come back as a real UI with a verdict and alternatives.

**A HUD that adapts to what you do.** Right now the vitals are creator-shaped.
The same engine works for a freelancer (pipeline, invoices), an indie hacker
(MRR, signups), or a job hunter (applications, callbacks) if the tiles and
agents ship as swappable profile presets.

## Deliberately not doing

- **Multi-tenant hosting.** It spawns a coding agent against a local filesystem.
  That is the design, and it does not become a SaaS without becoming a different
  product.
- **A mobile app.** The HUD is responsive; a token and a LAN address is enough.
- **More dashboard widgets.** Weather and clocks are what every other Jarvis
  does. Nothing goes on this screen unless an agent acts on it.
