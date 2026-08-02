#!/usr/bin/env python3
"""Example plugin collector: report community size into the HUD.

Copy this to `community.py`, point it at wherever your member data actually
lives, and the numbers show up on the dashboard at the next refresh. The copy
is gitignored, so credentials and private endpoints stay out of the repo.

The contract is one JSON object on stdout. Nothing else.
"""
import json
import os
import sys


def from_sqlite(db_path):
    """A local database export - the common case for community platforms."""
    import sqlite3
    from datetime import datetime, timedelta

    if not os.path.exists(db_path):
        return {}
    db = sqlite3.connect(db_path)
    total = db.execute("select count(*) from members").fetchone()[0]
    cutoff = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    joins = db.execute(
        "select count(*) from members where joined_at >= ?", (cutoff,)
    ).fetchone()[0]
    db.close()
    return {"community_members": total, "community_joins_7d": joins}


def from_api():
    """A hosted API - read the token from the environment, never hardcode it."""
    import urllib.request

    token = os.environ.get("COMMUNITY_API_KEY")
    if not token:
        return {}
    req = urllib.request.Request(
        "https://example.com/api/members/count",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
    return {"community_members": data.get("total")}


if __name__ == "__main__":
    try:
        out = from_sqlite(os.path.expanduser("~/path/to/members.db"))
    except Exception as e:
        print(f"community collector failed: {e}", file=sys.stderr)
        out = {}
    print(json.dumps(out))
