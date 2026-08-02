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

## requires

Prevents an agent from running against config it needs but does not have, which
is how you get a confident report full of invented numbers.

- `youtube` - a YouTube handle is set
- `radar` - at least one radar channel
- `brain` - at least one playbook file

A skipped agent logs why and exits without writing anything.

## Running and scheduling

```bash
jarvis agents              # list, with schedule and last run
jarvis agent scout         # run one now, output streams to your terminal
jarvis agents install      # launchd on macOS, cron on Linux
jarvis agents uninstall
```

Only agents listed in `agents.enabled` get scheduled. Clicking an agent on the
HUD ring also runs it immediately, which is the fastest way to test a change.

Every run appends to `data/<name>.log`.

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
