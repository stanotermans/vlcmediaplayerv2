#!/usr/bin/env bash
# #119: libvlccore.dylib for macOS (arm64 or x86_64) from VLC's own source (the version of app/scripts/fetch-vlc.js)
# with Vela's patches. Only the core is built: VideoLAN's plugins stay. On a macOS runner (Xcode, Homebrew):
#   bash app/build/libvlccore/build-mac.sh arm64|x86_64 <out folder>
set -euo pipefail
ARCH=${1:?usage: build-mac.sh arm64|x86_64 <out>}
OUT=${2:?usage: build-mac.sh arm64|x86_64 <out>}
VLC_VERSION=${VLC_VERSION:-3.0.24}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
brew install autoconf automake libtool pkg-config gettext >/dev/null 2>&1 || true
export PATH="$(brew --prefix gettext)/bin:$(brew --prefix libtool)/libexec/gnubin:$PATH"
W=$(mktemp -d)
git clone -q --depth 1 --branch "$VLC_VERSION" https://code.videolan.org/videolan/vlc.git "$W/vlc"
cd "$W/vlc"
for p in "$HERE"/*.patch; do patch -p1 --forward < "$p"; done
./bootstrap >/dev/null
if [ "$ARCH" = arm64 ]; then HOST=aarch64-apple-darwin; MIN=11.0; else HOST=x86_64-apple-darwin; MIN=10.13; fi
export MACOSX_DEPLOYMENT_TARGET=$MIN
SDK=$(xcrun --show-sdk-path)
export CC="clang -arch $ARCH -isysroot $SDK -mmacosx-version-min=$MIN" OBJC="clang -arch $ARCH -isysroot $SDK -mmacosx-version-min=$MIN"
export CXX="clang++ -arch $ARCH -isysroot $SDK -mmacosx-version-min=$MIN" OBJCXX="clang++ -arch $ARCH -isysroot $SDK -mmacosx-version-min=$MIN"
export PKG_CONFIG_LIBDIR=/nonexistent   # (none of Homebrew's libraries: the core needs only the system's)
mkdir -p build && cd build
../configure --host=$HOST --prefix="$W/prefix" \
  --disable-nls --disable-vlc --disable-lua --disable-a52 --disable-libgcrypt --disable-swscale --disable-avcodec \
  --disable-avformat --disable-postproc --disable-mad --disable-qt --disable-skins2 --disable-chromecast \
  --disable-addonmanagermodules --disable-update-check --disable-dbus --disable-xcb --disable-macosx \
  --disable-sparkle --disable-dvdread --disable-dvdnav --disable-bluray --disable-taglib --disable-ncurses --disable-srt \
  --disable-gnutls --disable-libxml2 --disable-x264 --disable-x26410b --disable-fluidsynth --disable-growl \
  > "$W/configure.log" 2>&1 || { tail -40 "$W/configure.log"; exit 1; }
make -s -C compat -j"$(sysctl -n hw.ncpu)" >/dev/null
make -s -C src -j"$(sysctl -n hw.ncpu)" > "$W/make.log" 2>&1 || { tail -40 "$W/make.log"; exit 1; }
cp -L src/.libs/libvlccore.dylib "$OUT/libvlccore.dylib"
strip -x "$OUT/libvlccore.dylib"
echo "libvlccore.dylib $VLC_VERSION $ARCH:"; lipo -info "$OUT/libvlccore.dylib"; otool -L "$OUT/libvlccore.dylib"
