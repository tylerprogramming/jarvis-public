#!/usr/bin/env python3
"""Get a transcript for a YouTube video, cheapest path first.

Most YouTube videos already have captions. Downloading them costs nothing and
takes about a second, so transcribing that audio with a model - local or hosted
- is wasted time and, on a paid API, wasted money. This tries in order:

  1. manual captions (a human wrote them; best quality)
  2. auto-captions (YouTube's own ASR; free, instant, usually fine)
  3. local Whisper (whisper.cpp / faster-whisper) on extracted audio
  4. OpenAI Whisper, only if the user supplied a key

Steps 3 and 4 only run when the first two find nothing, which is rare.

Usage:
    python3 scripts/transcript.py <url-or-video-id> [--out FILE] [--force-asr]
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ytdlp_util  # noqa: E402

FALLBACK_CLIENTS = ["android", "ios", None]


def load_config():
    def read(p):
        try:
            with open(p) as f:
                return json.load(f)
        except Exception:
            return {}
    base, user = read(os.path.join(ROOT, "config.default.json")), read(os.path.join(ROOT, "config.json"))
    merged = dict(base)
    for k, v in user.items():
        merged[k] = {**base.get(k, {}), **v} if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return merged


def normalize(url):
    if re.fullmatch(r"[\w-]{11}", url):
        return f"https://www.youtube.com/watch?v={url}"
    return url


def vtt_to_text(path):
    """Strip cue timings, tags, and the duplicate lines auto-captions emit."""
    with open(path, encoding="utf-8", errors="replace") as f:
        raw = f.read()
    seen, out = set(), []
    for line in raw.split("\n"):
        if "-->" in line or line.startswith(("WEBVTT", "Kind:", "Language:")):
            continue
        text = re.sub(r"<[^>]+>", "", line).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return re.sub(r"\s+", " ", " ".join(out)).strip()


def try_captions(url, workdir):
    """Manual captions first, then auto-captions, across extractor clients."""
    for kind, flag in (("manual", "--write-subs"), ("auto", "--write-auto-subs")):
        for client in FALLBACK_CLIENTS:
            args = [
                url, "--skip-download", flag, "--sub-langs", "en.*",
                "--sub-format", "vtt/best",
                "-o", os.path.join(workdir, "cap.%(ext)s"),
            ]
            if client:
                args += ["--extractor-args", f"youtube:player_client={client}"]
            ytdlp_util.lines(args, timeout=180)
            vtts = [f for f in os.listdir(workdir) if f.endswith(".vtt")]
            if vtts:
                text = vtt_to_text(os.path.join(workdir, sorted(vtts)[0]))
                for f in vtts:
                    os.remove(os.path.join(workdir, f))
                if len(text.split()) > 20:
                    return text, f"{kind} captions"
    return None, None


def extract_audio(url, workdir):
    out = os.path.join(workdir, "audio.wav")
    for client in FALLBACK_CLIENTS:
        args = [
            url, "-f", "bestaudio/best", "-x", "--audio-format", "wav",
            "--postprocessor-args", "-ar 16000 -ac 1",
            "-o", os.path.join(workdir, "audio.%(ext)s"), "--no-playlist",
        ]
        if client:
            args += ["--extractor-args", f"youtube:player_client={client}"]
        ytdlp_util.lines(args, timeout=900)
        if os.path.exists(out):
            return out
    return None


def which(cmd):
    return subprocess.run(["which", cmd], capture_output=True).returncode == 0


def local_whisper(wav, cfg):
    stt = cfg.get("stt", {}).get("local", {})
    binary = stt.get("binary", "whisper-cli")
    if not which(binary):
        return None, None

    is_cpp = bool(re.search(r"whisper-cli|whisper\.cpp|main$", binary))
    model = os.path.expanduser(stt.get("model_path") or "")
    if is_cpp:
        if not model or not os.path.exists(model):
            print("local whisper found but stt.local.model_path is unset or missing",
                  file=sys.stderr)
            return None, None
        cmd = [binary, "-m", model, "-f", wav, "--output-txt", "--no-timestamps"]
        txt = wav + ".txt"
    else:
        cmd = [binary, wav, "--model", stt.get("model", "small"),
               "--output_format", "txt", "--output_dir", os.path.dirname(wav)]
        txt = os.path.splitext(wav)[0] + ".txt"
    if stt.get("language"):
        cmd += (["-l", stt["language"]] if is_cpp else ["--language", stt["language"]])

    try:
        subprocess.run(cmd, capture_output=True, timeout=3600)
    except Exception as e:
        print(f"whisper failed: {e}", file=sys.stderr)
        return None, None
    if os.path.exists(txt):
        with open(txt, encoding="utf-8", errors="replace") as f:
            return f.read().strip(), f"local whisper ({os.path.basename(binary)})"
    return None, None


def openai_whisper(wav, cfg):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        return None, None
    import urllib.request

    o = cfg.get("stt", {}).get("openai", {})
    url = o.get("url", "https://api.openai.com/v1/audio/transcriptions")
    boundary = "----jarvis-transcript-boundary"
    with open(wav, "rb") as f:
        audio = f.read()
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n{o.get("model", "whisper-1")}\r\n'.encode(),
        (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\n'
         'Content-Type: audio/wav\r\n\r\n').encode(),
        audio,
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    req = urllib.request.Request(
        url, data=b"".join(parts),
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.load(r).get("text", "").strip(), "openai whisper"
    except Exception as e:
        print(f"openai whisper failed: {e}", file=sys.stderr)
        return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--out", help="write the transcript here instead of stdout")
    ap.add_argument("--force-asr", action="store_true",
                    help="skip captions and transcribe the audio")
    args = ap.parse_args()

    cfg = load_config()
    url = normalize(args.url)

    with tempfile.TemporaryDirectory(prefix="jarvis-transcript-") as workdir:
        text = source = None

        if not args.force_asr:
            text, source = try_captions(url, workdir)

        if not text:
            print("no captions - falling back to speech recognition", file=sys.stderr)
            wav = extract_audio(url, workdir)
            if not wav:
                print("could not download audio", file=sys.stderr)
                return 1
            text, source = local_whisper(wav, cfg)
            if not text:
                text, source = openai_whisper(wav, cfg)

        if not text:
            print("no transcript available: no captions, and no working speech "
                  "recognition. Install whisper.cpp (brew install whisper-cpp) and set "
                  "stt.local.model_path, or add OPENAI_API_KEY.", file=sys.stderr)
            return 1

    words = len(text.split())
    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        print(f"{args.out}  ({words} words, via {source})")
    else:
        print(text)
        print(f"\n[{words} words, via {source}]", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
