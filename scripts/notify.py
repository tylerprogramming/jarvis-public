#!/usr/bin/env python3
"""Post a markdown report to a chat channel, with nothing installed.

Why this exists
---------------
mail.py covers "put it in my inbox". This covers "ping me where I already
look": a Discord channel, a Telegram chat, a Slack channel, an ntfy topic, or
whatever else accepts a JSON POST. Every one of these is a single HTTPS
request with a secret you own, so it is done the same way as mail.py, with
the standard library and nothing else.

Nothing here runs unless you ask for it. Delivery is opt-in twice over: the
provider needs its keys in .env, and something has to call this script with
`--via`. There is no default provider and no "send to everything configured".

Setup is one or two lines in .env per provider:

    DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
    TELEGRAM_BOT_TOKEN=123456:ABC...        TELEGRAM_CHAT_ID=-100...
    SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
    NTFY_TOPIC=your-topic                   NTFY_URL=https://ntfy.sh (default)
    NOTIFY_WEBHOOK_URL=https://example.com/hook

Usage:
    python3 scripts/notify.py --via discord --title "Brief" --file report.md
    python3 scripts/notify.py --via telegram --file report.md --mode summary
    echo "body" | python3 scripts/notify.py --via telegram,ntfy
    python3 scripts/notify.py --via slack --test            # one-line ping
    python3 scripts/notify.py --via discord --dry-run --file report.md

--mode is how the agent runner calls this after a run: the message is
composed from the report file by code, never by the model. summary is the
title, the standalone first line and the path; full is the body cut at the
provider's limit; link is the title and a HUD link (same machine only).

Exits non-zero and prints the reason on failure, including the HTTP status
and the start of the response body, so a caller can tell "delivered" from
"quietly did nothing". A delivery step that fails silently is worse than no
delivery step, because you stop checking the file.

Long reports are split into chunks under each platform's limit and sent in
order. Markdown is passed through as written: Discord and Telegram render
most of it, Slack renders some, ntfy renders it when told to. No provider
gets a converted or escaped copy, because the report was written to read
fine as plain text and a half-converted one reads worse.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_config  # noqa: E402

# One entry per provider: the env vars that make it configured, and a one
# line hint for the CLI when they are missing. Order is the display order.
PROVIDERS = {
    "discord": {"env": ["DISCORD_WEBHOOK_URL"],
                "hint": "a channel webhook URL"},
    "telegram": {"env": ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
                 "hint": "a bot token from @BotFather and the chat id to post to"},
    "slack": {"env": ["SLACK_WEBHOOK_URL"],
              "hint": "an incoming webhook URL"},
    "ntfy": {"env": ["NTFY_TOPIC"],
             "hint": "a topic name (NTFY_URL optional, defaults to ntfy.sh)"},
    "webhook": {"env": ["NOTIFY_WEBHOOK_URL"],
                "hint": "any URL that accepts a JSON POST of {title, text}"},
}

# Platform hard limits, with Slack chunked well under its real ceiling
# because one 40k message is unreadable in a channel anyway.
LIMITS = {"discord": 2000, "telegram": 4096, "slack": 3000, "ntfy": 4096}

# Set by --dry-run. Every request goes through one function so a dry run can
# print exactly what would leave the machine, headers and body, and send
# nothing.
DRY_RUN = False


def configured(name):
    """Which of a provider's env vars are missing. Empty list means ready."""
    return [k for k in PROVIDERS[name]["env"] if not jarvis_config.env(k)]


def redact(s):
    """Hide the secret part of a URL or token in dry-run output, so a pasted
    terminal session does not leak the webhook it was checking. A URL keeps
    its host so you can see which service it is going to."""
    s = str(s)
    if "://" in s:
        scheme, _, rest = s.partition("://")
        host, _, tail = rest.partition("/")
        return f"{scheme}://{host}/..." + (tail[-4:] if len(tail) > 8 else "")
    return s if len(s) <= 12 else s[:8] + "..." + s[-4:]


# Every env var that is a secret rather than an address. Telegram's token is
# not a URL but ends up inside one (api.telegram.org/bot<TOKEN>/...), so the
# URL path is not enough on its own; the token is replaced wherever it shows.
SECRET_VARS = ("DISCORD_WEBHOOK_URL", "SLACK_WEBHOOK_URL", "TELEGRAM_BOT_TOKEN",
               "NOTIFY_WEBHOOK_URL", "NTFY_TOKEN")


