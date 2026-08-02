#!/usr/bin/env bash
# Put a known-good yt-dlp inside Jarvis, so the agents do not depend on what
# the user happens to have installed.
#
# The failure this prevents is specific and quiet: an old yt-dlp still answers
# --version, still looks installed, and fails every real request with "The page
# needs to be reloaded" while the dashboard fills with zeroes. It is also easy
# to have two copies where the stale one wins on PATH, so the fix looks applied
# and is not.
#
# The standalone builds bundle their own Python, so this needs no brew, no pip,
# and no particular system Python.
#
#   jarvis ytdlp install | status | remove
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/bin/yt-dlp"
API="https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest"

say() { printf "  %s\n" "$*"; }
die() { printf "\n  %s\n\n" "$*" >&2; exit 1; }

asset_for_platform() {
  case "$(uname -s)" in
    Darwin) echo "yt-dlp_macos" ;;
    Linux)  [ "$(uname -m)" = "aarch64" ] && echo "yt-dlp_linux_aarch64" || echo "yt-dlp_linux" ;;
    *)      echo "yt-dlp" ;;   # the small pure-python build; needs python 3.10+
  esac
}

# Two steps, because they fail differently. Search still works on a stale
# yt-dlp; it is the per-video metadata fetch that dies with "The page needs to
# be reloaded". And no video id is hardcoded, because those get taken down -
# yt-dlp's own long-standing test video is unavailable now, which is exactly
# how the first version of this check managed to fail against a good binary.
probe() {
  local exe="$1" id
  [ -x "$exe" ] || command -v "$exe" >/dev/null 2>&1 || return 1
  id="$("$exe" "ytsearch1:claude code" --flat-playlist --print "%(id)s" \
        --no-warnings 2>/dev/null | head -1)"
  [ -n "$id" ] || return 1
  "$exe" "https://www.youtube.com/watch?v=$id" --skip-download \
    --print "%(view_count)s" --no-warnings 2>/dev/null | grep -qE '^[0-9]+$'
}

install_bin() {
  local asset url tmp
  asset="$(asset_for_platform)"
  say "finding the latest release"
  url="$(curl -fsSL "$API" | python3 -c "
import sys, json
d = json.load(sys.stdin)
name = sys.argv[1]
for a in d['assets']:
    if a['name'] == name:
        print(a['browser_download_url']); break
" "$asset")" || die "could not reach the GitHub API"
  [ -n "$url" ] || die "no build published for this platform ($asset)"

  mkdir -p "$ROOT/bin"
  tmp="$BIN.part"
  say "downloading $asset (about 38MB, bundles its own python)"
  curl -fLsS -o "$tmp" "$url" || die "download failed"
  chmod +x "$tmp"

  say "verifying it can actually fetch"
  if probe "$tmp"; then
    mv "$tmp" "$BIN"
    say "installed: $("$BIN" --version 2>/dev/null | tail -1)"
    say "Jarvis will prefer this copy over anything on PATH."
  else
    rm -f "$tmp"
    die "the downloaded build could not fetch. Network or YouTube issue, not the binary."
  fi
}

status() {
  if [ -x "$BIN" ]; then
    say "bundled  : $("$BIN" --version 2>/dev/null | tail -1)  ($BIN)"
    probe "$BIN" && say "           fetch verified" || say "           CANNOT FETCH - try: jarvis ytdlp install"
  else
    say "bundled  : not installed"
  fi

  if command -v yt-dlp >/dev/null 2>&1; then
    say "on PATH  : $(yt-dlp --version 2>/dev/null | tail -1)  ($(command -v yt-dlp))"
    probe yt-dlp && say "           fetch verified" || say "           CANNOT FETCH"
    local n; n="$(which -a yt-dlp 2>/dev/null | wc -l | tr -d ' ')"
    [ "$n" -gt 1 ] && say "           WARNING: $n copies on PATH, the first one wins"
  else
    say "on PATH  : none"
  fi
}

case "${1:-status}" in
  install) install_bin ;;
  status)  status ;;
  remove)  rm -f "$BIN" && say "removed the bundled copy" ;;
  *) echo "usage: jarvis ytdlp {install|status|remove}"; exit 1 ;;
esac
