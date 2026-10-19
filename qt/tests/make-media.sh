#!/bin/bash
# The test media for qt/tests/run.py, made with a full FFmpeg (lavfi, x264, Matroska, HLS; the app's slim FFmpeg
# cannot). Run where "ffmpeg" is a full build, e.g. Debian/Ubuntu's:
#   qt/tests/make-media.sh <out dir>
#   docker run --rm -v "<out dir>:/out" -v "$PWD/qt/tests:/t" debian:bookworm-slim bash -c \
#     "apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null && bash /t/make-media.sh /out"
# <out>/media is the media folder the app scans; <out>/web is served over HTTP during the tests (HLS).
set -euo pipefail
OUT=${1:?out dir}
M="$OUT/media"; W="$OUT/web"
rm -rf "$M" "$W"; mkdir -p "$M/Show" "$W/hls"
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }
V="testsrc2=s=640x360:r=25"

# 12 s of picture and a 440 Hz tone, a keyframe every second; a .srt next to it
ff -f lavfi -i "$V:d=12" -f lavfi -i "sine=f=440:d=12" -c:v libx264 -g 25 -pix_fmt yuv420p -c:a aac -shortest "$M/video.mp4"
printf '1\n00:00:00,500 --> 00:00:06,000\nHello from the test subtitles\n\n2\n00:00:06,500 --> 00:00:11,000\nSecond line\n' > "$M/video.srt"

# three chapters (0, 3 and 6 s)
printf ';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=3000\ntitle=One\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=3000\nEND=6000\ntitle=Two\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=6000\nEND=10000\ntitle=Three\n' > "$OUT/chapters.txt"
ff -f lavfi -i "$V:d=10" -i "$OUT/chapters.txt" -map 0 -map_metadata 1 -c:v libx264 -g 25 -pix_fmt yuv420p "$M/chapters.mkv"
rm "$OUT/chapters.txt"

# two audio tracks (English 440 Hz, Dutch 880 Hz) and an embedded subtitle track
ff -f lavfi -i "$V:d=8" -f lavfi -i "sine=f=440:d=8" -f lavfi -i "sine=f=880:d=8" -i "$M/video.srt" \
   -map 0:v -map 1:a -map 2:a -map 3:s -c:v libx264 -g 25 -pix_fmt yuv420p -c:a aac -c:s srt \
   -metadata:s:a:0 language=eng -metadata:s:a:1 language=nld -metadata:s:s:0 language=eng "$M/tracks.mkv"

# 5.1 sound (#44)
ff -f lavfi -i "$V:d=6" -f lavfi -i "sine=f=300:d=6" -filter_complex "[1]pan=5.1|FL=c0|FR=c0|FC=c0|LFE=c0|BL=c0|BR=c0[a]" \
   -map 0:v -map "[a]" -c:v libx264 -g 25 -pix_fmt yuv420p -c:a aac "$M/surround.mp4"

# music with synced lyrics next to it (#41)
ff -f lavfi -i "sine=f=523:d=10" -c:a flac "$M/song.flac"
printf '[ti:Test song]\n[00:01.00]Line one\n[00:03.00]Line two\n[00:05.00]Line three\n' > "$M/song.lrc"

# a folder with episodes
cp "$M/video.mp4" "$M/Show/Show_S01E01.mp4"; cp "$M/video.mp4" "$M/Show/Show_S01E02.mp4"

# a MIDI file (#36): a C major scale, 120 bpm, one note per quarter
python3 - "$M/tune.mid" <<'PY'
import struct, sys
ev = b''
for n in (60, 62, 64, 65, 67, 69, 71, 72):
    ev += b'\x00\x90' + bytes([n, 100]) + b'\x83\x60\x80' + bytes([n, 0])
ev += b'\x00\xff\x2f\x00'
open(sys.argv[1], 'wb').write(b'MThd' + struct.pack('>IHHH', 6, 0, 1, 480) + b'MTrk' + struct.pack('>I', len(ev)) + ev)
PY

# an HLS stream (#16): 2 s segments
ff -f lavfi -i "$V:d=10" -f lavfi -i "sine=f=660:d=10" -c:v libx264 -g 50 -pix_fmt yuv420p -c:a aac -f hls -hls_time 2 \
   -hls_playlist_type vod -hls_segment_filename "$W/hls/seg%02d.ts" "$W/hls/index.m3u8"

ls -la "$M" "$W/hls"
