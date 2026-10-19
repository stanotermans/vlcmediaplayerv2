#!/bin/bash
# Packages VLC Redesign 3 for macOS (on a Mac with Qt 6.8 and Xcode's tools):
#   qt/packaging/macos/package.sh <arm64|x64> <ffmpeg for that arch> [out dir]
# Builds for that processor, makes "VLC Redesign.app" (Qt's frameworks by macdeployqt; libVLC from
# app/scripts/fetch-vlc.js mac-<arch> in Contents/MacOS/vlc; the slim FFmpeg; the SoundFont; keys.json), signs it
# ad hoc (not notarized, like v2.x) and puts it in VLC-Redesign-<version>-mac-<arch>.dmg.
set -euo pipefail
cd "$(dirname "$0")/../.."                       # qt/
ARCH=${1:?arm64 or x64}; FFMPEG=${2:?ffmpeg}; OUT=$(cd "$(dirname "${3:-dist}")" 2>/dev/null && pwd)/$(basename "${3:-dist}")
VERSION=$(sed -n 's/^project(vlcredesign3 VERSION \([0-9.]*\).*/\1/p' CMakeLists.txt)
QT=${QT_ROOT_DIR:?QT_ROOT_DIR (Qt for macOS)}
OSXARCH=$([ "$ARCH" = x64 ] && echo x86_64 || echo arm64)
B=build-mac-$ARCH
cmake -S . -B $B -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$QT" -DCMAKE_OSX_ARCHITECTURES=$OSXARCH -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0
cmake --build $B
APP="$B/VLC Redesign.app"

# the icon, from v2.x's 512px PNG
ICONSET=$B/icon.iconset; rm -rf $ICONSET; mkdir -p $ICONSET
for s in 16 32 128 256 512; do
  sips -z $s $s ../app/build/icon.png --out $ICONSET/icon_${s}x${s}.png >/dev/null
  sips -z $((s * 2)) $((s * 2)) ../app/build/icon.png --out $ICONSET/icon_${s}x${s}@2x.png >/dev/null
done
mkdir -p "$APP/Contents/Resources" && iconutil -c icns $ICONSET -o "$APP/Contents/Resources/icon.icns"

"$QT/bin/macdeployqt" "$APP" -qmldir=qml -always-overwrite
# only the Basic style of Qt Quick Controls is used: the other styles go
for st in Material Imagine Fusion Universal FluentWinUI3 macOS iOS; do rm -rf "$APP/Contents/Resources/qml/QtQuick/Controls/$st" "$APP/Contents/PlugIns/quick/"*"${st}"*; done

M="$APP/Contents/MacOS"
rm -rf "$M/vlc"; cp -R ../app/vendor/vlc "$M/vlc"
cp "$FFMPEG" "$M/ffmpeg" && chmod +x "$M/ffmpeg"
mkdir -p "$M/assets" && cp ../app/assets/FluidR3Mono_GM.sf3 "$M/assets/"
[ -f keys.json ] && cp keys.json "$M/" || true

# ad-hoc signature over everything (Apple Silicon only runs signed code; macdeployqt changed Qt's frameworks)
codesign --force --deep --sign - "$APP"
codesign --verify --deep "$APP" && echo "signature ok"

mkdir -p "$OUT"; DMG="$OUT/VLC-Redesign-$VERSION-mac-$ARCH.dmg"
STAGE=$B/dmg; rm -rf $STAGE; mkdir -p $STAGE
cp -R "$APP" $STAGE/ && ln -s /Applications $STAGE/Applications
rm -f "$DMG"; hdiutil create -volname "VLC Redesign" -srcfolder $STAGE -ov -format UDZO "$DMG"
ls -la "$OUT"
