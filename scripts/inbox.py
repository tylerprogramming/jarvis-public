#!/usr/bin/env python3
"""Talk to Jarvis from your phone: a Telegram bridge that never opens a port.

Why this exists
---------------
notify.py is Jarvis talking to you. This is the reverse: you, on your phone,
talking to Jarvis. It is the same bot and the same two secrets in .env
(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID), so if reports already reach your
phone there is nothing new to set up. Run `jarvis inbox start` and reply to
the bot.

How it stays safe
-----------------
The server keeps binding 127.0.0.1. There is no webhook, no tunnel, no port
forward and no inbound connection of any kind. This process makes OUTBOUND
requests only: it long-polls Telegram's getUpdates (an HTTPS GET that Telegram
holds open for up to 50 seconds), forwards a message to
http://127.0.0.1:<port>/api/chat on this machine, and posts the answer back
with sendMessage. Nothing on the internet can reach the server through it,
because nothing is listening.

That leaves one boundary, and it is the whole security of this feature:
/api/chat reaches a brain that can read files and run commands (see
docs/SECURITY.md), so a message is forwarded ONLY when it comes from a chat id
on the allow-list. The list is TELEGRAM_CHAT_ID, the chat reports already go
to, plus anything in TELEGRAM_ALLOWED_CHAT_IDS (comma separated). Every other
sender is dropped without a reply: not an error, not a "who are you", nothing,
because an acknowledgement tells a stranger that the bot is live and which
messages it reacts to. The drop is logged locally as `ignored <id>` so you can
see it happened. A bot's username is public and anyone can message it; the
allow-list is what makes that harmless.

Nothing polls unless you start it. `jarvis inbox start` runs this detached;
`jarvis inbox install` writes a launchd or cron keep-alive so it survives a
reboot, and only when you ask.

What it handles itself, without the brain
-----------------------------------------
    /new            forget the running conversation and start a fresh one
    /status         one line each: the brain, agents needing attention, the poller
    /run <agent>    start an agent now, same as clicking it on the ring
    /start, /help   what the bridge answers to

Everything else, including "remember that ..." and "/forget ...", goes to
/api/chat exactly as if typed into the HUD; the server answers the memory
commands itself and spawns the brain for the rest. Replies are sent through
notify.py's Telegram path (chunked under 4096, Markdown first, plain text on a
400), so a long answer arrives as several messages rather than one cut short.

State and logs
--------------
data/inbox.json  the getUpdates offset (so a restart never replays a message),
                 the per-chat session id, the last poll time and the bot name
data/inbox.pid   written by `jarvis inbox start`, read by stop and status
data/logs/inbox.log  one line per event with the chat id; never the token

Flags
-----
    --once      one poll, handle what came, exit (what the tests use)
    --dry-run   read a getUpdates response (or a bare list of updates) from
                stdin, print what would be forwarded and replied, and call
                nothing: no Telegram, no server. Add --local to really call
                /api/chat while still sending nothing to Telegram.
    --timeout N seconds Telegram holds each poll open (default 50)

TELEGRAM_API_BASE overrides https://api.telegram.org so a test can point every
call at a loopback stub. JARVIS_PORT and JARVIS_TOKEN are read the same way the
server reads them.
"""
import argparse
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_config  # noqa: E402
import notify  # noqa: E402

DATA = os.path.join(jarvis_config.ROOT, "data")
STATE_FILE = os.path.join(DATA, "inbox.json")
LOG_FILE = os.path.join(DATA, "logs", "inbox.log")

# How long one /api/chat turn may take before the bridge gives up on it. A
# brain turn that reads a few files and thinks is a minute or two; the agent
# runner's own timeout is 45 minutes, and a phone conversation should never
# wait that long, so this sits well under it.
CHAT_TIMEOUT = 600

# Telegram's "typing..." indicator lasts about five seconds per call, so it
# is re-sent on this interval while the brain is working.
TYPING_EVERY = 4

