#!/bin/bash
# Tries the Android app in an emulator (#53): installs the APK, gives it a test video, opens it with test steps
# (Android has no environment variables: they go in <app files>/env.txt) and collects its log, screenshot and logcat.
#   qt/packaging/android/emutest.sh <apk> <video> <out dir>
set -uo pipefail
APK=${1:?apk}; VIDEO=${2:?video}; OUT=${3:?out dir}
PKG=io.github.stanotermans.velaplayer
FILES=/sdcard/Android/data/$PKG/files
mkdir -p "$OUT"
adb install -r -g "$APK"
for p in READ_MEDIA_VIDEO READ_MEDIA_AUDIO; do adb shell pm grant $PKG android.permission.$p || true; done
adb shell mkdir -p /sdcard/Movies/vela "$FILES"
adb push "$VIDEO" /sdcard/Movies/vela/video.mp4
# Android's media scanner (on a phone it runs by itself): apps with only video/music access see a file once it's in there
adb shell content call --method scan_volume --uri content://media --arg external_primary || true
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Movies/vela/video.mp4 || true
sleep 5
echo "--- in Android's media store:"; adb shell content query --uri content://media/external/video/media --projection _data | tee "$OUT/mediastore.txt"
STEPS='set:language="en";set:volume=0;set:onboarded=true;view:videos;wait:2500;log:"access=" + System.mediaAccess + " " + System.allFilesAccess();log:"folders=" + JSON.stringify(Settings.values.mediaFolders);log:"items=" + library.items.length;play:video.mp4;wait:4000'
STEPS="$STEPS"';log:"playing=" + player.playing;log:"size=" + player.frameSize.width + "x" + player.frameSize.height;log:"t=" + player.time;log:"err=" + player.error;log:"vlc=" + player.version'
printf '%s\n' "VLCR_FOLDER=/sdcard/Movies/vela" "VLCR_NO_IMPORT=1" "VLCR_LOG=$FILES/log.txt" "VLCR_SHOT=$FILES/shot.png" "VLCR_SHOT_MS=14000" "VLCR_OPEN=$STEPS" > "$OUT/env.txt"
adb push "$OUT/env.txt" "$FILES/env.txt"
adb logcat -c
adb shell am start -W -n $PKG/org.qtproject.qt.android.bindings.QtActivity
sleep 12
adb exec-out screencap -p > "$OUT/screen-running.png"
# every thread's stack (Java and native) at this moment: shows where the app waits if it hangs
adb root >/dev/null 2>&1; sleep 2
PID=$(adb shell pidof $PKG | tr -d '
')
[ -n "$PID" ] && adb shell debuggerd -b "$PID" > "$OUT/stacks.txt" 2>&1 || true
sleep 10
adb pull "$FILES/log.txt" "$OUT/log.txt" || true
adb pull "$FILES/shot.png" "$OUT/shot.png" || true
adb exec-out screencap -p > "$OUT/screen-end.png"
adb logcat -d > "$OUT/logcat.txt"
echo "--- log"; cat "$OUT/log.txt" 2>/dev/null || echo "(no log)"
echo "--- logcat (app, libVLC, crashes)"; grep -iE "vela|vlc|qt|FATAL|AndroidRuntime|DEBUG   :" "$OUT/logcat.txt" | grep -v "^.* I ActivityTaskManager" | tail -60
grep -q "playing=true" "$OUT/log.txt" 2>/dev/null
