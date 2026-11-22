#!/usr/bin/env bash
# #119: libvlccore.dll for Windows x64 from VLC's own source (the version of app/scripts/fetch-vlc.js) with Vela's
# patches, cross-compiled with mingw-w64 like VideoLAN does. Only the core is built: VideoLAN's plugins stay.
# Runs in debian:bookworm:  docker run --rm -v <repo>/app:/app -v <out>:/out debian:bookworm bash /app/build/libvlccore/build-win64.sh
set -euo pipefail
VLC_VERSION=${VLC_VERSION:-3.0.24}
OUT=${OUT:-/out}
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends git ca-certificates build-essential autoconf automake libtool pkg-config gettext autopoint \
  gcc-mingw-w64-x86-64 g++-mingw-w64-x86-64 mingw-w64-tools flex bison patch >/dev/null
# (code.videolan.org answers archive downloads with a bot check; git works)
git clone -q --depth 1 --branch "$VLC_VERSION" https://code.videolan.org/videolan/vlc.git /build/vlc
cd /build/vlc
for p in /app/build/libvlccore/*.patch; do patch -p1 --forward < "$p"; done
./bootstrap >/dev/null
mkdir -p win64 && cd win64
# (WaitOnAddress, Windows 8 and newer: in mingw-w64's libsynchronization)
LIBS=-lsynchronization ../configure --host=x86_64-w64-mingw32 --prefix=/build/prefix \
  --disable-nls --disable-vlc --disable-lua --disable-a52 --disable-libgcrypt --disable-swscale --disable-avcodec \
  --disable-avformat --disable-postproc --disable-mad --disable-qt --disable-skins2 --disable-chromecast \
  --disable-addonmanagermodules --disable-update-check --disable-dbus --disable-xcb --disable-libva \
  --disable-dxva2 --disable-d3d11va --disable-dvdread --disable-dvdnav --disable-bluray --disable-taglib --disable-ncurses \
  --disable-srt --disable-gnutls --disable-libxml2 --disable-sparkle --disable-x264 --disable-x26410b --disable-fluidsynth \
  >/build/configure.log 2>&1 || { tail -40 /build/configure.log; exit 1; }
make -s -C compat -j"$(nproc)" >/dev/null
make -s -C src -j"$(nproc)" >/build/make.log 2>&1 || { tail -40 /build/make.log; exit 1; }
mkdir -p "$OUT"
cp src/.libs/libvlccore.dll "$OUT/libvlccore.dll"
x86_64-w64-mingw32-strip "$OUT/libvlccore.dll"
echo "libvlccore.dll $VLC_VERSION built with: $(ls /app/build/libvlccore/*.patch | xargs -n1 basename | tr '\n' ' ')"