MAX_BACKOFF = 60

USAGE = ("Jarvis inbox. Say anything and it goes to the HUD chat.\n"
         "/new  start a fresh conversation\n"
         "/status  brain, agents, poller\n"
         "/run <agent>  start an agent now")


# --- small helpers -------------------------------------------------------------

def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())


def log(line):
    """Append one timestamped line. Every message is scrubbed so a Telegram
    error that echoes the request URL cannot put the token on disk."""
    text = f"{now_iso()} {notify.scrub(line)}"
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(text + "\n")
    except OSError:
        pass
    print(text, flush=True)


def load_state():
    st = jarvis_config.read_json(STATE_FILE, {})
    st.setdefault("offset", 0)
    st.setdefault("sessions", {})
    return st


def save_state(st):
    """Atomic replace: a poll that dies mid-write must not leave a truncated
    file, because a missing offset replays every message Telegram still holds."""
    os.makedirs(DATA, exist_ok=True)
    # same shape as writeJsonAtomic in lib/util.js, and a name .gitignore
    # already covers, so a poller killed mid-write leaves nothing git sees
    tmp = os.path.join(DATA, f".inbox.json.{os.getpid()}.tmp.json")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, indent=2)
    os.replace(tmp, STATE_FILE)


def allowed_chat_ids():
    """TELEGRAM_CHAT_ID plus TELEGRAM_ALLOWED_CHAT_IDS, as strings, deduped.
    Compared as strings because Telegram ids are integers that JSON may hand
    back either way and an int/str mismatch here would silently drop the
    operator's own messages."""
    ids = []
    for raw in (jarvis_config.env("TELEGRAM_CHAT_ID"), jarvis_config.env("TELEGRAM_ALLOWED_CHAT_IDS")):
        for part in str(raw or "").split(","):
            part = part.strip()
            if part and part not in ids:
                ids.append(part)
    return ids


def preview(text, n=80):
    one = " ".join(str(text).split())
    return one if len(one) <= n else one[:n - 3] + "..."


def jarvis_base():
    port = jarvis_config.env("JARVIS_PORT") or (jarvis_config.load().get("server") or {}).get("port") or 4747
    return f"http://127.0.0.1:{int(port)}"


def jarvis_headers(extra=None):
    h = {"User-Agent": "jarvis-inbox"}
    token = jarvis_config.env("JARVIS_TOKEN")
    if token:
        h["X-Jarvis-Token"] = token
    h.update(extra or {})
    return h


# --- Telegram --------------------------------------------------------------------
# Every call is a GET or POST to <base>/bot<token>/<method>. The three the
# bridge uses: getMe (once, for the name), getUpdates (the long poll),
# sendChatAction (typing), and sendMessage through notify.py.

class TelegramError(Exception):
    def __init__(self, status, text):
        super().__init__(f"telegram ({status}): {text}")
        self.status = status


