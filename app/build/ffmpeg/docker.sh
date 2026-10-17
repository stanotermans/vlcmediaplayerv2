#!/usr/bin/env bash
# Runs build.sh for linux-x64 or win-x64 inside a throwaway container (needs Docker).
#   bash docker.sh linux-x64 | win-x64
set -euo pipefail
TARGET=${1:?usage: docker.sh linux-x64|win-x64}
HERE=$(cd "$(dirname "$0")" && pwd)
case "$TARGET" in
  linux-x64) IMAGE=alpine:3.20
    DEPS="apk add --no-cache bash build-base nasm perl curl tar xz bzip2 pkgconf linux-headers openssl-dev openssl-libs-static zlib-dev zlib-static patch" ;;
  win-x64)   IMAGE=debian:bookworm
    DEPS="apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq gcc libc6-dev gcc-mingw-w64-x86-64 nasm make curl xz-utils bzip2 pkg-config libz-mingw-w64-dev patch >/dev/null" ;;
  *) echo "docker.sh only builds linux-x64 and win-x64"; exit 1 ;;
esac
# MSYS_NO_PATHCONV keeps Git Bash on Windows from rewriting the container paths
MSYS_NO_PATHCONV=1 docker run --rm -v "$HERE:/ff" -e WORK=/tmp/work "$IMAGE" sh -c "$DEPS && bash /ff/build.sh $TARGET"
