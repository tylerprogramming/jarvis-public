#!/usr/bin/env python3
"""Jarvis competitor radar - a daily watch on channels you name in config.

Flags any upload under `recent_days` old whose views-per-day is running at
`breakout_multiple` times that channel's own median velocity. Comparing a
channel against itself is the point: it surfaces a topic that is overperforming
rather than a channel that is simply bigger than yours.

Pure yt-dlp, no API key. Writes data/radar.json.
Config: radar.channels in config.json, e.g. ["@SomeChannel", "channel/UC..."]
"""
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_config  # noqa: E402
import ytdlp_util  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "radar.json")


def config():
    """Just the radar section of the merged config."""
    return jarvis_config.load().get("radar", {})


def channel_videos(handle, per_channel):
    dump = ytdlp_util.channel_dump(handle, limit=per_channel)
    entries = [e for e in (dump.get("entries") or []) if e.get("id")]
    if not entries:
        return []
    details = ytdlp_util.video_details([e["id"] for e in entries])

    now = datetime.now()
    vids = []
    for e in entries:
        d = details.get(e["id"])
        if not d or not d.get("upload_date"):
            continue
        try:
            up = datetime.strptime(d["upload_date"], "%Y%m%d")
        except ValueError:
            continue
        age = max((now - up).days, 1)
        vids.append({"id": d["id"], "title": d["title"], "views": d["views"],
                     "age_days": age, "duration": d["duration"],
                     "velocity": round(d["views"] / age)})
    return vids


def main():
    cfg = config()
    channels_cfg = cfg.get("channels", [])
    if not channels_cfg:
        print("no radar channels configured - checking your own posts only")

    per_channel = int(cfg.get("per_channel", 8))
    recent_days = int(cfg.get("recent_days", 7))
    multiple = float(cfg.get("breakout_multiple", 3.0))
    min_views = int(cfg.get("min_views", 5000))

    channels, breakouts = [], []
    for handle in channels_cfg or []:
        try:
            vids = channel_videos(handle, per_channel)
        except Exception as e:
            print(f"{handle}: FAILED {e}", file=sys.stderr)
            continue
        mature = sorted(v["velocity"] for v in vids if v["age_days"] >= recent_days)
        median = mature[len(mature) // 2] if mature else 0
        for v in vids:
            if (v["age_days"] <= recent_days and median > 0
                    and v["views"] >= min_views
                    and v["velocity"] >= multiple * median):
                breakouts.append({**v, "channel": handle,
                                  "multiple": round(v["velocity"] / median, 1)})
        channels.append({"handle": handle, "median_velocity": median, "videos": vids})
        print(f"{handle}: {len(vids)} videos, median {median}/day")

    breakouts.sort(key=lambda b: -b["multiple"])

    # The same question, asked about the operator's own output. Radar has always
    # watched other people; this notices when one of YOUR posts is outrunning
    # your own normal, on whichever platforms something is filling posts.json.
    # No watched channels and no scraper still gets this, from YouTube alone.
    own = []
    try:
        import posts as _posts
        own = _posts.breakouts(multiple=multiple, recent_days=recent_days)
        for o in own:
            print(f"own {o['platform']}: {o.get('title', o['id'])[:40]} "
                  f"{o['multiple']}x ({o['method']})")
    except Exception as e:
        print(f"own-post check skipped ({e})", file=sys.stderr)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"updated_at": datetime.now().isoformat(timespec="seconds"),
               "names": cfg.get("names", {}),
               "channels": channels, "breakouts": breakouts, "own": own},
              open(OUT, "w"), indent=2)
    print(f"breakouts: {len(breakouts)} watched, {len(own)} of your own")


if __name__ == "__main__":
    main()
