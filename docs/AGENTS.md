# Agents

An agent is a markdown file in `agents/`. Frontmatter says when it runs and
what it may touch; the body is the prompt. There is no code to write.

## Anatomy

```markdown
---
name: morning              # id used by `jarvis agent <name>` and agents.enabled
label: MORNING             # what shows on the HUD ring
schedule: "0 7 * * *"      # standard cron: minute hour day month weekday
description: One line shown in the settings panel.
requires: [youtube]        # skip cleanly when config is missing this
mcp: [gmail]               # MCP kinds this agent may use, if you enabled them
pre:                       # shell commands run before the prompt
  - python3 scripts/collect.py --fetch
tools: Read Write Edit Bash(yt-dlp:*)
disallowed_tools: Bash(*post*)
permission_mode: acceptEdits
---
Prompt body. Placeholders like {{owner}} and {{today}} are filled from config.
```

Only `name` and a body are required.

## Placeholders

| | |
|---|---|
| `{{owner}}` `{{about}}` `{{working_hours}}` | who you are, from `profile` |
| `{{youtube}}` `{{instagram}}` `{{tiktok}}` `{{linkedin}}` `{{x}}` | your handles |
| `{{community_label}}` `{{community_url}}` | your community |
| `{{targets}}` | your primary cards, formatted |
| `{{today}}` | `YYYY-MM-DD`, local time |
| `{{root}}` `{{data}}` `{{reports}}` `{{drafts}}` | absolute paths |
| `{{brain_files}}` `{{context_dirs}}` | your `knowledge` paths |
| `{{radar_channels}}` `{{lanes}}` | watched channels, research lanes |
| `{{journal_dir}}` `{{journal_delivery}}` | where the nightly entry goes, and what to do with it |
| `{{journal_day}}` | the day being closed out. Before 04:00 this is *yesterday*, not `{{today}}` |

## mcp

An agent names the *kind* of MCP server it needs, not the server's token:

```markdown
mcp: [gmail]
```

At run time that is matched against the servers you enabled in
`chat.mcp_servers`, and the real token is appended to the agent's tools. So
`mcp: [gmail]` works whether you called yours `gmail` or `claude.ai Gmail`, and
an agent file stays portable between two people who named things differently.

Two things this deliberately does not do. It does not enable anything — if the
server is not in `chat.mcp_servers` the agent runs without it and says so in
its log. And it does not hand an agent every server you have on: each agent
gets only the kinds it declared, so turning Gmail on for the nightly recap does
not give the brief the ability to email people.

## requires

Prevents an agent from running against config it needs but does not have, which
is how you get a confident report full of invented numbers.

- `youtube` - a YouTube handle is set
- `radar` - at least one radar channel
- `brain` - at least one playbook file

A skipped agent logs why and exits without writing anything.

`social` is met when at least one non-YouTube handle is set in
`profile.channels`. `apify` is met when an Apify MCP server is listed in
`chat.mcp_servers`. That one reads config rather than probing the network,
because requirements are evaluated every time you list agents and a live MCP
health check takes seconds. Whether the server actually answers is left to the
agent, which is told to fail loudly rather than write a wrong number.

## notify

Send what an agent wrote to a chat channel when the run finishes. Off unless
you turn it on, and done by code after the model has exited: the model never
picks a channel, never sends twice, and cannot paste the wrong file, because
it is not involved.

```markdown
notify: [phone]         # channel names from notify.channels in config
notify_when: report     # report (default) | always
notify_mode: summary    # summary (default) | full | link
```

`notify_when: report` sends only when the run produced a new file. That is
free urgency for `radar`: no breakout, no report, no ping. `always` still
needs a file to send and logs a stated skip when there is none.

`summary` is the title, the first line of the report, and the path. `full` is
the whole body, cut to the platform's limit with a note saying how much is
left in the file. `link` is a URL that opens the report in the HUD, on the
machine running it.

