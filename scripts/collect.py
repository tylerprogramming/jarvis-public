#!/usr/bin/env python3
"""Jarvis collector: refresh data/vitals.json and append a daily snapshot.

Self-contained by design. YouTube comes straight from yt-dlp, which needs no
API key and no OAuth. Anything else is either supplied by an agent, told to
Jarvis in chat, or produced by a plugin collector (see plugins/collectors/).

Usage:
    python3 scripts/collect.py            # local only
    python3 scripts/collect.py --fetch    # hit the network for YouTube
"""
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_config  # noqa: E402
import ytdlp_util  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
VITALS = os.path.join(DATA, "vitals.json")
HISTORY = os.path.join(DATA, "history.json")
CALENDAR = os.path.join(DATA, "calendar.json")
PLUGIN_DIR = os.path.join(ROOT, "plugins", "collectors")


def load(path, fallback):
    return jarvis_config.read_json(path, fallback)


config = jarvis_config.load


def collect_youtube(handle, detail_count=6):
    """Subs and recent uploads, via yt-dlp only. No API key, no OAuth.

    Two requests: one for the channel and its video list, one for the details
    of the newest few. Flat listings do not carry view counts or upload dates,
    which is why the second request exists.
    """
    if not handle:
        return {}

    dump = ytdlp_util.channel_dump(handle, limit=12)
    entries = [e for e in (dump.get("entries") or []) if e.get("id")]
    if not entries:
        print("could not read the channel - is the handle right, and is yt-dlp current?",
              file=sys.stderr)
        return {}

    details = ytdlp_util.video_details([e["id"] for e in entries[:detail_count]])

    recent = []
    for e in entries:
        d = details.get(e["id"], {})
        recent.append({
            "id": e["id"],
            "title": d.get("title") or e.get("title") or "",
            "views": d.get("views") or e.get("view_count") or 0,
            "duration": d.get("duration") or e.get("duration") or 0,
            "upload_date": d.get("upload_date", ""),
        })

    subs = dump.get("channel_follower_count")
    if subs is None:
        subs = next((d.get("subs") for d in details.values() if d.get("subs")), None)

    out = {
        "yt_recent": recent,
        "yt_channel": dump.get("channel") or dump.get("uploader"),
        "yt_fetched_at": datetime.now().isoformat(timespec="seconds"),
    }
    if subs is not None:
        out["yt_subs"] = subs
    if dump.get("playlist_count"):
        out["yt_total_videos"] = dump["playlist_count"]

    latest = recent[0]
    up = latest.get("upload_date", "")
    days_live = None
    if len(up) == 8:
        d = datetime(int(up[:4]), int(up[4:6]), int(up[6:8]))
        days_live = max((datetime.now() - d).days, 1)
    out["yt_latest"] = {
        "id": latest["id"],
        "title": latest["title"],
        "views": latest["views"],
        "upload_date": up,
        "views_per_day": round(latest["views"] / days_live) if days_live else None,
    }
    return out


def run_plugins():
    """Each plugin prints one JSON object; the keys merge into vitals.

    This is how a private integration (a community platform, a billing system,
    a CRM) gets into the HUD without touching core files.
    """
    merged = {}
    if not os.path.isdir(PLUGIN_DIR):
        return merged
    for name in sorted(os.listdir(PLUGIN_DIR)):
        # skip dotfiles, private helpers, docs, and the shipped templates
        if name.startswith((".", "_")) or name.endswith((".md", ".example.py")):
            continue
        path = os.path.join(PLUGIN_DIR, name)
        if not os.path.isfile(path):
            continue
        if name.endswith(".py"):
            cmd = ["python3", path]
        elif name.endswith(".sh"):
            cmd = ["bash", path]
        elif os.access(path, os.X_OK):
            cmd = [path]
        else:
            continue
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            data = json.loads(r.stdout.strip() or "{}")
            if isinstance(data, dict):
                merged.update(data)
                print(f"plugin {name}: {len(data)} keys")
            else:
                print(f"plugin {name}: ignored, not a JSON object", file=sys.stderr)
        except Exception as e:
            print(f"plugin {name}: failed ({e})", file=sys.stderr)
    return merged


def update_calendar(cfg, recent):
    """Weekly content grid. Slots come from config; YouTube marks itself done."""
    cal_cfg = cfg.get("calendar", {})
    if cal_cfg.get("enabled") is False:
        return
    plan = cal_cfg.get("week_plan", {})
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    cal = load(CALENDAR, {})
    if cal.get("week_start") != monday.isoformat():
        cal = {
            "week_start": monday.isoformat(),
            "days": [
                {
                    "date": (monday + timedelta(days=i)).isoformat(),
                    "items": [{"type": t, "done": False} for t in plan.get(str(i), [])],
                }
                for i in range(7)
            ],
        }

    uploads = {}
    for v in recent or []:
        up = v.get("upload_date", "")
        if len(up) == 8:
            d = f"{up[:4]}-{up[4:6]}-{up[6:8]}"
            dur = v.get("duration") or 0
            kind = "short" if dur and dur < 183 else "long"
            uploads.setdefault(d, set()).add(kind)
    for day in cal["days"]:
        for item in day["items"]:
            if item["type"] in uploads.get(day["date"], set()):
                item["done"] = True

    with open(CALENDAR, "w") as f:
        json.dump(cal, f, indent=2)


def main():
    cfg = config()
    os.makedirs(DATA, exist_ok=True)
    vitals = load(VITALS, {})

    if "--fetch" in sys.argv:
        handle = cfg.get("profile", {}).get("channels", {}).get("youtube", "")
        vitals.update(collect_youtube(handle))

    vitals.update(run_plugins())
    vitals["updated_at"] = datetime.now().isoformat(timespec="seconds")

    update_calendar(cfg, vitals.get("yt_recent"))

    with open(VITALS, "w") as f:
        json.dump(vitals, f, indent=2)

    # One row per day, last write wins. Only tracks keys that exist.
    hist = load(HISTORY, [])
    today = date.today().isoformat()
    row = {"date": today}
    for key in ("yt_subs", "ig_followers", "tiktok_followers",
                "linkedin_followers", "x_followers", "community_members"):
        if vitals.get(key) is not None:
            row[key] = vitals[key]
    if vitals.get("yt_latest"):
        row["latest_views"] = vitals["yt_latest"].get("views")
    hist = [r for r in hist if r.get("date") != today] + [row]
    hist.sort(key=lambda r: r["date"])
    with open(HISTORY, "w") as f:
        json.dump(hist, f, indent=2)

    print(json.dumps({k: v for k, v in vitals.items() if k != "yt_recent"}, indent=2))


if __name__ == "__main__":
    main()
