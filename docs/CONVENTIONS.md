# Document conventions

Everything Jarvis writes into `reports/` or `drafts/` follows one shape. The
rule lives in `lib/agents.js` as `docConvention()` and is injected into every
agent prompt as `{{doc_convention}}` — defined once, so the agents cannot drift
apart the way they did when each prompt named its own files.

## Filenames

```
YYYY-MM-DD-<kind>[-<subject>].md
```

Date first, so a folder listing is chronological without any tooling. Kind
second, so related files group together under any given day. `<subject>` only when a kind can recur
within one day. Lowercase, hyphens, no spaces or underscores.

**`<subject>` must be readable.** Four or five words from the title, not an
identifier — a filename should say what it is about without being opened:

```
2026-08-01-morning.md
2026-08-01-postmortem-dont-edit-videos-anymore.md    ← not -cdvi2ooarDc
2026-08-01-radar.md
2026-07-30-newsletter.md
```

Identifiers still matter, they just do not belong in the name. A postmortem
carries `video_id: cdvi2ooarDc` in its frontmatter, so the URL is
reconstructible and the filename stays human.

## Frontmatter

Every file opens with:

```yaml
---
title: Subs flat, latest video underpacing
date: 2026-08-01
kind: morning
agent: morning
status: final
---
```

| Field | Why it exists |
|---|---|
| `title` | What appears in the documents trail and the folder index. Write it for someone skimming — "Subs flat, latest video underpacing" beats "Morning report" |
| `date` | Authoritative even if the file is renamed or moved |
| `kind` | `morning`, `radar`, `postmortem`, `scout`, `study`, `weekly`, `note`, `draft` |
| `agent` | Which agent wrote it, or `chat` when a person asked for it |
| `status` | `final` for reports, `draft` for anything awaiting approval |

The first line of the body should stand alone as a summary — the index shows it
as the one-line gist, so it is the sentence most likely to be read.

## Why frontmatter rather than clever filenames

A filename that encodes status (`-DRAFT`, `-v2`) has to be renamed when the
status changes, and renaming breaks every link pointing at it. Status lives in
the file instead: approving a draft edits one line, and nothing else moves.

`jarvis index` reads these fields to build each folder's `index.md`, tagging
documents by kind and flagging any status that is not `final`.
