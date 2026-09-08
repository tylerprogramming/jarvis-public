#!/usr/bin/env python3
"""The experiments ledger: one hypothesis at a time, closed with evidence.

    python3 scripts/experiments.py add --hypothesis "..." --metric "..." \\
        --target "..." --deadline YYYY-MM-DD [--source reports/2026-09-06-weekly.md]
    python3 scripts/experiments.py due [--today YYYY-MM-DD]
    python3 scripts/experiments.py close <id> --result "..." --verdict confirmed|refuted|unmeasured
    python3 scripts/experiments.py list
    python3 scripts/experiments.py check [--today YYYY-MM-DD]

Stdlib only. The store is data/decisions.jsonl, the same file lib/memory.js
writes decisions to, so the recap and this ledger read one history rather
than two that drift. Two new kinds live beside the existing decision rows:

    {"date", "kind": "experiment", "id": "exp-YYYYMMDD-<slug>", "text": hypothesis,
     "metric", "target", "deadline", "status": "open", "source"}
    {"date", "kind": "result", "experiment": id, "text": result, "verdict", "source"}

The file is append only. Nothing here rewrites a line, so an experiment's
current status is derived when reading: the latest result line for an id
wins, and an experiment with no result is open. That is what lets the review
agent close a book without any script being able to lose one.

Why the cap and the check exist: a weekly review that proposes a new
experiment every Sunday and never reads the old one back is a list of ideas,
not a loop. `add` refuses past experiments.max_open (config, default 2), and
`check` exits 1 while any experiment is past its deadline and still open, so
the review's run log says so before the model writes a word.
"""
import argparse
import json
import os
import re
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_config  # noqa: E402

DECISIONS = os.path.join(jarvis_config.paths()["data"], "decisions.jsonl")
VERDICTS = ("confirmed", "refuted", "unmeasured")
DEFAULT_MAX_OPEN = 2


# ---------- the file ----------

def max_open():
    cfg = jarvis_config.load()
    try:
        n = int((cfg.get("experiments") or {}).get("max_open", DEFAULT_MAX_OPEN))
    except (TypeError, ValueError):
        n = DEFAULT_MAX_OPEN
    return n if n > 0 else DEFAULT_MAX_OPEN


def read_rows(path=DECISIONS):
    """Every parseable JSON line, in file order. A bad line is skipped, not
    fatal: the recap in lib/memory.js does the same, and one hand edit should
    not take the whole ledger down."""
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                if isinstance(r, dict):
                    rows.append(r)
    except OSError:
        pass
    return rows


