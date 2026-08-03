"""Per-post data across every platform, in one file.

Why this exists
---------------
Jarvis knew follower counts and nothing about individual posts, which meant the
postmortem could only ever judge YouTube. Followers are a scoreboard. Which post
actually worked is the thing that changes what you make next.

The contract, not the source
----------------------------
Nothing here fetches anything. `data/posts.json` is a plain list that any number
of collectors can fill, and everything downstream reads the list rather than the
collector:

  youtube    filled for free by collect.py, via yt-dlp. No key, everyone gets it.
  ig/tiktok/x    filled by the optional `social` agent through Apify, if the
                 operator pays for that.
  anything else  a script in plugins/collectors/, an official API with a key you
                 hold, or you telling Jarvis the numbers in the command bar.

So a person with no Apify still gets the postmortem and the breakout check. They
see YouTube only, which is exactly what they have today, rather than a feature
that refuses to run because one paid service is missing.

Shape of a post
---------------
    {"platform": "tiktok", "id": "7123...", "url": "https://...",
     "title": "...", "published": "2026-07-31",
     "views": 12004, "likes": 340, "comments": 12,
     "fetched_at": "2026-08-03T06:00:12"}

`views` is whatever that platform calls reach: views on YouTube and TikTok,
plays on Reels, impressions on X. It is the one field every consumer relies on,
so a collector that cannot get it should omit the post rather than write a zero.
"""
import json
import os
from datetime import datetime, date

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
POSTS = os.path.join(DATA, "posts.json")

# The metrics a consumer may rely on. Anything else a collector adds is kept.
CORE = ("platform", "id", "url", "title", "published", "views", "likes", "comments")


def load():
    try:
        with open(POSTS) as f:
            d = json.load(f)
        return d.get("posts", []) if isinstance(d, dict) else list(d)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save(posts):
    os.makedirs(DATA, exist_ok=True)
    posts = sorted(posts, key=lambda p: (p.get("published") or "", p.get("platform", "")),
                   reverse=True)
    with open(POSTS, "w") as f:
        json.dump({"updated_at": datetime.now().isoformat(timespec="seconds"),
                   "posts": posts}, f, indent=2)
    return posts


def upsert(new_posts):
    """Merge by (platform, id). Later metrics win, earlier fields survive.

    Merging rather than replacing matters because collectors run on different
    schedules and see different windows. The YouTube collector sees the last 12
    uploads; the social agent sees whatever the scraper returned this morning.
    A replace would mean whichever ran last silently deleted the other's work.
    """
    by_key = {(p.get("platform"), str(p.get("id"))): dict(p) for p in load()}
    stamp = datetime.now().isoformat(timespec="seconds")
    for p in new_posts:
        if not p.get("platform") or p.get("id") is None:
            continue
        # A missing view count is missing, not zero. Zero reads as a dead post
        # and would drag the median down for every other post on that platform.
        if p.get("views") is None:
            continue
        key = (p["platform"], str(p["id"]))
        merged = by_key.get(key, {})
        # One reading per post per day. This is what makes an honest comparison
        # possible later: lifetime views over age always flatters a new post,
        # because views front-load and then trickle, so a mature post's average
        # is dragged down by its own tail. The only real fix is to compare a
        # post against where others stood at the SAME age, and that needs a
        # series rather than a single number. Nothing else can reconstruct it,
        # so it is recorded from the first run whether or not it is used yet.
        series = list(merged.get("history") or [])
        today_str = date.today().isoformat()
        series = [o for o in series if o.get("d") != today_str]
        series.append({"d": today_str, "v": p["views"]})
        series.sort(key=lambda o: o["d"])
        merged.update({k: v for k, v in p.items() if v is not None})
        merged["history"] = series[-400:]
        merged["fetched_at"] = stamp
        by_key[key] = merged
    return save(list(by_key.values()))


