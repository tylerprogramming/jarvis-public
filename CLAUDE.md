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
| `scripts/posts.py` | The cross-platform post store and the breakout math. Read the docstring. |
| `lib/mcp.js` | Discovers the operator's MCP servers and derives their tool prefixes. |
| `lib/tts.js`, `lib/stt.js` | Voice out and in, each a fallback chain. |
| `lib/schedule.js` | Generates launchd plists or crontab lines from agent frontmatter. |
| `agents/*.md` | The agents themselves. Prompt plus frontmatter, no code. |
| `scripts/` | Python and shell helpers. Collection, transcripts, indexes, installers. |
| `plugins/collectors/` | Optional per-user collectors the operator drops in. |
| `public/app.js` | The HUD, plus the `THEMES` table at the top of the file. |
| `public/settings.js` | The settings panel. Writes `config.json` through `/api/config`. |
| `public/` | The rest of the HUD. Vanilla JS, no framework. |
| `docs/` | The deep references, see below. |
| `data/` | State every agent reasons from. Read `data/README.md` before writing any of it. |
| `reports/` | Finished agent output. Empty on a fresh clone. |
| `drafts/` | Agent output still waiting on a human. `status: draft`. |
| `journal/` | One entry per day from `nightly`. See `journal/CLAUDE.md`. |

The four output folders ship with their own label and nothing else — their
contents are gitignored, because they are a record of the operator's business
rather than part of the software. `index.md`, `README.md`, `CLAUDE.md`, and
`*.example.md` are folder furniture and are skipped by both the documents trail
and `jarvis index`; if you add another such file, add it to `isFolderMeta()` in
`server.js` and `is_folder_meta()` in `scripts/index.py`, which must agree.

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

**No colour literals in the stylesheet.** Every colour in `style.css` is a
token, and the `THEMES` table in `public/app.js` sets all of them. Hardcoding a
hex, even for something as small as a big number being white, silently excludes
that element from every theme and breaks the light one outright. If you need a
new colour, add a token and give all eight themes a value.

**Settings apply without a restart.** `apiPutConfig` reassigns `CFG` after
writing, so `CFG` is `let`, not `const`. Only the bind address and port need a
restart, and the response says which. Do not go back to telling people to
restart because it is easier than reloading.

**Document naming lives in one place.** `docConvention()` in `lib/agents.js` is
the single source, injected into every agent as `{{doc_convention}}`. Agents do
not restate the rule. Change it there or it drifts.

**Do not co-schedule two agents that write `data/vitals.json`.** Each agent is
its own launchd job, there is no locking anywhere, and five things write that
file. Two starting in the same minute both read it, both write it, and one set
of numbers disappears with nothing in any log. When work needs to happen
together, chain it as a `pre` command inside one agent, the way `social` runs
the YouTube collector before its own fetch. Staggered schedules are load-bearing.

**Agents get `bin/` prepended to PATH.** That is how they find the bundled
`yt-dlp` rather than whatever is on the user's system. Preserve it when touching
how agents spawn. Their stdin is `ignore` for the same reason: nobody is typing
at a scheduled job, and an open pipe only earns a warning in every log.

**Delivery defaults to off, and never improvises.** `journal.deliver` is
`none` out of the box, and the exact instruction the nightly agent receives is
built by `journalDelivery()` in `lib/agents.js`, not decided by the model.
Sending mail is the one thing in this repo that leaves the machine and cannot
be taken back, so the prompt says precisely one method or precisely none, and a
misconfigured setting produces a stated skip rather than a guess at an address.

**An agent declares MCP servers by kind, not by token.** `mcp: [gmail]` in
frontmatter, resolved at run time against the servers the operator enabled.
Never hardcode `mcp__claude_ai_Gmail` in an agent file — it only works for
people who named their server the way you named yours. And never append every
enabled server to every agent: each one gets only the kinds it declared, which
is what stops the morning report from being able to send email.

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

Anything touching the HUD has to be checked in a browser. Every UI bug in this
repo's history looked correct in the diff: a status object read one level too
high rendered "no MCP servers" while eleven were connected, and a sticky header
with no z-index let checkboxes scroll through the title. Open it and look.

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

**Give an agent an MCP server.** Add `mcp: [<kind>]` to its frontmatter — a
substring matched against the operator's enabled server names. Nothing else.
Do not add the server to `chat.mcp_servers` for them; declaring the need and
granting it are separate on purpose, and the log says when a declared kind is
not enabled.

**Add a theme.** One entry in `THEMES` at the top of `public/app.js`: the
colour tokens, a `chrome` (`glass`, `soft`, or `flat`, which controls blur and
corner radius), and a brain `mode` and `hue`. Copy the nearest existing theme so
you get every token; a missing one falls back to whatever the last theme set,
which looks like a rendering bug rather than a missing value.

**Add a post collector.** Write to `data/posts.json` through
`scripts/posts.py`'s `upsert()`, never by hand. It merges on (platform, id) and
appends to each post's daily reading series, which is what makes the same-age
breakout comparison possible. A collector that cannot read a view count must
omit the post rather than write zero, because a zero drags down the median every
other post is judged against.

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
