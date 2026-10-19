#!/usr/bin/env bash
# Runs bundle.sh in throwaway containers (needs Docker): libVLC from Debian 12 into app/vendor/vlc, and the vlcview
# module built on Debian 11 (older glibc), both for Linux x64.
#   bash app/build/vlc-linux/docker.sh            (into app/vendor/vlc and app/native/vlcview/build/Release)
#   bash app/build/vlc-linux/docker.sh <folder>   (into <folder>/vlc and <folder>/vlcview.node, for testing)
set -euo pipefail
APP=$(cd "$(dirname "$0")/../.." && pwd); command -v cygpath >/dev/null && APP=$(cygpath -ml "$APP")
if [ -n "${1:-}" ]; then
  mkdir -p "$1"; OUTDIR=$(cd "$1" && pwd); command -v cygpath >/dev/null && OUTDIR=$(cygpath -ml "$OUTDIR")   # Docker Desktop needs the long Windows path
  MOUNTS=(-v "$APP:/app:ro" -v "$OUTDIR:/out" -e VLC_OUT=/out/vlc -e MOD_OUT=/out)
else
  MOUNTS=(-v "$APP:/app")
fi
# MSYS_NO_PATHCONV keeps Git Bash on Windows from rewriting the container paths
export MSYS_NO_PATHCONV=1
docker run --rm "${MOUNTS[@]}" debian:bookworm bash /app/build/vlc-linux/bundle.sh libvlc
docker run --rm "${MOUNTS[@]}" node:20-bullseye bash /app/build/vlc-linux/bundle.sh module