def views_at_age(post, days):
    """Views this post had when it was `days` old, from its recorded series.

    None when the series does not reach that age. Deliberately does not
    extrapolate: a guessed number here becomes a confident breakout claim.
    """
    pub = (post.get("published") or "")[:10]
    if not pub or not post.get("history"):
        return None
    try:
        start = datetime.strptime(pub.replace("-", ""), "%Y%m%d").date()
    except ValueError:
        return None
    best = None
    for o in post["history"]:
        try:
            age = (datetime.strptime(o["d"], "%Y-%m-%d").date() - start).days
        except (ValueError, KeyError):
            continue
        if age <= days and (best is None or age > best[0]):
            best = (age, o.get("v"))
    # require the reading to be reasonably close to the age asked for
    return best[1] if best and best[0] >= days - 2 else None


def age_days(post, today=None):
    pub = (post.get("published") or "")[:10]
    if not pub:
        return None
    try:
        d = datetime.strptime(pub.replace("-", ""), "%Y%m%d").date()
    except ValueError:
        return None
    return max(((today or date.today()) - d).days, 1)


def velocity(post, today=None):
    """Views per day. The comparable unit across posts of different ages."""
    a = age_days(post, today)
    v = post.get("views")
    return None if a is None or v is None else v / a


def breakouts(posts=None, multiple=3.0, recent_days=7, today=None, min_mature=4):
    """Your own posts outrunning your own normal, per platform.

    Two methods, and which one was used is reported rather than hidden:

    "same-age"  compares a post against where other posts on that platform
                stood at the SAME age. This is the honest comparison, and it
                needs the observation series to have been running long enough
                to cover that age.
    "lifetime"  falls back to views over age. It systematically favours new
                posts, because a mature post's average is dragged down by its
                own long tail, so the threshold has to work harder. Flagged as
                `method: lifetime` so nobody reads it as the real thing.

    Returns [] rather than guessing when a platform has too little history. A
    median over two posts is noise, and calling noise a breakout is worse than
    saying nothing at all.
    """
    posts = load() if posts is None else posts
    out = []
    by_platform = {}
    for p in posts:
        by_platform.setdefault(p.get("platform"), []).append(p)

    for platform, group in by_platform.items():
        recent = [p for p in group
                  if (age_days(p, today) or 99999) <= recent_days
                  and p.get("views") is not None]
        older = [p for p in group if (age_days(p, today) or 0) > recent_days]
        if len(older) < min_mature:
            continue

        lifetime_med = None
        vels = sorted(v for v in (velocity(p, today) for p in older) if v is not None)
        if vels:
            lifetime_med = vels[len(vels) // 2]

        for p in recent:
            age, v = age_days(p, today), p.get("views")
            if age is None:
                continue

            # preferred: what did the others have at this same age?
            peers = sorted(x for x in (views_at_age(o, age) for o in older) if x)
            if len(peers) >= min_mature:
                med, method = peers[len(peers) // 2], "same-age"
                actual = v
            elif lifetime_med and lifetime_med > 0:
                med, method = lifetime_med, "lifetime"
                actual = velocity(p, today)
            else:
                continue

            if med > 0 and actual >= multiple * med:
                out.append({**{k: val for k, val in p.items() if k != "history"},
                            "method": method,
                            "measured": round(actual, 1),
                            "baseline": round(med, 1),
                            "multiple": round(actual / med, 1)})
    out.sort(key=lambda b: -b["multiple"])
    return out


def summary(posts=None, today=None):
    """Per-platform counts and medians, for the postmortem and weekly review."""
    posts = load() if posts is None else posts
    by_platform = {}
    for p in posts:
        by_platform.setdefault(p.get("platform"), []).append(p)
    rows = []
    for platform, group in sorted(by_platform.items()):
        vels = sorted(v for v in (velocity(p, today) for p in group) if v is not None)
        rows.append({
            "platform": platform,
            "posts": len(group),
            "median_velocity": round(vels[len(vels) // 2], 1) if vels else None,
            "newest": max((p.get("published") or "" for p in group), default=""),
        })
    return rows
