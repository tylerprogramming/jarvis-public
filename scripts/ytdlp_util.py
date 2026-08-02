"""Shared yt-dlp helpers.

YouTube regularly breaks one yt-dlp extraction path while leaving others
working, and an out-of-date yt-dlp fails in exactly this way ("The page needs
to be reloaded"). So every detail fetch tries the default client and then falls
back to the android client before giving up. That single retry is the
difference between a dashboard full of numbers and a dashboard full of zeroes.
"""
import json
import os
import subprocess
import sys

FALLBACK_CLIENTS = [None, "android", "ios"]

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def binary():
    """The bundled copy wins over PATH.

    A user can easily end up with a stale yt-dlp earlier on PATH than a current
    one, and it fails every request while still answering --version. If Jarvis
    installed its own, use that and stop guessing.
    """
    override = os.environ.get("JARVIS_YTDLP")
    if override and os.path.exists(override):
        return override
    bundled = os.path.join(_ROOT, "bin", "yt-dlp")
    return bundled if os.access(bundled, os.X_OK) else "yt-dlp"


def _run(args, timeout):
    try:
        r = subprocess.run(
            [binary(), "--no-warnings", "--ignore-config", *args],
            capture_output=True, text=True, timeout=timeout,
        )
        return r.stdout.strip(), r.returncode
    except FileNotFoundError:
        print("yt-dlp not found. Install a known-good copy with: jarvis ytdlp install",
              file=sys.stderr)
        return "", 1
    except subprocess.TimeoutExpired:
        print("yt-dlp timed out", file=sys.stderr)
        return "", 1


def lines(args, timeout=180):
    out, _ = _run(args, timeout)
    return out.splitlines() if out else []


def channel_dump(handle, limit=12, timeout=240):
    """Channel metadata plus a flat list of recent uploads, in one request."""
    if not handle:
        return {}
    if not handle.startswith(("@", "channel/", "c/", "user/", "http")):
        handle = "@" + handle
    url = handle if handle.startswith("http") else f"https://www.youtube.com/{handle}/videos"
    out, code = _run(
        [url, "--flat-playlist", "--playlist-end", str(limit), "--dump-single-json"],
        timeout,
    )
    if code != 0 or not out:
        return {}
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {}


def video_details(video_ids, timeout=300):
    """Views, upload date, and duration per video, retrying across clients."""
    if not video_ids:
        return {}
    urls = [f"https://www.youtube.com/watch?v={i}" for i in video_ids]
    fmt = "%(id)s\t%(title)s\t%(view_count)s\t%(upload_date)s\t%(duration)s\t%(channel_follower_count)s"

    for client in FALLBACK_CLIENTS:
        args = ["--skip-download", "--print", fmt]
        if client:
            args += ["--extractor-args", f"youtube:player_client={client}"]
        out, _ = _run([*args, *urls], timeout)
        rows = {}
        for ln in out.splitlines():
            p = ln.split("\t")
            if len(p) < 5 or p[0] in ("NA", ""):
                continue
            rows[p[0]] = {
                "id": p[0],
                "title": p[1],
                "views": _int(p[2]),
                "upload_date": "" if p[3] in ("NA", "") else p[3],
                "duration": _float(p[4]),
                "subs": _int(p[5]) if len(p) > 5 else None,
            }
        if rows:
            return rows
    return {}


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0
