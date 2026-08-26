# playbook/

What Jarvis has learned and confirmed. **This is the only folder here that is
meant to be edited in place.**

Everything else Jarvis writes is an event: `reports/` and `journal/` are dated,
written once, and never touched again. These files are the opposite. They have
no dates in their names, they get rewritten rather than appended to, and they
are the one thing that should get *better* over time instead of just longer.

One file per topic — `youtube.md`, `voice.md`, `thumbnails.md`. Split when a
page gets long enough that you stop re-reading it.

Rules carry a `[confirmed YYYY-MM-DD]` stamp so a stale one is visible. The
postmortem agent updates these after a review: it adjusts the confirmation date
when a rule holds, and adds the counter-evidence when it does not.

Distilled rules only. Never raw data — that is what `reports/` is for.

If `knowledge.brain_files` is set in your config, those files are used instead
and this folder is left alone.