You can set the same three keys under `agents.<name>` in `config.json`, which
wins over the frontmatter, so a shipped agent can deliver without editing the
file that `git pull` will overwrite. Channels and their providers are in
[CONFIGURATION.md](CONFIGURATION.md#notify); the secrets live in `.env`.

A delivery that fails writes `notify <channel>: FAILED: <reason>` to the
agent's log in `data/logs/` and never changes the agent's own exit code.
`jarvis agents check` refuses a channel that is missing, has an unknown
provider, or has no secret set.

## Running and scheduling

Agents run as independent OS jobs with no locking between them, so two that
write the same data file must not share a start time. Chain the work as a `pre`
command in one agent instead. `social` does this: its pre runs the YouTube
collector, so a single sequential run gathers every platform.


```bash
jarvis agents              # list, with schedule and last run
jarvis agent scout         # run one now, output streams to your terminal
jarvis agents install      # launchd on macOS, cron on Linux
jarvis agents uninstall
```

Only agents listed in `agents.enabled` get scheduled. Clicking an agent on the
HUD ring also runs it immediately, which is the fastest way to test a change.

Every run appends to `data/logs/<name>.log` and writes one row to
`data/runs.json`, the run ledger: when it started and ended, the exit code,
whether it was skipped, the file it wrote (found by the convention, not
reported by the model), the first error line if one of the known failures
appeared, and whether the scheduler or a person started it. `jarvis agent
<name>` exits with the run's code; a scheduled run that died of "went to
sleep mid-response" or "Connection closed" is retried once after a minute,
as a second row with `retry_of`. A run past `agents.timeout_minutes` is
killed and recorded as exit 124.

## Health

The HUD, `jarvis agents` and `jarvis doctor` all read the ledger and say one
of: **ok**, **failed** (exit not 0), **overdue** (scheduled, and no run since
the last fire plus 90 minutes), **stale** (exited 0 but the prompt writes to
`{{reports}}` or `{{journal_dir}}` and no file appeared), **never**,
**running**, or **not loaded** (scheduled and enabled, but the OS job is
missing, or on macOS the plist points at a `node` that no longer exists,
which is what a Homebrew upgrade does). DONE is only shown for ok.

An agent that legitimately writes nothing on a quiet day says so with
`quiet_ok: true` in its frontmatter (`radar`, `postmortem`, `watchdog`), so
an empty run is not called stale.

`watchdog` runs at 08:15, computes the same verdict for every scheduled agent
with `scripts/runs.py --check` (stdlib Python, independent of the Node code it
is checking), and writes `reports/<date>-watchdog.md` only when something is
wrong, one line per problem with the fix command. To be pinged, give it a
channel like any other agent: `notify: [phone]` in `agents/watchdog.md`, or
`agents.watchdog.notify` in `config.json`. Because it is itself scheduled,
`jarvis doctor` prints when it last checked, so a dead watchdog is visible.

## Experiments

An experiment is one thing you are trying next week, written down before you
try it, with the number that will settle it. It exists so the weekly review
has to answer "did last week's idea work" before it is allowed to have a new
one, which is the difference between a system that learns and a system that
produces a fresh opinion every Sunday.

```bash
jarvis experiments                       # open, overdue, and closed with verdicts
jarvis experiments add --hypothesis "..." --metric "..." --target "..." --deadline YYYY-MM-DD
jarvis experiments close <id> --result "..." --verdict confirmed|refuted|unmeasured
jarvis experiments due                   # only the ones past their deadline
```

The ledger is `data/decisions.jsonl`, append-only, one JSON object per line,
shared with the decisions memory tier. Nothing rewrites history: closing an
experiment appends the close.

**Two open at a time.** `experiments.max_open` defaults to 2 and `add` refuses
past it, naming what to close first. The cap is the point: running five
experiments at once means none of them is attributable, and the review agent
will happily open one every week forever if nothing stops it.

**Three verdicts, and one of them is not a failure.** `confirmed` and
`refuted` both need the metric read from a data file. `unmeasured` is what an
honest close looks like when the number was never available, and it is
required rather than optional because the alternative is a guess dressed as a
result. The review agent is told: if you cannot read the metric, the verdict
is unmeasured, never a guess.

**Review closes the books before it proposes.** `agents/review.md` gets the
open list injected as `{{experiments_open}}`, and its CLOSE THE BOOKS step runs
before THE EXPERIMENT step. An overdue open experiment blocks a new one, so the
ledger cannot fill up with abandoned ideas.

**A rule needs a source.** `agents/postmortem.md` may only write a playbook
rule that cites a video id or an experiment id. A rule with no evidence
pointer is not written at all, which is what keeps the playbook from
accumulating opinions nobody can trace.

The HUD shows the open ones at the top of the Playbook panel, and
`jarvis doctor` prints a one-line count with how many are overdue. Config keys
are in [CONFIGURATION.md](CONFIGURATION.md#experiments).

## Writing a good one

**Tell it to stop.** The most valuable line in the postmortem agent is "if
there are none, print 'no videos in window' and STOP". Without it you get a
report every day, most of them about nothing, and you stop reading them.

**Ban invention explicitly.** "Report only numbers you read or fetched. If a
fetch failed, say it failed." An agent that fills gaps with plausible numbers is
worse than no agent.

**Give it a length budget.** "Under 40 lines" is the difference between
something you read at 7am and something you skip.

**Make the output land somewhere.** Write to `{{reports}}` so it shows in the
documents trail, or update `{{data}}/directives.json` so it shows up as the
next action. An agent whose output nobody sees is a cron job burning tokens.

**Draft, never publish.** Agents run unattended. Anything that posts, sends, or
emails should write a draft to `{{drafts}}` and stop, with the publish step
requiring you to say so in chat.

## Example

`agents/inbox.md`:

```markdown
---
name: inbox
label: INBOX
schedule: "0 9 * * 1"
description: Monday sweep of what people asked for last week.
tools: Read Write WebSearch WebFetch
---
Search for recent public questions about {{lanes}}. Find the five that come up
most and are not already answered in {{brain_files}}. Write them to
{{reports}}/{{today}}-inbox.md as five candidate topics, most-asked first, each
with where you saw it asked. Under 30 lines. If you find nothing new, say so
and write nothing.
```

Then add `"inbox"` to `agents.enabled` and run `jarvis agents install`.