def tg_call(method, payload=None, timeout=30):
    url = notify.telegram_api(method)
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET",
                                 headers={"Content-Type": "application/json", "User-Agent": "jarvis-inbox"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = json.loads(r.read().decode("utf-8", "replace") or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        try:
            detail = json.loads(detail).get("description") or detail
        except ValueError:
            pass
        raise TelegramError(e.code, detail)
    if not body.get("ok"):
        raise TelegramError(body.get("error_code", 0), body.get("description", "not ok"))
    return body.get("result")


def get_updates(offset, timeout):
    # allowed_updates narrows what Telegram sends to plain messages: no edits,
    # no channel posts, no membership changes, none of which the bridge acts on.
    payload = {"offset": offset, "timeout": timeout, "allowed_updates": ["message"]}
    return tg_call("getUpdates", payload, timeout=timeout + 15) or []


class Typing:
    """Keeps the 'typing...' indicator alive while the brain works. Failures
    are ignored: a missing indicator is not worth a log line."""

    def __init__(self, chat_id, enabled=True):
        self.chat_id = chat_id
        self.enabled = enabled
        self.stop = threading.Event()

    def _tick(self):
        while not self.stop.is_set():
            try:
                tg_call("sendChatAction", {"chat_id": self.chat_id, "action": "typing"}, timeout=10)
            except (TelegramError, urllib.error.URLError, OSError, ValueError):
                pass
            self.stop.wait(TYPING_EVERY)

    def __enter__(self):
        if self.enabled:
            self.thread = threading.Thread(target=self._tick, daemon=True)
            self.thread.start()
        return self

    def __exit__(self, *_):
        self.stop.set()


# --- the local server ------------------------------------------------------------

def chat(message, session_id):
    """POST one turn to /api/chat and read the SSE stream to its end.
    Returns (result_text, session_id, error). Tool and delta events are
    read and discarded: the phone gets the finished answer, not a stream."""
    body = {"message": message}
    if session_id:
        body["sessionId"] = session_id
    req = urllib.request.Request(jarvis_base() + "/api/chat", data=json.dumps(body).encode(), method="POST",
                                 headers=jarvis_headers({"Content-Type": "application/json"}))
    result, session, error = None, session_id, None
    with urllib.request.urlopen(req, timeout=CHAT_TIMEOUT) as r:
        if "text/event-stream" not in (r.headers.get("Content-Type") or ""):
            raw = r.read().decode("utf-8", "replace")
            try:
                error = json.loads(raw).get("error") or raw[:200]
            except ValueError:
                error = raw[:200]
            return None, session, error
        event, data = None, []
        for raw_line in r:
            line = raw_line.decode("utf-8", "replace").rstrip("\r\n")
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                data.append(line[5:].strip())
            elif line == "":
                if event:
                    try:
                        payload = json.loads("\n".join(data) or "{}")
                    except ValueError:
                        payload = {}
                    if event == "session" and payload.get("sessionId"):
                        session = payload["sessionId"]
                    elif event == "done":
                        result = payload.get("result") or ""
                        session = payload.get("sessionId") or session
                    elif event == "error":
                        error = str(payload.get("code") or payload)
                event, data = None, []
    return result, session, error


def get_json(path, timeout=60):
    req = urllib.request.Request(jarvis_base() + path, headers=jarvis_headers())
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace") or "{}")


def post_json(path, payload, timeout=60):
    req = urllib.request.Request(jarvis_base() + path, data=json.dumps(payload).encode(), method="POST",
                                 headers=jarvis_headers({"Content-Type": "application/json"}))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace") or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace") or "{}")
        except ValueError:
            return e.code, {}


def server_error(e):
    """One short human line for a failed local call, so the phone says
    'the HUD is not running' rather than a Python traceback."""
    if isinstance(e, urllib.error.HTTPError):
        if e.code == 401:
            return "the server wants a token: put the same JARVIS_TOKEN in .env for the bridge"
        return f"the server answered {e.code}"
    if isinstance(e, urllib.error.URLError):
        return f"cannot reach Jarvis at {jarvis_base()} (is `jarvis start` running?)"
    return f"cannot reach Jarvis at {jarvis_base()}: {e}"


# --- the local commands -----------------------------------------------------------

def cmd_status(st):
    try:
        status = get_json("/api/status")
        agents = get_json("/api/agents")
    except (urllib.error.URLError, OSError, ValueError) as e:
        return server_error(e)
    brain = (status.get("brain") or {}).get("active") or "none"
    rows = [a for a in agents.get("agents", []) if a.get("enabled") and a.get("id") != "runner"]
    bad = [a for a in rows if ((a.get("health") or {}).get("state") or "ok") != "ok"]
    running = [a["id"] for a in rows if a.get("running")]
    lines = [f"brain: {brain}"]
    if bad:
        lines.append(f"agents: {len(bad)} of {len(rows)} need attention: "
                     + ", ".join(f"{a['id']} {a['health']['state']}" for a in bad))
    else:
        lines.append(f"agents: {len(rows)} enabled, all ok")
    if running:
        lines.append("running now: " + ", ".join(running))
    last = st.get("last_poll")
    lines.append(f"inbox: polling since {st.get('started') or '?'}, last poll {last or 'never'}")
    return "\n".join(lines)


