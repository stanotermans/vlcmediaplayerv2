#!/bin/bash
# Packages Vela Player for Linux (x86_64; Qt 6.8 in QT_ROOT_DIR, libVLC in app/vendor/vlc from
# app/build/vlc-linux/docker.sh):
#   qt/packaging/linux/package.sh <ffmpeg> [out dir]
# An AppDir made by linuxdeploy (Qt's libraries, plugins and QML), with libVLC, the slim FFmpeg, the SoundFont and
# keys.json next to the program; from it the AppImage, and the same files under /opt/vela-player in the .deb, .rpm,
# Arch package (nFPM) and the .tar.gz. Like v2.x, every package has its own libVLC.
set -euo pipefail
cd "$(dirname "$0")/../.."                       # qt/
FFMPEG=${1:?ffmpeg}; OUT=$(realpath -m "${2:-dist}")
VERSION=$(sed -n 's/^project(velaplayer VERSION \([0-9.]*\).*/\1/p' CMakeLists.txt)
QT=${QT_ROOT_DIR:?QT_ROOT_DIR (Qt for Linux)}
TOOLS=$(realpath -m build-linux-tools); mkdir -p "$TOOLS" "$OUT"
get() { [ -f "$TOOLS/$2" ] || curl -fsSL --retry 4 -o "$TOOLS/$2" "$1"; chmod +x "$TOOLS/$2"; }
get https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage linuxdeploy
get https://github.com/linuxdeploy/linuxdeploy-plugin-qt/releases/download/continuous/linuxdeploy-plugin-qt-x86_64.AppImage linuxdeploy-plugin-qt
get https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage appimagetool
export APPIMAGE_EXTRACT_AND_RUN=1 PATH="$TOOLS:$QT/bin:$PATH"

cmake -S . -B build-linux -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$QT" -DCMAKE_INSTALL_PREFIX=/usr
cmake --build build-linux
AD=$(realpath -m build-linux/AppDir); rm -rf "$AD"
install -Dm755 build-linux/vela-player "$AD/usr/bin/vela-player"
install -Dm644 packaging/linux/vela-player.desktop "$AD/usr/share/applications/vela-player.desktop"
install -Dm644 assets/icon-512.png "$AD/usr/share/icons/hicolor/512x512/apps/vela-player.png"
# X11 (on Wayland desktops through XWayland)
QML_SOURCES_PATHS=qml QMAKE="$QT/bin/qmake" linuxdeploy --appdir "$AD" --plugin qt
# only the Basic style of Qt Quick Controls is used: the other styles go
for st in Material Imagine Fusion Universal FluentWinUI3; do rm -rf "$AD/usr/qml/QtQuick/Controls/$st"; done
B="$AD/usr/bin"
cp -a ../app/vendor/vlc "$B/vlc"
install -m755 "$FFMPEG" "$B/ffmpeg"
install -Dm644 ../app/assets/FluidR3Mono_GM.sf3 "$B/assets/FluidR3Mono_GM.sf3"
[ -f keys.json ] && install -m644 keys.json "$B/" || true
cp assets/icon-512.png "$AD/vela-player.png"
du -sh "$AD"

# AppImage
ARCH=x86_64 VERSION=$VERSION appimagetool "$AD" "$OUT/Vela-Player-$VERSION-x86_64.AppImage"

# /opt/vela-player: the AppDir's usr/ (bin/, lib/, plugins/, qml/ with qt.conf pointing next door)
OPT=$(realpath -m build-linux/opt); rm -rf "$OPT"; mkdir -p "$OPT"
cp -a "$AD/usr/." "$OPT/"
rm -rf "$OPT/share"
tar -C "$(dirname "$OPT")" --transform "s,^opt,vela-player-$VERSION," -czf "$OUT/vela-player-$VERSION-x64.tar.gz" opt

# deb, rpm, Arch: nFPM
get https://github.com/goreleaser/nfpm/releases/download/v2.41.1/nfpm_2.41.1_Linux_x86_64.tar.gz nfpm.tgz
[ -x "$TOOLS/nfpm" ] || tar -C "$TOOLS" -xzf "$TOOLS/nfpm.tgz" nfpm
# (nFPM does not expand variables in the file list: fill them in first)
sed -e "s|\${VERSION}|$VERSION|g" -e "s|\${OPT}|$OPT|g" -e "s|\${AD}|$AD|g" packaging/linux/nfpm.yaml > build-linux/nfpm.yaml
for p in deb rpm archlinux; do nfpm package -f build-linux/nfpm.yaml -p $p -t "$OUT/"; done
ls -la "$OUT"
