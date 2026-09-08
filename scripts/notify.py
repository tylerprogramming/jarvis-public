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
    echo "body" | python3 scripts/notify.py --via telegram,ntfy
    python3 scripts/notify.py --via slack --test            # one-line ping
    python3 scripts/notify.py --via discord --dry-run --file report.md

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
LIMITS = {"discord": 2000, "telegram": 4096, "slack": 3000}

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


def request(url, data, headers, label):
    """POST once. Returns (status, body_text). Raises SystemExit with the
    status and a body snippet on any HTTP or network failure."""
    if DRY_RUN:
        shown = url
        # webhook URLs carry the secret in the path, so trim it for display
        for k in ("DISCORD_WEBHOOK_URL", "SLACK_WEBHOOK_URL", "TELEGRAM_BOT_TOKEN", "NOTIFY_WEBHOOK_URL"):
            v = jarvis_config.env(k)
            if v and v in shown:
                shown = shown.replace(v, redact(v))
        print(f"[dry-run] {label}")
        print(f"  POST {shown}")
        for k, v in headers.items():
            print(f"  {k}: {v}")
        body = data.decode("utf-8", "replace")
        print("  " + body.replace("\n", "\n  "))
        return 200, ""
    req = urllib.request.Request(url, data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        raise SystemExit(f"{label} refused it ({e.code}): {detail}")
    except urllib.error.URLError as e:
        raise SystemExit(f"could not reach {label}: {e.reason}")


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


def send_telegram(title, body):
    token = jarvis_config.env("TELEGRAM_BOT_TOKEN")
    chat = jarvis_config.env("TELEGRAM_CHAT_ID")
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    parts = chunks(body_with_title(title, body, "*{}*"), LIMITS["telegram"])
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
    return f"telegram: {len(parts)} message(s)"


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
    post_json(url, {"title": title or "", "text": body}, "webhook")
    return "webhook: posted"


SENDERS = {
    "discord": send_discord,
    "telegram": send_telegram,
    "slack": send_slack,
    "ntfy": send_ntfy,
    "webhook": send_webhook,
}


def send(via, title, body):
    """Send to one provider. Refuses, with the missing var names, when it is
    not configured; that is a stated skip, not a guess."""
    if via not in SENDERS:
        raise SystemExit(f"unknown provider '{via}'; known: {', '.join(SENDERS)}")
    missing = configured(via)
    if missing:
        raise SystemExit(f"{via} is not configured: set {', '.join(missing)} in .env "
                         f"({PROVIDERS[via]['hint']})")
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
    else:
        body = open(a.file).read() if a.file else sys.stdin.read()
        title = a.title
        if not body.strip():
            raise SystemExit("refusing to send an empty body")

    # Send to each in turn and keep going past a failure, so one dead webhook
    # does not stop the others, then exit non-zero if any of them failed.
    failed = []
    for name in via:
        try:
            print(send(name, title, body))
        except SystemExit as e:
            failed.append(name)
            print(f"FAIL {name}: {e}", file=sys.stderr)
    if failed:
        raise SystemExit(f"{len(failed)} of {len(via)} failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
