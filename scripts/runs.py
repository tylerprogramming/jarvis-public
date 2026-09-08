#!/usr/bin/env python3
"""Watchdog check: is every scheduled agent actually running?

    python3 scripts/runs.py --check     # writes data/runs-check.json, exit 1 on problems
    python3 scripts/runs.py             # same, printed only, still exits 1 on problems

Stdlib only. This is a second, independent implementation of the health model
in lib/runs.js on purpose: the watchdog agent runs it as a `pre` command, so
the check that reports "nothing has run" cannot itself depend on the Node code
it is checking. Keep the rules in step with lib/runs.js health().

Reads data/runs.json (the ledger), agents/*.md frontmatter, the OS scheduler
(launchctl on macOS, crontab on Linux, schtasks on Windows), and
data/vitals.json updated_at. Writes data/runs-check.json:

    {"checked_at": iso, "problems": [{"agent", "state", "detail", "fix"}], "ok": [names]}
"""
import json
import os
import platform
import re
import subprocess
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_config  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
LEDGER = os.path.join(DATA, "runs.json")
OUT = os.path.join(DATA, "runs-check.json")
VITALS = os.path.join(DATA, "vitals.json")
LABEL_PREFIX = "com.jarvis.agent."
MARK = "# jarvis-agent"
GRACE_MIN = 90
OLD_NAMES = {"brief": ["morning"], "journal": ["nightly"], "review": ["weekly-review"]}


# ---------- frontmatter ----------

