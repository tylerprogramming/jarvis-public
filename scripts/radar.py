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
import ytdlp_util  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "radar.json")


def load(path, fallback):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return fallback


def config():
    base = load(os.path.join(ROOT, "config.default.json"), {})
    user = load(os.path.join(ROOT, "config.json"), {})
    radar = dict(base.get("radar", {}))
    radar.update(user.get("radar", {}))
    return radar


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
        print("no radar channels configured - nothing to sweep")
        json.dump({"updated_at": datetime.now().isoformat(timespec="seconds"),
                   "channels": [], "breakouts": []}, open(OUT, "w"), indent=2)
        return

    per_channel = int(cfg.get("per_channel", 8))
    recent_days = int(cfg.get("recent_days", 7))
    multiple = float(cfg.get("breakout_multiple", 3.0))
    min_views = int(cfg.get("min_views", 5000))

    channels, breakouts = [], []
    for handle in channels_cfg:
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
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"updated_at": datetime.now().isoformat(timespec="seconds"),
               "channels": channels, "breakouts": breakouts},
              open(OUT, "w"), indent=2)
    print(f"breakouts: {len(breakouts)}")


if __name__ == "__main__":
    main()