def cmd_run(name):
    name = name.strip()
    if not name:
        return "usage: /run <agent>"
    try:
        code, body = post_json("/api/agents/run", {"name": name})
    except (urllib.error.URLError, OSError, ValueError) as e:
        return server_error(e)
    if body.get("started"):
        return f"started {body['started']}"
    return f"could not start {name}: {body.get('error') or f'HTTP {code}'}"


def cmd_new(st, chat_id):
    """A phone turn shares the server's running session (the server records
    whichever session answered last), so a fresh start has to reset both the
    per-chat id here and data/session.json there, or the next message would
    quietly rejoin the old conversation."""
    st["sessions"].pop(str(chat_id), None)
    try:
        post_json("/api/chat/reset", {})
    except (urllib.error.URLError, OSError, ValueError) as e:
        return f"new conversation here, but {server_error(e)}"
    return "new conversation"


# --- one message -------------------------------------------------------------------

def answer(st, chat_id, text, opts):
    """Decide what to say back to one allowed message. Returns the reply
    text, or None when there is nothing to send."""
    stripped = text.strip()
    lower = stripped.lower()
    if lower in ("/start", "/help"):
        return USAGE
    if lower == "/new":
        return cmd_new(st, chat_id) if not opts.dry or opts.local else "new conversation"
    if lower == "/status":
        return cmd_status(st) if not opts.dry or opts.local else "(would fetch /api/status and /api/agents)"
    if lower.startswith("/run"):
        return cmd_run(stripped[4:]) if not opts.dry or opts.local else f"(would POST /api/agents/run {stripped[4:].strip()})"

    if opts.dry and not opts.local:
        return f"(would forward to /api/chat: {preview(stripped)})"
    session = st["sessions"].get(str(chat_id))
    try:
        with Typing(chat_id, enabled=not opts.dry):
            result, session, error = chat(stripped, session)
    except (urllib.error.URLError, OSError, ValueError) as e:
        return server_error(e)
    if session:
        st["sessions"][str(chat_id)] = session
    if error and not result:
        return f"Jarvis could not answer: {error}"
    if result is None:
        return "Jarvis gave no answer."
    return result.strip() or "(empty answer)"


def reply(chat_id, text, opts):
    if opts.dry:
        print(f"[dry-run] reply to {chat_id}:\n  " + text.replace("\n", "\n  "))
        return
    try:
        n = notify.send_telegram_text(text, chat_id)
        log(f"chat {chat_id} jarvis: {preview(text)} ({n} message(s))")
    except SystemExit as e:
        # notify.py reports a refused send by exiting; here it is one failed
        # reply, logged, and the poll goes on
        log(f"chat {chat_id} reply FAILED: {e}")


def handle_update(st, update, opts, allowed):
    msg = update.get("message") or {}
    chat_obj = msg.get("chat") or {}
    chat_id = chat_obj.get("id")
    if chat_id is None:
        return
    if str(chat_id) not in allowed:
        # No reply on purpose. See the docstring: an acknowledgement is
        # information, and a stranger gets none.
        log(f"ignored {chat_id}")
        return
    text = msg.get("text")
    if not text:
        log(f"chat {chat_id} non-text message, skipped")
        reply(chat_id, "text only here for now", opts)
        return
    log(f"chat {chat_id} you: {preview(text)}")
    out = answer(st, chat_id, text, opts)
    if out:
        reply(chat_id, out, opts)