def parse_frontmatter(raw):
    """Scalars, inline [a, b] lists, "- item" lists. Same grammar as lib/agents.js."""
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", raw, re.S)
    if not m:
        return {}, raw
    meta, key = {}, None
    for line in m.group(1).split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        item = re.match(r"^\s*-\s+(.*)$", line)
        if item and key:
            meta.setdefault(key, [])
            if not isinstance(meta[key], list):
                meta[key] = []
            meta[key].append(unquote(item.group(1)))
            continue
        kv = re.match(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$", line)
        if not kv:
            continue
        key, val = kv.group(1), kv.group(2).strip()
        if val == "":
            meta[key] = []
        elif val.startswith("[") and val.endswith("]"):
            meta[key] = [unquote(s.strip()) for s in val[1:-1].split(",") if s.strip()]
        elif val in ("true", "false"):
            meta[key] = val == "true"
        else:
            meta[key] = unquote(val)
    return meta, m.group(2)


def unquote(s):
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        return s[1:-1]
    return s


def load_agents(cfg):
    d = os.path.join(ROOT, cfg.get("agents", {}).get("dir", "agents"))
    enabled = set(cfg.get("agents", {}).get("enabled", []))
    out = []
    for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if not f.endswith(".md"):
            continue
        with open(os.path.join(d, f), encoding="utf-8") as fh:
            meta, body = parse_frontmatter(fh.read())
        name = meta.get("name") or f[:-3]
        meta["name"] = name
        meta["body"] = body
        meta["enabled"] = name in enabled
        out.append(meta)
    return out


# ---------- cron (numbers, *, lists, ranges; steps refused) ----------

def cron_field(text, lo, hi, what):
    s = text.strip()
    if s == "*":
        return set(range(lo, hi + 1))
    out = set()
    for part in s.split(","):
        if "/" in part:
            raise ValueError(f"cron {what} '{part}': step syntax is not supported")
        m = re.match(r"^(\d+)(?:-(\d+))?$", part)
        if not m:
            raise ValueError(f"cron {what} '{part}': expected a number, range or *")
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else a
        if a < lo or b > hi or a > b:
            raise ValueError(f"cron {what} '{part}': out of range {lo}-{hi}")
        out.update(range(a, b + 1))
    return out


def parse_cron(expr):
    parts = str(expr or "").split()
    if len(parts) != 5:
        raise ValueError(f"cron '{expr}': expected 5 fields")
    mi, h, dom, mo, dow = parts
    spec = {
        "minute": cron_field(mi, 0, 59, "minute"),
        "hour": cron_field(h, 0, 23, "hour"),
        "dom": cron_field(dom, 1, 31, "day of month"),
        "month": cron_field(mo, 1, 12, "month"),
        "dow": cron_field(dow, 0, 7, "day of week"),
        "any_dom": dom.strip() == "*",
        "any_dow": dow.strip() == "*",
    }
    if 7 in spec["dow"]:
        spec["dow"].add(0)
    return spec


def day_matches(spec, d):
    if d.month not in spec["month"]:
        return False
    # python weekday(): Monday 0; cron: Sunday 0
    dow_ok = (d.weekday() + 1) % 7 in spec["dow"]
    dom_ok = d.day in spec["dom"]
    if spec["any_dom"] and spec["any_dow"]:
        return True
    if spec["any_dom"]:
        return dow_ok
    if spec["any_dow"]:
        return dom_ok
    return dom_ok or dow_ok


def prev_fire(spec, now):
    t = now.replace(second=0, microsecond=0)
    for _ in range(400000):
        if not day_matches(spec, t):
            t = t.replace(hour=0, minute=0) - timedelta(minutes=1)
            continue
        if t.hour not in spec["hour"]:
            t = t.replace(minute=0) - timedelta(minutes=1)
            continue
        if t.minute not in spec["minute"]:
            t -= timedelta(minutes=1)
            continue
        return t
    return None


def next_fire(spec, frm):
    t = frm.replace(second=0, microsecond=0) + timedelta(minutes=1)
    for _ in range(400000):
        if not day_matches(spec, t):
            t = (t + timedelta(days=1)).replace(hour=0, minute=0)
            continue
        if t.hour not in spec["hour"]:
            t = (t + timedelta(hours=1)).replace(minute=0)
            continue
        if t.minute not in spec["minute"]:
            t += timedelta(minutes=1)
            continue
        return t
    return None


# ---------- scheduler ----------

def loaded(name):
    """(loaded: bool, reason: str). On macOS the plist must be loaded AND its
    node must still exist: a Homebrew upgrade removes the old Cellar path and
    every job fails silently from then on."""
    label = LABEL_PREFIX + name
    system = platform.system()
    if system == "Darwin":
        plist = os.path.expanduser(f"~/Library/LaunchAgents/{label}.plist")
        if not os.path.exists(plist):
            return False, "no launchd job (jarvis agents install)"
        with open(plist, encoding="utf-8") as fh:
            body = fh.read()
        # the program first: launchd loads a plist whose binary is gone without
        # complaint and then fails every fire, so this is the root cause to name
        m = re.search(r"<key>ProgramArguments</key>\s*<array>\s*<string>([^<]+)</string>", body)
        prog = m.group(1).strip() if m else ""
        if prog and not os.path.exists(prog):
            return False, f"plist points at a node that no longer exists: {prog} (jarvis agents install)"
        r = subprocess.run(["launchctl", "list", label], capture_output=True, text=True)
        if r.returncode != 0:
            return False, "plist exists but launchd has not loaded it (jarvis agents install)"
        return True, ""
    if system == "Windows":
        r = subprocess.run(["schtasks", "/Query", "/TN", label], capture_output=True, text=True)
        return (True, "") if r.returncode == 0 else (False, "no scheduled task (jarvis agents install)")
    r = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    tab = r.stdout if r.returncode == 0 else ""
    for line in tab.split("\n"):
        if MARK in line and f"bin/jarvis agent {name} " in line:
            return True, ""
    return False, "no crontab entry (jarvis agents install)"


# ---------- ledger ----------

def parse_iso(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone().replace(tzinfo=None)
    except Exception:
        return None


def last_run(ledger, agent):
    rows = [r for r in ledger if r.get("agent") == agent["name"]]
    if rows:
        rows.sort(key=lambda r: str(r.get("started", "")))
        r = dict(rows[-1])
        r["source"] = "ledger"
        return r
    # before the ledger existed the log was the only witness, including the
    # log under the agent's previous name (same table as lib/runs.js)
    names = [agent["name"]] + OLD_NAMES.get(agent["name"], [])
    log = next((p for p in (os.path.join(DATA, "logs", f"{n}.log") for n in names) if os.path.exists(p)), None)
    if not log:
        return None
    with open(log, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().split("\n")
    i = len(lines) - 1
    while i >= 0 and not re.match(r"^=== \S+ \d{4}-\d{2}-\d{2} \d{2}:\d{2} ===", lines[i]):
        i -= 1
    if i < 0:
        return None
    h = re.match(r"^=== \S+ (\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}) ===", lines[i])
    started = datetime(int(h.group(1)[:4]), int(h.group(1)[5:7]), int(h.group(1)[8:10]), int(h.group(2)), int(h.group(3)))
    exit_code, skipped = None, False
    for l in lines[i + 1:]:
        d = re.match(r"^=== done \(exit (-?\d+)\) ===", l)
        if d:
            exit_code = int(d.group(1))
            break
        if l.startswith("skipped:"):
            exit_code, skipped = 0, True
            break
    return {"agent": agent["name"], "started": started.isoformat(), "exit": exit_code,
            "skipped": skipped, "artifact": None, "error": None, "source": "log"}


def fmt(d):
    return d.strftime("%Y-%m-%d %H:%M") if d else "never"


# ---------- health, same rules as lib/runs.js ----------

def health(cfg, agent, ledger, now):
    timeout_min = cfg.get("agents", {}).get("timeout_minutes") or 45
    row = last_run(ledger, agent)
    last_at = parse_iso(row["started"]) if row else None
    schedule = agent.get("schedule")
    spec = None
    if schedule:
        try:
            spec = parse_cron(schedule)
        except ValueError as e:
            return {"state": "failed", "detail": str(e), "fix": f"fix the schedule in agents/{agent['name']}.md"}

    open_row = row is not None and row.get("exit") is None
    if open_row and last_at and now - last_at < timedelta(minutes=timeout_min + 10):
        return {"state": "running", "detail": f"started {fmt(last_at)}", "fix": ""}

    overdue_since = None
    if spec:
        graced = prev_fire(spec, now - timedelta(minutes=GRACE_MIN))
        if graced and (last_at is None or last_at < graced - timedelta(minutes=5)):
            overdue_since = next_fire(spec, last_at) if last_at else graced
            overdue_since = overdue_since or graced

    if spec:
        ok, reason = loaded(agent["name"])
        if not ok:
            detail = reason
            if overdue_since:
                detail += f"; overdue since {fmt(overdue_since)}"
            if not row:
                detail += "; never ran"
            return {"state": "not-loaded", "detail": detail, "fix": "jarvis agents install"}

    if overdue_since:
        return {"state": "overdue",
                "detail": f"expected {fmt(overdue_since)}, {'last ran ' + fmt(last_at) if last_at else 'never ran'}",
                "fix": "check the machine was awake and the timezone (jarvis doctor); reboot if launchd holds an old zone"}

    if not row:
        return {"state": "never", "detail": "not run yet", "fix": f"jarvis agent {agent['name']}"}

    if open_row:
        return {"state": "failed", "detail": f"started {fmt(last_at)} and never finished",
                "fix": f"open data/logs/{agent['name']}.log"}

    if row.get("exit") != 0:
        err = f": {row['error']}" if row.get("error") else ""
        return {"state": "failed", "detail": f"exit {row.get('exit')} at {fmt(last_at)}{err}",
                "fix": f"open data/logs/{agent['name']}.log"}

    writes = bool(re.search(r"\{\{(reports|journal_dir)\}\}", agent.get("body", "")))
    if row.get("source") == "ledger" and writes and not row.get("artifact") and not agent.get("quiet_ok") and not row.get("skipped"):
        return {"state": "stale", "detail": f"ran {fmt(last_at)} (exit 0) but wrote no report",
                "fix": f"open data/logs/{agent['name']}.log"}

    return {"state": "ok", "detail": f"ran {fmt(last_at)}", "fix": ""}


def vitals_problem(cfg, now):
    stale_hours = cfg.get("vitals", {}).get("stale_hours") or 36
    v = jarvis_config.read_json(VITALS, {})
    at = parse_iso(v.get("updated_at")) if v.get("updated_at") else None
    if at is None:
        return {"agent": "vitals", "state": "stale", "detail": "data/vitals.json has no updated_at", "fix": "jarvis collect --fetch"}
    age_h = (now - at).total_seconds() / 3600
    if age_h > stale_hours:
        days = age_h / 24
        return {"agent": "vitals", "state": "stale",
                "detail": f"numbers last collected {fmt(at)} ({days:.0f}d ago, limit {stale_hours}h)",
                "fix": "jarvis collect --fetch"}
    return None


def main():
    cfg = jarvis_config.load()
    now = datetime.now()
    ledger = jarvis_config.read_json(LEDGER, [])
    if not isinstance(ledger, list):
        ledger = []
    problems, ok = [], []
    for a in load_agents(cfg):
        if not a.get("enabled") or not a.get("schedule"):
            continue
        # the watchdog is what is running right now; it cannot judge itself
        if a["name"] == "watchdog":
            continue
        h = health(cfg, a, ledger, now)
        if h["state"] in ("ok", "running"):
            ok.append(a["name"])
        else:
            problems.append({"agent": a["name"], **h})
    vp = vitals_problem(cfg, now)
    if vp:
        problems.append(vp)

    result = {"checked_at": now.isoformat(timespec="seconds"), "problems": problems, "ok": ok}
    if "--check" in sys.argv:
        os.makedirs(DATA, exist_ok=True)
        tmp = OUT + f".{os.getpid()}.tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=2)
        os.replace(tmp, OUT)

    for p in problems:
        print(f"{p['agent']}: {p['state'].upper()} {p['detail']}  fix: {p['fix']}")
    if not problems:
        print(f"all {len(ok)} scheduled agents ok")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
