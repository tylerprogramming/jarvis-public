# data/

State. Machine-written, machine-read, and the thing every agent reasons from.
Empty on a fresh clone apart from this file and the examples.

| File | What it holds | Written by |
|---|---|---|
| `vitals.json` | Latest numbers: subs, follower counts, latest video | `scripts/collect.py`, `social` |
| `history.json` | One row per day, the whole series. Sparklines come from here | `scripts/collect.py` |
| `posts.json` | Every post across every platform, with a daily reading each | `scripts/collect.py`, `social` |
| `radar.json` | Latest competitor sweep and computed breakouts | `scripts/radar.py` |
| `directives.json` | Your queue. The HUD ticks these off | agents, and you |
| `calendar.json` | This week's slots and whether they are done | `weekly-review`, and you |
| `<agent>.log` | Append-only run log, one block per run | the agent runner |
| `<agent>.launchd.log` | What launchd itself said, when a run never started | launchd |
| `spend.log` | What each paid scraper run cost | `social` |

## Two rules worth knowing before you touch any of it

**Write `posts.json` through `posts.upsert()`, never by hand.** It merges on
`(platform, id)` so collectors on different schedules do not delete each
other's work, and it appends one dated reading per post. That series is what
makes an honest breakout comparison possible — lifetime views over age always
flatters a new post, and nothing else can reconstruct the series after the
fact. A collector that cannot get a view count must omit the post rather than
write a zero; zero reads as a dead post and drags the median down for
everything else on that platform.

**Do not co-schedule two agents that write `vitals.json`.** Each agent is its
own OS job, there is no locking anywhere, and several things write that file.
Two starting in the same minute both read it, both write it, and one set of
numbers vanishes with nothing in any log. When work has to happen together,
chain it as a `pre` command inside one agent — the way `social` runs the
YouTube collector before its own fetch. The staggered schedules in
`agents/*.md` are load-bearing, not cosmetic.

## Examples and secrets

`*.example.json` files ship as a reference for the shape; the real ones are
gitignored. **No secrets live here.** API keys go in `.env` and nowhere else —
not in `config.json`, not in `data/`. The settings API actively rejects
anything that looks like a key.

**Not committed.** `data/*.json` and `data/*.log` are gitignored. This is your
operating history.