def append_row(row, path=DECISIONS):
    """One line, written with O_APPEND so a concurrent writer (the server's
    recordDecision, or a second agent) interleaves whole lines rather than
    bytes. Never rewrites what is already there."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    line = json.dumps(row, ensure_ascii=False) + "\n"
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o644)
    try:
        os.write(fd, line.encode("utf-8"))
    finally:
        os.close(fd)


# ---------- deriving status ----------

def parse_day(s):
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def experiments(rows=None, today=None):
    """Experiments with their derived status. Latest result line wins; an
    experiment with no result is open. Returned in the order they were added."""
    rows = read_rows() if rows is None else rows
    today = today or date.today()
    by_id, order = {}, []
    for r in rows:
        if r.get("kind") == "experiment" and r.get("id"):
            exp = {
                "id": r["id"],
                "date": r.get("date", ""),
                "hypothesis": r.get("text", ""),
                "metric": r.get("metric", ""),
                "target": r.get("target", ""),
                "deadline": r.get("deadline", ""),
                "source": r.get("source", ""),
                "status": "open",
                "verdict": None,
                "result": None,
                "closed": None,
            }
            if r["id"] not in by_id:
                order.append(r["id"])
            by_id[r["id"]] = exp
    for r in rows:
        if r.get("kind") == "result" and r.get("experiment") in by_id:
            exp = by_id[r["experiment"]]
            exp["status"] = "closed"
            exp["verdict"] = r.get("verdict") if r.get("verdict") in VERDICTS else "unmeasured"
            exp["result"] = r.get("text", "")
            exp["closed"] = r.get("date", "")
    out = []
    for i in order:
        exp = by_id[i]
        d = parse_day(exp["deadline"])
        exp["days_left"] = (d - today).days if d else None
        exp["overdue"] = exp["status"] == "open" and d is not None and d < today
        out.append(exp)
    return out


def open_experiments(today=None):
    return [e for e in experiments(today=today) if e["status"] == "open"]


def due_experiments(today=None):
    return [e for e in open_experiments(today=today) if e["overdue"]]


# ---------- ids ----------

def slug(text, words=4):
    parts = re.findall(r"[a-z0-9]+", text.lower())
    return "-".join(parts[:words]) or "experiment"


def new_id(hypothesis, today, existing):
    base = "exp-%s-%s" % (today.strftime("%Y%m%d"), slug(hypothesis))
    candidate, n = base, 2
    while candidate in existing:
        candidate = "%s-%d" % (base, n)
        n += 1
    return candidate


# ---------- printing ----------

def days_word(e):
    if e["days_left"] is None:
        return "no deadline"
    if e["status"] == "closed":
        return "closed %s" % (e["closed"] or "")
    if e["days_left"] < 0:
        return "OVERDUE by %d day%s" % (-e["days_left"], "" if e["days_left"] == -1 else "s")
    if e["days_left"] == 0:
        return "due today"
    return "%d day%s left" % (e["days_left"], "" if e["days_left"] == 1 else "s")


def table(exps):
    if not exps:
        return "  (none)"
    lines = []
    for e in exps:
        head = "  %-34s %-7s %s" % (e["id"], e["status"], days_word(e))
        if e["status"] == "closed":
            head += "  verdict: %s" % e["verdict"]
        lines.append(head)
        lines.append("      %s" % e["hypothesis"])
        lines.append("      metric: %s   target: %s   deadline: %s" % (e["metric"], e["target"], e["deadline"] or "none"))
        if e["result"]:
            lines.append("      result: %s" % e["result"])
    return "\n".join(lines)


def dump(exps):
    print(json.dumps(exps, indent=2, ensure_ascii=False))


# ---------- commands ----------

def today_arg(s):
    if not s:
        return date.today()
    d = parse_day(s)
    if not d:
        sys.exit("--today must be YYYY-MM-DD, got %r" % s)
    return d


def cmd_add(a):
    today = today_arg(a.today)
    deadline = parse_day(a.deadline)
    if not deadline:
        print("refused: --deadline must be YYYY-MM-DD, got %r" % a.deadline)
        return 1
    if deadline < today:
        print("refused: deadline %s is already past (today is %s)" % (a.deadline, today))
        return 1
    if not a.hypothesis.strip() or not a.metric.strip() or not a.target.strip():
        print("refused: --hypothesis, --metric and --target must all say something")
        return 1
    exps = experiments(today=today)
    opened = [e for e in exps if e["status"] == "open"]
    cap = max_open()
    if len(opened) >= cap:
        print("refused: %d experiment%s already open (experiments.max_open is %d); close one first:"
              % (len(opened), "" if len(opened) == 1 else "s", cap))
        print(table(opened))
        return 1
    row = {
        "date": today.isoformat(),
        "kind": "experiment",
        "id": new_id(a.hypothesis, today, {e["id"] for e in exps}),
        "text": a.hypothesis.strip(),
        "metric": a.metric.strip(),
        "target": a.target.strip(),
        "deadline": deadline.isoformat(),
        "status": "open",
        "source": (a.source or "").strip(),
    }
    append_row(row)
    print("added %s  (deadline %s, %d of %d open)" % (row["id"], row["deadline"], len(opened) + 1, cap))
    return 0


def cmd_due(a):
    due = due_experiments(today=today_arg(a.today))
    dump(due)
    print("\n%d overdue" % len(due))
    print(table(due))
    return 0


def cmd_close(a):
    today = today_arg(a.today)
    exps = {e["id"]: e for e in experiments(today=today)}
    e = exps.get(a.id)
    if not e:
        print("refused: no experiment %s. Known ids:" % a.id)
        for i in exps:
            print("  " + i)
        return 1
    if e["status"] == "closed":
        print("refused: %s is already closed (%s on %s)" % (a.id, e["verdict"], e["closed"]))
        return 1
    if not a.result.strip():
        print("refused: --result must say what the number did")
        return 1
    row = {
        "date": today.isoformat(),
        "kind": "result",
        "experiment": a.id,
        "text": a.result.strip(),
        "verdict": a.verdict,
        "source": (a.source or "").strip(),
    }
    append_row(row)
    print("closed %s: %s" % (a.id, a.verdict))
    return 0


def cmd_list(a):
    exps = experiments(today=today_arg(a.today))
    opened = [e for e in exps if e["status"] == "open"]
    closed = [e for e in exps if e["status"] == "closed"]
    if a.json:
        dump(exps)
        return 0
    print("OPEN (%d of %d)" % (len(opened), max_open()))
    print(table(opened))
    print("\nCLOSED (%d)" % len(closed))
    print(table(closed))
    return 0


def cmd_check(a):
    """Exit 1 while any experiment is past its deadline and still open. The
    review agent runs this as a pre step, so the run log carries the list
    whether or not the model then does the right thing."""
    today = today_arg(a.today)
    due = due_experiments(today=today)
    opened = open_experiments(today=today)
    if not due:
        print("experiments: %d open, none overdue" % len(opened))
        return 0
    print("experiments: %d open, %d OVERDUE. Close these before proposing a new one:" % (len(opened), len(due)))
    print(table(due))
    print("  close with: python3 scripts/experiments.py close <id> --result \"...\" --verdict confirmed|refuted|unmeasured")
    return 1


def main(argv=None):
    p = argparse.ArgumentParser(description="The experiments ledger over data/decisions.jsonl.")
    sub = p.add_subparsers(dest="cmd")

    s = sub.add_parser("add", help="open a new experiment")
    s.add_argument("--hypothesis", required=True)
    s.add_argument("--metric", required=True, help="what number decides it")
    s.add_argument("--target", required=True, help="what that number must do")
    s.add_argument("--deadline", required=True, help="YYYY-MM-DD")
    s.add_argument("--source", default="", help="the report that proposed it")
    s.add_argument("--today", default="")
    s.set_defaults(fn=cmd_add)

    s = sub.add_parser("due", help="open experiments past their deadline")
    s.add_argument("--today", default="")
    s.set_defaults(fn=cmd_due)

    s = sub.add_parser("close", help="record the result of one experiment")
    s.add_argument("id")
    s.add_argument("--result", required=True, help="what the number did")
    s.add_argument("--verdict", required=True, choices=VERDICTS)
    s.add_argument("--source", default="")
    s.add_argument("--today", default="")
    s.set_defaults(fn=cmd_close)

    s = sub.add_parser("list", help="every experiment with its status")
    s.add_argument("--json", action="store_true")
    s.add_argument("--today", default="")
    s.set_defaults(fn=cmd_list)

    s = sub.add_parser("check", help="exit 1 if anything is overdue and open")
    s.add_argument("--today", default="")
    s.set_defaults(fn=cmd_check)

    a = p.parse_args(argv)
    if not a.cmd:
        p.print_help()
        return 2
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
