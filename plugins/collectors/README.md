# Plugin collectors

Anything in this folder runs on every `collect.py` pass. Each one prints a
single JSON object to stdout, and those keys are merged into `data/vitals.json`.

That is the whole contract. It exists so you can wire Jarvis to a platform the
core does not know about - a community, a billing system, a CRM, a newsletter -
without editing core files or maintaining a fork. Everything here except this
README and `*.example.py` is gitignored, so your private integrations stay
private even if you publish your Jarvis.

## Contract

- **Language:** any. `.py` runs with `python3`, `.sh` with `bash`, anything else
  executable runs directly.
- **Output:** one JSON object on stdout. Anything else is ignored.
- **Failure:** exit non-zero or print garbage and Jarvis logs it and moves on.
  A broken plugin never blocks a refresh.
- **Timeout:** 120 seconds.
- **Keys:** use `community_members` and `community_joins_7d` to populate the
  community tile in the HUD. Any other key is available to agents and chat but
  is not drawn on the dashboard unless you add it to `vitals.show`.

## Example

```python
#!/usr/bin/env python3
import json, sqlite3

db = sqlite3.connect("/path/to/your/members.db")
total = db.execute("select count(*) from members").fetchone()[0]

print(json.dumps({"community_members": total}))
```

Save that as `plugins/collectors/members.py` and the number appears on the HUD
at the next refresh.
