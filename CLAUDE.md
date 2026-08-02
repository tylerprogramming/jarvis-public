# CLAUDE.md

Notes for Claude Code working in this repo. If you are a person, read `README.md`
first, it covers install and day to day use.

## What this is

A self-hosted operations HUD. A small Node server serves a dashboard, collects
vitals about the operator's channels, and runs scheduled markdown agents that
write reports back into the repo. Voice in and out are optional and local by
default. The "brain" behind chat is pluggable, Claude Code by default.

There is no build step, no bundler, and no test suite. You run it and look at it.

## Orientation

| Path | What it is |
|---|---|
| `server.js` | The whole HTTP server. Static files, `/api/*`, SSE. |
| `bin/jarvis` | CLI entry point. Every command lives in one switch. |
| `lib/config.js` | Three-layer config loader. Start here to understand anything. |
| `lib/agents.js` | Frontmatter parsing, placeholder rendering, running, preflight. |
| `lib/persona.js` | Builds the system prompt, including what Jarvis may claim it can do. |
| `lib/brain/` | Pluggable brain. `index.js` picks a provider, others implement one. |
| `lib/tts.js`, `lib/stt.js` | Voice out and in, each a fallback chain. |
| `lib/schedule.js` | Generates launchd plists or crontab lines from agent frontmatter. |
| `agents/*.md` | The agents themselves. Prompt plus frontmatter, no code. |
| `scripts/` | Python and shell helpers. Collection, transcripts, indexes, installers. |
| `plugins/collectors/` | Optional per-user collectors the operator drops in. |
| `public/` | The HUD. Vanilla JS, no framework. |
| `docs/` | The deep references, see below. |

Read the doc rather than re-deriving it from code:

- `docs/CONFIGURATION.md` - every config key and what it does
- `docs/AGENTS.md` - agent anatomy, placeholders, `requires`, scheduling
- `docs/CONVENTIONS.md` - how generated documents are named and front-mattered
- `docs/SECURITY.md` - the threat model and what the defaults protect against

## Invariants

Things that will look like improvements and are not.

**Zero npm dependencies.** `package.json` has an empty `dependencies` block and
it stays that way. Node 18 or newer, standard library only. If something seems
to need a package, it needs less ambition instead. This is what makes the
install `git clone` and nothing else.

**Never edit `config.default.json` to change behaviour for one person.** It is
the shipped baseline. User settings live in `config.json`, which is gitignored
and deep-merged over the defaults, with env vars on top. Arrays replace
wholesale rather than merging, so a user listing one voice provider gets exactly
that one. If you are adding a feature, add its default here and read it through
`lib/config.js`, never `require` the JSON directly.

**The server binds loopback.** `/api/chat` reaches a brain that can read files
and run commands, so exposing it is handing out a shell. It refuses to start on
a non-loopback host without a token. Do not "helpfully" bind `0.0.0.0`.

**`lib/persona.js` must not overclaim.** The prompt lists the exact tools the
session actually has and tells the model not to imply anything beyond them. This
exists because Jarvis used to read the config, notice skills it could not run,
and offer them. If you give it a new capability, grant the tool, do not describe
the capability in prose.

**Document naming lives in one place.** `docConvention()` in `lib/agents.js` is
the single source, injected into every agent as `{{doc_convention}}`. Agents do
not restate the rule. Change it there or it drifts.

**Agents get `bin/` prepended to PATH.** That is how they find the bundled
`yt-dlp` rather than whatever is on the user's system. Preserve it when touching
how agents spawn.

## Verifying a change

The recurring bug in this repo's history is a status check that reports success
without exercising the thing. It has happened with Whisper, with yt-dlp, and
twice in the checks written to catch it. When you add a check, make it do the
real work.

```bash
node bin/jarvis doctor          # what is actually wired up, end to end
node bin/jarvis agents check    # preflight every agent before trusting a schedule
node bin/jarvis agent morning   # run one in the foreground and watch it
node bin/jarvis                 # start the HUD on 127.0.0.1:4747
```

`doctor` is deliberately slow in places. It fetches with yt-dlp instead of
reading `--version`, because a stale copy answers `--version` perfectly and then
fails every real request. Keep that property.

## Common tasks

**Add an agent.** Create `agents/<name>.md` with frontmatter and a prompt. No
code, no registration. Add it to `agents.enabled` in config to turn it on, and
give it a `schedule` if it should run itself. End the prompt with
`{{doc_convention}}`. See `docs/AGENTS.md`.

**Add a vital.** Collection is `scripts/collect.py`, display is
`config.default.json` under `vitals.show` plus the HUD. Per-user sources that
cannot ship publicly go in `plugins/collectors/` as a drop-in.

**Allow an MCP server.** Jarvis does not connect to MCP servers, it inherits
whatever the `claude` CLI already has. `lib/mcp.js` discovers them and derives
the tool prefix; `chat.mcp_servers` in config decides which are allowed. Default
is none on purpose. Do not change that default to "all" to make something work,
and do not add a server to the list on a user's behalf without being asked, as
these are the tools that send email and post publicly.

**Add a brain, TTS, or STT provider.** Each is a fallback chain: a list of
provider names, first available wins. Implement the provider, add it to the
chain default, and make its `status()` prove it works rather than that it
exists.

**Change the HUD.** `public/` is plain JS with no build. Reload the page.

## What not to do

- Do not add a dependency, a build step, or a framework.
- Do not commit `config.json`, `.env`, `data/`, `reports/`, or `drafts/`. Those
  are the operator's, and `.gitignore` already covers them. Check before adding
  anything that writes to disk.
- Do not put credentials in `config.json` examples or in commit messages.
- Do not schedule anything without being asked. `jarvis agents install` writes
  real launchd or cron entries that survive reboot.
- Do not widen `chat.allowed_tools` or `brain.allowed_commands` to make
  something work. That is the security boundary, and widening it silently is how
  a dashboard becomes a remote shell.

## License

Unlicense, public domain. No attribution required, no copyright headers, and do
not add any. People are meant to take this and change it.
