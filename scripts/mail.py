#!/usr/bin/env python3
"""Send one email, through Resend, with nothing installed.

Why this exists
---------------
The Gmail connector everyone already has can create a draft but cannot send
one. That is fine for a recap you want to glance at before it goes anywhere,
and it is the wrong shape for "put the day in my inbox at 9pm without asking".
So there is a second path, and it is deliberately the boring one: an HTTPS POST
to Resend with a key you own, using only the standard library.

Setup is two lines in .env:

    RESEND_API_KEY=re_...
    JARVIS_MAIL_FROM=jarvis@yourdomain.com     # a domain verified in Resend

The `from` address has to be on a domain you have verified with Resend. There
is no way around that and it is not a Jarvis limitation; every provider works
this way, because otherwise anyone could send as anyone.

Usage:
    python3 scripts/mail.py --to me@example.com --subject "..." --file report.md
    echo "body" | python3 scripts/mail.py --to me@example.com --subject "..."

Exits non-zero and prints the reason on failure, so a caller can tell the
difference between "sent" and "silently did nothing". That distinction is the
entire point of the script: a delivery step that fails quietly is worse than
no delivery step, because you stop checking the file.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_config  # noqa: E402

API = "https://api.resend.com/emails"


def send(to, subject, body, sender=None, key=None):
    key = key or jarvis_config.env("RESEND_API_KEY")
    sender = sender or jarvis_config.env("JARVIS_MAIL_FROM")
    if not key:
        raise SystemExit("no RESEND_API_KEY in the environment or .env")
    if not sender:
        raise SystemExit("no from address: set JARVIS_MAIL_FROM in .env, on a "
                         "domain you have verified with Resend")
    if not to:
        raise SystemExit("no recipient")

    payload = json.dumps({
        "from": sender,
        "to": [to] if isinstance(to, str) else list(to),
        "subject": subject,
        # Markdown reads fine as plain text, which is the point of writing the
        # journal in markdown. No HTML, so there is no template to maintain and
        # nothing to render wrong in a client we have never seen.
        "text": body,
    }).encode()

    req = urllib.request.Request(
        API, data=payload, method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:400]
        raise SystemExit(f"resend refused it ({e.code}): {detail}")
    except urllib.error.URLError as e:
        raise SystemExit(f"could not reach resend: {e.reason}")


def main():
    ap = argparse.ArgumentParser(description="Send one email via Resend.")
    ap.add_argument("--to", required=True)
    ap.add_argument("--subject", required=True)
    ap.add_argument("--from", dest="sender", default=None)
    ap.add_argument("--file", default=None, help="body file; omit to read stdin")
    a = ap.parse_args()

    body = open(a.file).read() if a.file else sys.stdin.read()
    if not body.strip():
        raise SystemExit("refusing to send an empty body")

    res = send(a.to, a.subject, body, a.sender)
    print(f"sent to {a.to} (id {res.get('id', '?')})")


if __name__ == "__main__":
    main()