def process(st, updates, opts, allowed):
    for u in updates:
        try:
            uid = int(u.get("update_id", 0))
        except (TypeError, ValueError):
            uid = 0
        try:
            handle_update(st, u, opts, allowed)
        except Exception as e:  # one bad update must not stop the poller
            log(f"update {uid} failed: {type(e).__name__}: {e}")
        # advance past this update even when it failed: retrying the same
        # message forever is how a poller wedges
        if uid and not opts.dry:
            st["offset"] = max(st.get("offset", 0), uid + 1)
            save_state(st)


# --- main loop -----------------------------------------------------------------------

def poll_forever(st, opts, allowed):
    backoff = 1
    while True:
        try:
            updates = get_updates(st.get("offset", 0), opts.timeout)
            st["last_poll"] = now_iso()
            save_state(st)
            backoff = 1
        except TelegramError as e:
            if e.status == 401:
                log("telegram refused the token (401); check TELEGRAM_BOT_TOKEN in .env. exiting")
                return 1
            # 409 is another poller or a webhook on the same bot; Telegram
            # allows exactly one reader
            log(f"poll failed: {e}; retrying in {backoff}s")
            time.sleep(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF)
            continue
        except (urllib.error.URLError, OSError, ValueError) as e:
            log(f"poll failed: {e}; retrying in {backoff}s")
            time.sleep(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF)
            continue
        process(st, updates, opts, allowed)
        if opts.once:
            return 0


def main():
    ap = argparse.ArgumentParser(description="Forward Telegram messages from allowed chats to the local Jarvis.")
    ap.add_argument("--once", action="store_true", help="one poll, then exit")
    ap.add_argument("--dry-run", dest="dry", action="store_true",
                    help="read updates from stdin, print what would happen, call nothing")
    ap.add_argument("--local", action="store_true", help="with --dry-run: really call the local server")
    ap.add_argument("--timeout", type=int, default=50, help="long-poll seconds (default 50)")
    opts = ap.parse_args()
    if opts.once and opts.timeout == 50:
        opts.timeout = 0  # a single poll should return what is pending and exit

    allowed = allowed_chat_ids()
    missing = [k for k in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID") if not jarvis_config.env(k)]
    if missing and not opts.dry:
        raise SystemExit(f"inbox is not configured: set {', '.join(missing)} in .env "
                         "(docs/NOTIFY.md, Telegram; jarvis notify telegram-id finds the chat id)")
    if not allowed:
        raise SystemExit("no allowed chat id: set TELEGRAM_CHAT_ID in .env")

    st = load_state()

    if opts.dry:
        raw = sys.stdin.read()
        try:
            body = json.loads(raw or "[]")
        except ValueError as e:
            raise SystemExit(f"--dry-run expects a getUpdates JSON body on stdin: {e}")
        updates = body.get("result", []) if isinstance(body, dict) else body
        print(f"[dry-run] allowed chat ids: {', '.join(allowed)}; {len(updates)} update(s)")
        process(st, updates, opts, allowed)
        if opts.local:
            save_state(st)  # a real /new or a real session id is worth keeping
        return 0

    try:
        me = tg_call("getMe", timeout=20)
        st["bot"] = me.get("username") or ""
    except TelegramError as e:
        if e.status == 401:
            raise SystemExit("telegram refused the token (401): check TELEGRAM_BOT_TOKEN in .env")
        log(f"getMe failed: {e}")
    except (urllib.error.URLError, OSError, ValueError) as e:
        log(f"getMe failed: {e}")
    st["started"] = now_iso()
    st["pid"] = os.getpid()
    save_state(st)
    log(f"polling as @{st.get('bot') or '?'} for chat(s) {', '.join(allowed)} -> {jarvis_base()}")
    try:
        return poll_forever(st, opts, allowed)
    except KeyboardInterrupt:
        log("stopped")
        return 0


if __name__ == "__main__":
    sys.exit(main())
