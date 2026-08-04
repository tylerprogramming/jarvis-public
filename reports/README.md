# reports/

Finished work by the agents. This folder is empty on a fresh clone and fills
itself the first time one runs.

Everything here is named `YYYY-MM-DD-<kind>[-<subject>].md` — date first so the
folder sorts chronologically, kind second so related files group. The naming
and frontmatter rules are defined once, in `docConvention()` in
`lib/agents.js`, and injected into every agent prompt as `{{doc_convention}}`.
Change them there; agents do not restate them, which is how they stopped
drifting apart.

| Kind | Written by | When |
|---|---|---|
| `morning` | `morning` | daily |
| `radar` | `radar` | daily |
| `postmortem-<video>` | `postmortem` | when a video hits 48h or 7d |
| `scout` | `scout` | Fridays |
| `study` | `study` | Wednesdays |
| `weekly` | `weekly-review` | Sundays |

A report is final. Anything still waiting on a human decision goes in
`drafts/` instead, with `status: draft` in its frontmatter.

`jarvis index` writes an `index.md` here after every agent run, listing each
report with its title, date, and first line. Agents are told to read that index
before grepping, because it is a fixed small read that gets *better* as the
folder grows, while grep gets worse.

**Not committed.** `reports/*` is gitignored except this file. These are
conclusions about your business, not part of the software. Point Obsidian at
this folder if you want them in a vault — the indexes are plain markdown with
relative links and the graph view picks them up.
