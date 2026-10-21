#!/bin/bash
# Packages Vela Player for Windows (run from Git Bash after "build.bat", in a shell with the Visual Studio
# environment, e.g. the GitHub Actions job):
#   qt/packaging/windows/package.sh <ffmpeg.exe> [out dir]
# → <out>/Vela-Player-Setup-<version>-x64.exe (installer, needs NSIS) and Vela-Player-Portable-<version>-x64.zip.
# The app folder: the program, Qt's files (windeployqt), libVLC (app/vendor/vlc, from app/scripts/fetch-vlc.js),
# the slim FFmpeg, the FluidR3 Mono SoundFont, keys.json (OpenSubtitles, from a secret) and the C++ runtime.
set -euo pipefail
cd "$(dirname "$0")/../.."                       # qt/
FFMPEG=${1:?ffmpeg.exe}
OUT=$(realpath -m "${2:-dist}")
VERSION=$(sed -n 's/^project(velaplayer VERSION \([0-9.]*\).*/\1/p' CMakeLists.txt)
QT_DIR=${QT_DIR:-$([ -n "${QT_ROOT_DIR:-}" ] && cygpath -u "$QT_ROOT_DIR" || echo /c/Qt/6.8.3/msvc2022_64)}
APP=deploy/VLC\ Redesign
rm -rf deploy; mkdir -p "$APP" "$OUT"
cp "build/Vela Player.exe" "$APP/"
"$QT_DIR/bin/windeployqt.exe" --release --qmldir qml --no-translations --no-system-d3d-compiler --no-opengl-sw --no-compiler-runtime "$APP/Vela Player.exe"
# only the Basic style of Qt Quick Controls is used (everything is drawn by the app): the other styles go
for st in Material Imagine Fusion Universal FluentWinUI3 Windows; do
  rm -rf "$APP/qml/QtQuick/Controls/$st"
  rm -f "$APP"/Qt6QuickControls2${st}*.dll
done
# Direct3D 12 shader compiler: Qt draws with Direct3D 11 here
rm -rf "$APP/qml/QtQuick/NativeStyle" "$APP/vc_redist.x64.exe" "$APP/dxcompiler.dll" "$APP/dxil.dll"
# the C++ runtime next to the program (app-local), so nothing needs installing first
REDIST=$(ls -d "${VCToolsRedistDir:-/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Redist/MSVC/latest/}"x64/Microsoft.VC*.CRT 2>/dev/null | head -1 || true)
if [ -z "$REDIST" ]; then REDIST=$(ls -d "/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Redist/MSVC/"*/x64/Microsoft.VC*.CRT 2>/dev/null | tail -1 || true); fi
cp "$REDIST"/{msvcp140.dll,msvcp140_1.dll,msvcp140_2.dll,vcruntime140.dll,vcruntime140_1.dll,concrt140.dll} "$APP/"
cp -r ../app/vendor/vlc "$APP/vlc"
cp "$FFMPEG" "$APP/ffmpeg.exe"
mkdir -p "$APP/assets" && cp ../app/assets/FluidR3Mono_GM.sf3 "$APP/assets/"
[ -f keys.json ] && cp keys.json "$APP/" || true
cp ../LICENSE "$APP/LICENSE.txt" 2>/dev/null || true
du -sh "$APP"

# installer
MAKENSIS=$(command -v makensis || echo "/c/Program Files (x86)/NSIS/makensis.exe")
if [ -x "$MAKENSIS" ] || command -v makensis >/dev/null; then
  SRC=$(cygpath -w "$(realpath "$APP")")
  ( cd packaging/windows && "$MAKENSIS" -V2 "-DVERSION=$VERSION" "-DSRC=$SRC" "-DOUT=$(cygpath -w "$OUT")\\Vela-Player-Setup-$VERSION-x64.exe" installer.nsi )
else
  echo "NSIS not found: no installer"
  [ -z "${CI:-}" ] || exit 1   # on the build server the installer is required
fi

# portable: the same folder with a "portable" file (the app keeps its data in "data" next to it)
touch "$APP/portable"
# (7-Zip's exit code 1 is only a warning: the archive is made)
( cd deploy && rm -f "$OUT/Vela-Player-Portable-$VERSION-x64.zip" && (command -v 7z >/dev/null && { 7z a -tzip -mx=7 "$(cygpath -w "$OUT")\\Vela-Player-Portable-$VERSION-x64.zip" "Vela Player" >/dev/null; [ $? -le 1 ]; } \
  || powershell -NoProfile -Command "Compress-Archive -Path 'Vela Player' -DestinationPath '$(cygpath -w "$OUT")\\Vela-Player-Portable-$VERSION-x64.zip'") )
rm "$APP/portable"
ls -la "$OUT"
