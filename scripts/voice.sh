#!/usr/bin/env bash
# Kokoro setup for Jarvis, Docker or native.
#
# Docker is the upstream way to run Kokoro and is one command if you already
# have it. Most people installing a dashboard do not, and "install Docker
# Desktop first" is where they stop. So this supports both and picks the native
# path by default when Docker is absent.
#
#   jarvis voice install [--docker|--native]
#   jarvis voice start | stop | status
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$ROOT/.venv-kokoro"
MODELS="$ROOT/models"
PIDFILE="$ROOT/data/kokoro.pid"
LOGFILE="$ROOT/data/kokoro.log"
CONTAINER="jarvis-kokoro"
IMAGE="ghcr.io/remsky/kokoro-fastapi-cpu:latest"
PORT="${KOKORO_PORT:-8880}"

MODEL_URL="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"

have() { command -v "$1" >/dev/null 2>&1; }
say()  { printf "  %s\n" "$*"; }
die()  { printf "\n  %s\n\n" "$*" >&2; exit 1; }

mode_file="$ROOT/data/.kokoro-mode"
current_mode() { [ -f "$mode_file" ] && cat "$mode_file" || echo ""; }

# ---------------------------------------------------------------- install ---
install_docker() {
  have docker || die "docker not found. Install Docker Desktop, or run: jarvis voice install --native"
  say "pulling $IMAGE (about 1.5GB, once)"
  docker pull "$IMAGE" || die "pull failed"
  echo docker > "$mode_file"
  say "done. start it with: jarvis voice start"
}

install_native() {
  have python3 || die "python3 not found"
  mkdir -p "$MODELS" "$ROOT/data"

  say "creating venv at .venv-kokoro"
  python3 -m venv "$VENV" || die "could not create venv"

  say "installing kokoro-onnx (onnxruntime, no PyTorch)"
  "$VENV/bin/pip" install --quiet --upgrade pip >/dev/null 2>&1
  "$VENV/bin/pip" install --quiet kokoro-onnx numpy || die "pip install failed"

  # 337MB total, skipped when already present so re-running is cheap
  fetch() {
    local url="$1" out="$2" name; name="$(basename "$out")"
    if [ -s "$out" ]; then say "$name already downloaded"; return; fi
    say "downloading $name"
    curl -fLsS -o "$out.part" "$url" || die "download failed: $name"
    mv "$out.part" "$out"
  }
  fetch "$MODEL_URL"  "$MODELS/kokoro-v1.0.onnx"
  fetch "$VOICES_URL" "$MODELS/voices-v1.0.bin"

  echo native > "$mode_file"
  say "done. start it with: jarvis voice start"
}

# ------------------------------------------------------------------ start ---
start() {
  if curl -sf --max-time 2 "http://127.0.0.1:$PORT/v1/models" >/dev/null 2>&1; then
    say "already running on port $PORT"; return 0
  fi
  case "$(current_mode)" in
    docker)
      docker rm -f "$CONTAINER" >/dev/null 2>&1
      docker run -d --name "$CONTAINER" -p "$PORT:8880" "$IMAGE" >/dev/null \
        || die "could not start container"
      say "container $CONTAINER starting on port $PORT"
      ;;
    native)
      [ -x "$VENV/bin/python" ] || die "not installed. run: jarvis voice install"
      mkdir -p "$ROOT/data"
      KOKORO_PORT="$PORT" KOKORO_MODELS="$MODELS" \
        nohup "$VENV/bin/python" "$ROOT/scripts/kokoro_server.py" >"$LOGFILE" 2>&1 &
      echo $! > "$PIDFILE"
      say "kokoro starting (pid $(cat "$PIDFILE")), log: data/kokoro.log"
      ;;
    *) die "not installed. run: jarvis voice install" ;;
  esac

  # first request loads the model, so wait for readiness rather than claiming it
  printf "  waiting for it to answer"
  for _ in $(seq 1 40); do
    if curl -sf --max-time 2 "http://127.0.0.1:$PORT/v1/models" >/dev/null 2>&1; then
      printf "\n"; say "ready on http://127.0.0.1:$PORT"
      say "Jarvis will use it automatically - kokoro is first in the voice chain."
      return 0
    fi
    printf "."; sleep 1
  done
  printf "\n"; die "did not come up. check data/kokoro.log"
}

stop() {
  case "$(current_mode)" in
    docker) docker rm -f "$CONTAINER" >/dev/null 2>&1 && say "container stopped" ;;
    native)
      if [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null; then
        say "stopped (pid $(cat "$PIDFILE"))"
      else
        say "not running"
      fi
      rm -f "$PIDFILE"
      ;;
    *) say "nothing installed" ;;
  esac
}

status() {
  say "mode      : $(current_mode | grep . || echo 'not installed')"
  if curl -sf --max-time 2 "http://127.0.0.1:$PORT/v1/models" >/dev/null 2>&1; then
    say "server    : up on port $PORT"
  else
    say "server    : down"
  fi
  [ -s "$MODELS/kokoro-v1.0.onnx" ] && say "model     : $(du -h "$MODELS/kokoro-v1.0.onnx" | cut -f1)" || true
}

case "${1:-}" in
  install)
    case "${2:-}" in
      --docker) install_docker ;;
      --native) install_native ;;
      *)
        if have docker && docker info >/dev/null 2>&1; then
          say "docker detected - using it (override with --native)"
          install_docker
        else
          say "no docker - installing natively (override with --docker)"
          install_native
        fi
        ;;
    esac
    ;;
  start)  start ;;
  stop)   stop ;;
  status) status ;;
  *) echo "usage: jarvis voice {install [--docker|--native] | start | stop | status}" ; exit 1 ;;
esac
