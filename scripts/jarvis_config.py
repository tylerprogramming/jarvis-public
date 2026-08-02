"""Shared config loading for the Python scripts.

collect.py, radar.py, index.py, and transcript.py each grew their own copy of
this, and they had already drifted: some deep-merged nested objects, one only
merged a single section. One implementation, matching lib/config.js.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_json(path, fallback=None):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {} if fallback is None else fallback


def deep_merge(base, over):
    """Objects merge key by key; arrays and scalars replace. Same rule as JS."""
    out = dict(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            out[k] = deep_merge(base[k], v)
        else:
            out[k] = v
    return out


def load():
    """config.default.json with the user's config.json merged over it."""
    return deep_merge(
        read_json(os.path.join(ROOT, "config.default.json")),
        read_json(os.path.join(ROOT, "config.json")),
    )


def expand(p):
    return os.path.expanduser(p) if isinstance(p, str) else p


def paths():
    return {
        "root": ROOT,
        "data": os.path.join(ROOT, "data"),
        "reports": os.path.join(ROOT, "reports"),
        "drafts": os.path.join(ROOT, "drafts"),
    }
