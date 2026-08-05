# journal/

One file per day, named `YYYY-MM-DD.md`. Written by the `nightly` agent at
20:00. This folder is meant to be read in order, which is why the filename is
nothing but the date.

The hour is deliberately not later. An end-of-day agent that slips past
midnight starts reviewing a day that is minutes old, finds nothing, and
concludes the whole system has died - which is exactly what happened the first
night this ran. Late is survivable; across midnight is not.

## What it is for

Every other agent looks forward or sideways: what to make, what is working,
what someone else is doing. This folder is the only place that records what
actually happened, and it is the only artifact where a quiet day and a busy one
leave a different trace.

That matters more than it sounds. The Sunday review and the post-mortem both
reason about "the last week", and without a written record they reason about
whatever is still in the numbers - which is a survivorship view. Twelve days
with no upload is invisible in a subscriber count and obvious in twelve journal
entries that each say nothing shipped.

## What an entry looks like

Frontmatter, a standalone one-liner, then: what happened, what moved, what
didn't, and one thing for tomorrow. Under 300 words, because it is read at
night. See `2026-01-15.example.md` in this folder for the shape.

The rules for writing one live in `agents/nightly.md`, not here, so there is
one copy of them. The short version, because it is the part that is easy to
get wrong: **an entry that flatters is worse than no entry.** Never invent
activity, never estimate a number that was not read, and when today repeats
yesterday, say so plainly. A run of identical days is the signal. Rephrasing it
into something that sounds eventful is how a log becomes something nobody
trusts, and an untrusted log is dead weight.

## What is committed

Nothing. `journal/*` is gitignored except this file and the example - the
entries are a record of your business, not of the software. If you want them
versioned or synced, point Obsidian, Dropbox, or a private repo at this folder;
`jarvis index` keeps an `index.md` here that reads as an ordinary note.

## If you are adding to this

Delivery of the entry (email, and eventually Slack) is configured under
`journal` in config, and the instruction the agent receives is built by
`journalDelivery()` in `lib/agents.js`. Do not teach the agent a new way to
send things by writing it into the prompt - add the method there, where it is
one named branch and stays off by default.
