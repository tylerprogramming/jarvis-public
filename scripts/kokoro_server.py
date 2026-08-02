#!/usr/bin/env python3
"""A tiny OpenAI-compatible speech server backed by kokoro-onnx.

Kokoro is normally run via Docker (kokoro-fastapi). That is one command if you
already have Docker, and a large detour if you do not - which is most people
installing a dashboard. This serves the same endpoint natively instead:
onnxruntime rather than PyTorch, so the install is ~50MB of wheels plus a 337MB
model, not a multi-gigabyte CUDA stack.

Endpoints match what lib/tts.js already calls, so nothing in Jarvis changes:

    POST /v1/audio/speech   {input, voice, speed, response_format}
    GET  /v1/models         so the status probe can see it is up
    GET  /health

Run it through `jarvis voice start`, which handles the venv and model paths.
"""
import io
import json
import os
import sys
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODELS_DIR = os.environ.get(
    "KOKORO_MODELS",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"),
)
MODEL = os.path.join(MODELS_DIR, "kokoro-v1.0.onnx")
VOICES = os.path.join(MODELS_DIR, "voices-v1.0.bin")
HOST = os.environ.get("KOKORO_HOST", "127.0.0.1")
PORT = int(os.environ.get("KOKORO_PORT", "8880"))
DEFAULT_VOICE = os.environ.get("KOKORO_VOICE", "am_michael")

_engine = None


def engine():
    """Loaded once, lazily - startup is a few seconds and we want the port open
    first so callers get a connection rather than a refusal while it warms."""
    global _engine
    if _engine is None:
        from kokoro_onnx import Kokoro

        for f in (MODEL, VOICES):
            if not os.path.exists(f):
                raise FileNotFoundError(f"missing model file: {f}")
        _engine = Kokoro(MODEL, VOICES)
    return _engine


def to_wav(samples, rate):
    """float32 in [-1, 1] to 16-bit PCM wav, using only the stdlib."""
    import numpy as np

    clipped = np.clip(samples, -1.0, 1.0)
    pcm = (clipped * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(rate))
        w.writeframes(pcm)
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        # one line per request, not the default noise
        sys.stderr.write(f"kokoro: {fmt % args}\n")

    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") in ("/health", ""):
            return self._send(200, {"status": "ok"})
        if self.path.startswith("/v1/models"):
            return self._send(200, {
                "object": "list",
                "data": [{"id": "kokoro", "object": "model", "owned_by": "kokoro-onnx"}],
            })
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/v1/audio/speech"):
            return self._send(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(length) or b"{}")
        except Exception as e:
            return self._send(400, {"error": f"bad request: {e}"})

        text = (req.get("input") or "").strip()
        if not text:
            return self._send(400, {"error": "input is required"})

        try:
            samples, rate = engine().create(
                text,
                voice=req.get("voice") or DEFAULT_VOICE,
                speed=float(req.get("speed") or 1.0),
                lang=req.get("lang") or "en-us",
            )
            self._send(200, to_wav(samples, rate), "audio/wav")
        except Exception as e:
            sys.stderr.write(f"kokoro: synthesis failed: {e}\n")
            self._send(500, {"error": str(e)})


def main():
    missing = [f for f in (MODEL, VOICES) if not os.path.exists(f)]
    if missing:
        print("missing model files:", *missing, sep="\n  ", file=sys.stderr)
        print("\nrun: jarvis voice install", file=sys.stderr)
        return 1
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"kokoro speaking on http://{HOST}:{PORT}/v1/audio/speech")
    print(f"  model {os.path.basename(MODEL)}, default voice {DEFAULT_VOICE}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
