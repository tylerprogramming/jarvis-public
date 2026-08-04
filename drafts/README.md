# drafts/

Work an agent produced that is waiting on you. Empty on a fresh clone.

The split from `reports/` is about whether a decision is still open, not about
quality. A report states what happened and is final. A draft is something you
are meant to read, change, approve, or throw away — a title set, an outline, a
description, a reply someone suggested sending.

Same naming as `reports/` (`YYYY-MM-DD-<kind>[-<subject>].md`, defined in
`docConvention()` in `lib/agents.js`), with one difference that matters:
frontmatter carries `status: draft`. That is what tells the indexer, the HUD,
and the next agent that nobody has signed off on it yet. An agent that finishes
a draft moves it to `reports/` and flips the status; it does not leave two
copies.

Nothing here is ever acted on automatically. If a draft says to send an email
or publish a post, that still takes you doing it — see `docs/SECURITY.md` for
why the defaults draw the line there.

**Not committed.** `drafts/*` is gitignored except this file.
