# Playbook

What Jarvis has worked out about this channel. The post-mortem and study agents
write here after every review; scout and the morning sweep read it first.

This is the loop the whole project exists for. A dashboard shows numbers. This
file is what turns last month's numbers into a decision you make today, which
is why every rule carries a date: a rule confirmed in June and never seen again
is a guess wearing a timestamp.

Copy this to `playbook.md` to start with the structure, or just let the agents
create it. They know the format.

## How to write in here

- **Distilled rules only, never raw data.** "Titles with a number outperform"
  is a rule. A list of every video and its views is not.
- **Stamp everything.** `[confirmed 2026-08-02]` on the section,
  `[2026-08-05]` on a single rule that was re-confirmed later. The HUD sorts by
  those dates, so an unstamped rule sinks and stops being read.
- **Retire what stops being true.** A rule contradicted by new evidence gets
  rewritten or deleted, not left to rot next to the rule that replaced it.
- **Scope a rule when it breaks.** If it holds for one format and not another,
  say so. `SCOPED [date]: holds for X, not for Y` is more useful than deleting.

## Identity [confirmed 1970-01-01]

- What you actually make, in one line, in the words an audience would use.
- The format that reliably works for you, and the one that reliably does not.

## Titles [confirmed 1970-01-01]

- The patterns that have earned clicks, with the evidence beside them.
- The patterns that have not. This half is usually more valuable.

## Thumbnails [confirmed 1970-01-01]

- What has actually been tested, not what the internet says.

## Topics [confirmed 1970-01-01]

- Which subjects reach past your existing audience, and which only land with
  people who already subscribe.