def scrub(text):
    """Replace every configured secret in `text` with its redacted form. Used
    on dry-run output AND on every error message, because urllib's own error
    text, and Telegram's, can echo the URL that failed."""
    text = str(text)
    for k in SECRET_VARS:
        v = jarvis_config.env(k)
        if v and len(str(v)) >= 8 and str(v) in text:
            text = text.replace(str(v), redact(v))
    return text


def request(url, data, headers, label):
    """POST once. Returns (status, body_text). Raises SystemExit with the
    status and a body snippet on any HTTP or network failure."""
    if DRY_RUN:
        print(f"[dry-run] {label}")
        print(f"  POST {scrub(url)}")
        for k, v in headers.items():
            print(f"  {k}: {scrub(v) if k.lower() == 'authorization' else v}")
        body = data.decode("utf-8", "replace")
        print("  " + body.replace("\n", "\n  "))
        return 200, ""
    req = urllib.request.Request(url, data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        raise SystemExit(scrub(f"{label} refused it ({e.code}): {detail}"))
    except urllib.error.URLError as e:
        raise SystemExit(scrub(f"could not reach {label}: {e.reason}"))
    except (OSError, ValueError) as e:
        raise SystemExit(scrub(f"could not reach {label}: {e}"))


def post_json(url, payload, label, extra_headers=None):
    headers = {"Content-Type": "application/json", "User-Agent": "jarvis-notify"}
    headers.update(extra_headers or {})
    return request(url, json.dumps(payload).encode(), headers, label)


def chunks(text, limit):
    """Split on paragraph, then line, then hard, so a long report arrives as
    several readable messages rather than one truncated one."""
    out = []
    rest = text
    while len(rest) > limit:
        cut = rest.rfind("\n\n", 0, limit)
        if cut < limit // 2:
            cut = rest.rfind("\n", 0, limit)
        if cut < limit // 2:
            cut = limit
        out.append(rest[:cut].rstrip())
        rest = rest[cut:].lstrip("\n")
    if rest.strip():
        out.append(rest)
    return out


def body_with_title(title, body, heading="**{}**"):
    """Chat channels have no subject line, so the title goes on top."""
    return f"{heading.format(title)}\n\n{body}" if title else body


# --- what to send ------------------------------------------------------------
# Deterministic extraction, no model. The runner in lib/agents.js hands over
# the file the agent wrote and a mode; the message is derived from the file
# by string operations, so the same file always produces the same message.

MODES = ("summary", "full", "link")

# Where the HUD serves a document from. Only meaningful on the machine that
# runs Jarvis; the link mode says so in its docstring and in the docs.
HUD_URL = "http://127.0.0.1:4747"


def split_frontmatter(text):
    """(meta dict, body) for a markdown file with a --- block on top. The
    meta parser is deliberately tiny: `key: value` scalars only, which is all
    the document convention writes."""
    if not text.startswith("---\n"):
        return {}, text.strip()
    end = text.find("\n---", 4)
    if end < 0:
        return {}, text.strip()
    meta = {}
    for line in text[4:end].split("\n"):
        if ":" in line and not line.startswith(("#", " ", "\t")):
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip().strip('"').strip("'")
    rest = text[end + 4:]
    return meta, rest.lstrip("\n").strip()


def first_line(body):
    """The first non-empty line after the frontmatter, which the document
    convention asks agents to write as a standalone one-line summary. A
    heading is stripped of its hashes; a bare rule or fence is skipped."""
    for line in body.split("\n"):
        s = line.strip()
        if not s or s.startswith("```") or set(s) <= set("-=*_ "):
            continue
        return s.lstrip("#").strip()
    return ""


def shown_path(path):
    """A path as the operator will recognise it: relative to the repo when it
    is inside it, else as given."""
    root = os.path.abspath(jarvis_config.ROOT)
    p = os.path.abspath(path)
    return os.path.relpath(p, root) if p.startswith(root + os.sep) else path


def hud_link(path):
    root = os.path.abspath(jarvis_config.ROOT)
    p = os.path.abspath(path)
    rel = os.path.relpath(p, root) if p.startswith(root + os.sep) else p
    return f"{HUD_URL}/?doc={urllib.parse.quote(rel, safe='/')}"


def compose(mode, title, text, path, limit=None):
    """(title, body) for one provider, from the file's text and the mode.

    summary  the title, the standalone first line, and where the file is
    full     the body with the frontmatter stripped, cut at the provider's
             limit with a '(N more lines in <path>)' tail
    link     the title and a HUD link to the document
    """
    meta, body = split_frontmatter(text)
    title = title or meta.get("title") or ""
    where = shown_path(path) if path else ""
    if mode == "summary":
        lines = [l for l in (first_line(body), where) if l]
        return title, "\n".join(lines) if lines else body[:200]
    if mode == "link":
        return title, hud_link(path) if path else body[:200]
    if mode == "full":
        if limit is None or len(body) + len(title) + 4 <= limit:
            return title, body
        # leave room for the title line and the tail
        room = max(limit - len(title) - 60, limit // 2)
        kept = body[:room]
        cut = kept.rfind("\n")
        if cut > room // 2:
            kept = kept[:cut]
        more = body[len(kept):].count("\n")
        return title, kept.rstrip() + f"\n\n({more} more line{'s' if more != 1 else ''} in {where or 'the file'})"
    raise SystemExit(f"unknown mode '{mode}'; known: {', '.join(MODES)}")


# --- providers ---------------------------------------------------------------
# Each takes (title, body) and returns a short human string on success.
# Each raises SystemExit with the reason on failure. Request shapes:
#   discord   POST <webhook>              {"content": ...}
#   telegram  POST api.telegram.org/bot<token>/sendMessage
#                                         {"chat_id": ..., "text": ..., "parse_mode": "Markdown"}
#   slack     POST <webhook>              {"text": ...}
#   ntfy      POST <url>/<topic>          text body, Title and Markdown headers
#   webhook   POST <url>                  {"title": ..., "text": ...}

def send_discord(title, body):
    url = jarvis_config.env("DISCORD_WEBHOOK_URL")
    parts = chunks(body_with_title(title, body), LIMITS["discord"])
    for i, part in enumerate(parts, 1):
        post_json(url, {"content": part}, f"discord ({i}/{len(parts)})")
    return f"discord: {len(parts)} message(s)"


def telegram_api(method):
    """The URL for one Bot API method. TELEGRAM_API_BASE exists so a test
    can point every Telegram call at a loopback stub; nobody sets it
    otherwise. The bridge in inbox.py builds its URLs through this too, so
    the two scripts cannot disagree about where Telegram is."""
    base = (jarvis_config.env("TELEGRAM_API_BASE") or "https://api.telegram.org").rstrip("/")
    token = jarvis_config.env("TELEGRAM_BOT_TOKEN")
    return f"{base}/bot{token}/{method}"


def send_telegram_text(text, chat_id=None):
    """Send `text` to one chat, chunked under the limit, Markdown first and
    plain on a 400. This is the whole Telegram send path; send_telegram()
    below is the provider wrapper the report runner uses, and inbox.py
    calls this directly to answer a message from the operator's phone.
    Returns the number of messages sent; raises SystemExit on failure."""
    chat = chat_id if chat_id is not None else jarvis_config.env("TELEGRAM_CHAT_ID")
    url = telegram_api("sendMessage")
    parts = chunks(text, LIMITS["telegram"])
    for i, part in enumerate(parts, 1):
        label = f"telegram ({i}/{len(parts)})"
        # Telegram's Markdown parser rejects the whole message on one
        # unbalanced underscore or asterisk, which a report will have. Try
        # formatted first; on a 400 send the same text plain rather than
        # dropping it. A plain message beats no message.
        try:
            post_json(url, {"chat_id": chat, "text": part, "parse_mode": "Markdown"}, label)
        except SystemExit as e:
            if "(400)" not in str(e):
                raise
            post_json(url, {"chat_id": chat, "text": part}, label + " plain")
    return len(parts)


def send_telegram(title, body):
    n = send_telegram_text(body_with_title(title, body, "*{}*"))
    return f"telegram: {n} message(s)"


def send_slack(title, body):
    url = jarvis_config.env("SLACK_WEBHOOK_URL")
    parts = chunks(body_with_title(title, body, "*{}*"), LIMITS["slack"])
    for i, part in enumerate(parts, 1):
        post_json(url, {"text": part}, f"slack ({i}/{len(parts)})")
    return f"slack: {len(parts)} message(s)"


def send_ntfy(title, body):
    base = (jarvis_config.env("NTFY_URL") or "https://ntfy.sh").rstrip("/")
    topic = str(jarvis_config.env("NTFY_TOPIC") or "")
    url = f"{base}/{urllib.parse.quote(topic, safe='')}"
    headers = {"Content-Type": "text/plain; charset=utf-8", "Markdown": "yes",
               "User-Agent": "jarvis-notify"}
    if title:
        # ntfy reads headers as latin-1; anything outside that comes out as
        # question marks, so the title stays ASCII to be safe.
        headers["Title"] = title.encode("ascii", "replace").decode()
    request(url, body.encode("utf-8"), headers, "ntfy")
    return f"ntfy: posted to {topic}"


def send_webhook(title, body):
    url = jarvis_config.env("NOTIFY_WEBHOOK_URL")
    payload = {"title": title or "", "text": body}
    # when called for a file, say which one and how it was cut, so a receiver
    # can fetch the whole thing itself
    payload.update({k: v for k, v in CONTEXT.items() if v})
    post_json(url, payload, "webhook")
    return "webhook: posted"


SENDERS = {
    "discord": send_discord,
    "telegram": send_telegram,
    "slack": send_slack,
    "ntfy": send_ntfy,
    "webhook": send_webhook,
}

# Set by main() when sending a file: {file, mode}. Read by the webhook
# provider only; the chat providers have no field to put it in.
CONTEXT = {}


def send(via, title, body, mode=None, path=None):
    """Send to one provider. Refuses, with the missing var names, when it is
    not configured; that is a stated skip, not a guess.

    With a mode, `body` is the raw file text and the message is composed
    from it per provider (summary/full/link). Without one the text is sent
    as is, chunked under the provider's limit."""
    if via not in SENDERS:
        raise SystemExit(f"unknown provider '{via}'; known: {', '.join(SENDERS)}")
    missing = configured(via)
    if missing:
        raise SystemExit(f"{via} is not configured: set {', '.join(missing)} in .env "
                         f"({PROVIDERS[via]['hint']})")
    if mode:
        title, body = compose(mode, title, body, path, LIMITS.get(via))
        if not body.strip():
            raise SystemExit("refusing to send an empty body")
    return SENDERS[via](title, body)


def parse_via(values):
    """`--via a --via b,c` becomes [a, b, c], in order, without duplicates."""
    out = []
    for v in values or []:
        for name in v.split(","):
            name = name.strip().lower()
            if name and name not in out:
                out.append(name)
    return out


def main():
    global DRY_RUN
    ap = argparse.ArgumentParser(description="Post a markdown text to a chat channel.")
    ap.add_argument("--via", action="append",
                    help="provider: " + ", ".join(PROVIDERS) + " (repeat or comma-separate)")
    ap.add_argument("--title", default=None)
    ap.add_argument("--file", default=None, help="body file; omit to read stdin")
    ap.add_argument("--mode", choices=MODES, default=None,
                    help="compose the message from a report file: summary (title, first line, path), "
                         "full (body, cut at the provider limit), link (title and HUD link). "
                         "Omit to send the text as is.")
    ap.add_argument("--test", action="store_true", help="send a one-line ping instead of a body")
    ap.add_argument("--dry-run", action="store_true", help="print the request, send nothing")
    ap.add_argument("--list", action="store_true", help="show which providers are configured")
    a = ap.parse_args()
    DRY_RUN = a.dry_run

    if a.list:
        for name in PROVIDERS:
            missing = configured(name)
            print(f"  {name.ljust(9)} {'configured' if not missing else 'not set: ' + ', '.join(missing)}")
        return

    via = parse_via(a.via)
    if not via:
        raise SystemExit("no provider: pass --via <" + "|".join(PROVIDERS) + ">")

    if a.test:
        title = a.title or "Jarvis"
        body = "Jarvis notify test: this channel is wired up."
        a.mode = None
    else:
        try:
            body = open(a.file, encoding="utf-8").read() if a.file else sys.stdin.read()
        except OSError as e:
            raise SystemExit(f"cannot read {a.file}: {e.strerror or e}")
        title = a.title
        if not body.strip():
            raise SystemExit("refusing to send an empty body")
        if a.mode and a.file:
            CONTEXT.update({"file": shown_path(a.file), "mode": a.mode})

    # Send to each in turn and keep going past a failure, so one dead webhook
    # does not stop the others, then exit non-zero if any of them failed.
    failed = []
    for name in via:
        try:
            print(send(name, title, body, a.mode, a.file))
        except SystemExit as e:
            failed.append(name)
            print(f"FAIL {name}: {scrub(e)}", file=sys.stderr)
    if failed:
        raise SystemExit(f"{len(failed)} of {len(via)} failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
