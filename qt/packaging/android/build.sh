#!/bin/bash
# Builds Vela Player for Android (#53): an APK for one ABI with VideoLAN's libVLC for Android (libvlc-all from
# Maven Central: libvlc.so and the libc++_shared.so it was built with) and the slim FFmpeg (as libffmpeg.so).
#   qt/packaging/android/build.sh <abi: arm64-v8a | x86_64> <Qt for that ABI> [ffmpeg] [out dir]
# Needs ANDROID_SDK_ROOT, ANDROID_NDK_ROOT (r26b), JAVA_HOME (JDK 17), CMake and Ninja; QT_HOST_PATH = the desktop
# Qt of the same version. Signing: APK_KEYSTORE (+ APK_KEYSTORE_PASS, APK_KEY_ALIAS), else Android's debug key.
set -euo pipefail
ABI=${1:?abi}; QT=$(cd "${2:?Qt for Android}" && pwd); FF=${3:-}; OUT=${4:-qt/dist}
[ -n "$FF" ] && FF=$(cd "$(dirname "$FF")" && pwd)/$(basename "$FF")
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
cd "$(dirname "$0")/../.."                       # qt/
VERSION=$(sed -n 's/^project(velaplayer VERSION \([0-9.]*\).*/\1/p' CMakeLists.txt)
LIBVLC=3.7.7                                     # VideoLAN's libVLC 3 for Android
mixed() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else echo "$1"; fi; }   # (Git Bash on Windows: C:/… for CMake)
B=$(mixed "$(pwd)/build-android-$ABI")
mkdir -p "$B/libvlc"
AAR="$B/libvlc/libvlc-all-$LIBVLC.aar"
[ -f "$AAR" ] || curl -fsSL --retry 3 -o "$AAR" "https://repo1.maven.org/maven2/org/videolan/android/libvlc-all/$LIBVLC/libvlc-all-$LIBVLC.aar"
unzip -o -q "$AAR" "jni/$ABI/*" -d "$B/libvlc"
LIBS="$B/libvlc/jni/$ABI/libvlc.so;$B/libvlc/jni/$ABI/libc++_shared.so"
if [ -n "$FF" ]; then cp "$FF" "$B/libffmpeg.so"; LIBS="$LIBS;$B/libffmpeg.so"; fi

QTCMAKE="$QT/bin/qt-cmake"; [ -f "$QTCMAKE.bat" ] && QTCMAKE="$QTCMAKE.bat"
"$QTCMAKE" -S . -B "$B" -G Ninja -DCMAKE_BUILD_TYPE=Release -DQT_ANDROID_ABIS="$ABI" -DVLCR_ANDROID_LIBS="$LIBS" \
  ${QT_HOST_PATH:+-DQT_HOST_PATH="$QT_HOST_PATH"} -DANDROID_SDK_ROOT="$ANDROID_SDK_ROOT" -DANDROID_NDK_ROOT="$ANDROID_NDK_ROOT"
cmake --build "$B" --target apk

# libVLC's libc++_shared.so (a newer NDK than Qt's) replaces the one Qt put in: it serves both
APK=$(ls "$B"/android-build/build/outputs/apk/release/*.apk | head -1)
BT=$(ls -d "$ANDROID_SDK_ROOT"/build-tools/* | sort -V | tail -1)
EXE=""; [ -f "$BT/zipalign.exe" ] && EXE=".exe"
W="$B/apk-work"; rm -rf "$W"; mkdir -p "$W"
PY=$(command -v python3 || command -v python)
"$PY" - "$APK" "$W/app.apk" "lib/$ABI/libc++_shared.so" "$B/libvlc/jni/$ABI/libc++_shared.so" <<'EOF'
import sys, zipfile
src, dst, name, repl = sys.argv[1:]
with zipfile.ZipFile(src) as zi, zipfile.ZipFile(dst, 'w') as zo:
    for i in zi.infolist():
        if i.filename.startswith('META-INF/') and i.filename.rsplit('.', 1)[-1] in ('SF', 'RSA', 'EC', 'DSA', 'MF'): continue   # an old signature
        zo.writestr(i, open(repl, 'rb').read() if i.filename == name else zi.read(i.filename))
EOF
"$BT/zipalign$EXE" -f -p 4 "$W/app.apk" "$W/aligned.apk"
if [ -n "${APK_KEYSTORE:-}" ]; then
  KS=$APK_KEYSTORE; PASS=${APK_KEYSTORE_PASS:?}; ALIAS=${APK_KEY_ALIAS:-vlcredesign}
else   # Android's debug key (made once, like Android Studio does)
  KS="$HOME/.android/debug.keystore"; PASS=android; ALIAS=androiddebugkey
  [ -f "$KS" ] || { mkdir -p "$HOME/.android"; keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias androiddebugkey \
                    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" >/dev/null; }
fi
NAME="Vela-Player-$VERSION-android-$ABI.apk"
"$BT/apksigner${EXE:+.bat}" sign --ks "$KS" --ks-pass "pass:$PASS" --ks-key-alias "$ALIAS" --out "$OUT/$NAME" "$W/aligned.apk"
ls -la "$OUT/$NAME"
