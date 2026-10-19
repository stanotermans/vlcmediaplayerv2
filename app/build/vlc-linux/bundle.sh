#!/usr/bin/env bash
# Linux x64, in two steps (docker.sh runs each in its own container):
#   bundle.sh libvlc  (Debian 12) libVLC for all Linux packages (AppImage, deb, rpm, pacman, tar.gz). VideoLAN
#                     publishes no Linux libVLC builds, so this takes Debian's libVLC 3 packages (security updates
#                     until 2028) with the libraries they need, minus the ones every desktop system has (glibc, the C++
#                     runtime, graphics, X11, ALSA, fonts). The libraries find each other through their rpath ($ORIGIN).
#                     FFmpeg is our own slim build of the same 5.1 series (same library versions, so VLC's plugins use
#                     it): decoders and demuxers only, instead of Debian's full one with encoders (75 MB less). Its
#                     functions are renamed (vlcx_av…) in it and in the plugins that call it: Electron's own FFmpeg
#                     (libffmpeg.so, unversioned symbols) would otherwise answer those calls inside the app.
#                     Needs glibc 2.36 (Debian 12, Ubuntu 23.04, Fedora 37 and newer); elsewhere the app uses Classic.
#   bundle.sh module  (Debian 11, glibc 2.31) the vlcview module, which only needs glibc.
# The system's libVLC is not used: inside Electron its FFmpeg plugins would get Electron's own FFmpeg.
# Output: $VLC_OUT (default /app/vendor/vlc): lib/, lib/vlc/plugins/, COPYING-VLC.txt, README.txt, VERSION; and
#         $MOD_OUT (default /app/native/vlcview/build/Release): vlcview.node
# Run through docker.sh (needs Docker).
set -euo pipefail
STEP=${1:?usage: bundle.sh libvlc|module}
APP=${APP:-/app}
OUT=${VLC_OUT:-$APP/vendor/vlc}
MOD_OUT=${MOD_OUT:-$APP/native/vlcview/build/Release}
ARCH_DIR=/usr/lib/x86_64-linux-gnu

if [ "$STEP" = module ]; then
  rm -rf /tmp/vlcview && cp -r "$APP/native/vlcview" /tmp/vlcview && rm -rf /tmp/vlcview/build
  ( cd /tmp/vlcview && npx --yes node-gyp@12 rebuild --arch=x64 >/dev/null )
  mkdir -p "$MOD_OUT" && cp /tmp/vlcview/build/Release/vlcview.node "$MOD_OUT/"
  echo "vlcview.node: needs $(objdump -T "$MOD_OUT/vlcview.node" | grep -o 'GLIBC_[0-9.]*' | sort -Vu | tail -1)"
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends libvlc5 libvlccore9 vlc-plugin-base vlc-plugin-video-output vlc-bin patchelf \
  build-essential nasm pkg-config libdav1d-dev curl ca-certificates xz-utils >/dev/null

# FFmpeg 5.1 (libavcodec.so.59 …, like Debian 12), checked against the release's SHA-256 (signed by FFmpeg's release key)
FF_VERSION=5.1.10
FF_SHA256=392306d6fc45dab0e9e0ea55381e071842e83a2fb31d320aeda40477a7766293
FF=/tmp/ffmpeg; rm -rf $FF /tmp/ffp && mkdir -p $FF
curl -sSL --retry 5 --retry-delay 10 --retry-all-errors -o /tmp/ffmpeg.tar.xz "https://ffmpeg.org/releases/ffmpeg-$FF_VERSION.tar.xz"
echo "$FF_SHA256  /tmp/ffmpeg.tar.xz" | sha256sum -c - >/dev/null
tar -xJf /tmp/ffmpeg.tar.xz -C $FF --strip-components=1
( cd $FF && ./configure --prefix=/tmp/ffp --enable-shared --disable-static --enable-pic --disable-programs --disable-doc \
    --disable-encoders --disable-muxers --disable-devices --disable-filters --disable-avdevice --disable-avfilter --disable-postproc \
    --disable-hwaccels --disable-vaapi --disable-vdpau --disable-vulkan --disable-xlib --disable-libxcb --disable-sdl2 \
    --disable-bzlib --disable-lzma --disable-iconv --enable-libdav1d >/dev/null && make -j"$(nproc)" >/dev/null && make install >/dev/null )

rm -rf "$OUT"; mkdir -p "$OUT/lib/vlc"
cp -L $ARCH_DIR/libvlc.so.5 $ARCH_DIR/libvlccore.so.9 "$OUT/lib/"   # real files under their soname (no symlinks)
for l in libavcodec.so.59 libavformat.so.59 libavutil.so.57 libswscale.so.6 libswresample.so.4; do cp -L /tmp/ffp/lib/$l "$OUT/lib/"; done
# plugins, without the VLC interface, visualizations, service discovery and streaming (like the Windows bundle)
cp -a $ARCH_DIR/vlc/plugins "$OUT/lib/vlc/"
( cd "$OUT/lib/vlc/plugins" && rm -rf gui lua control visualization video_splitter services_discovery )
find "$OUT/lib/vlc/plugins/stream_out" -name '*.so' ! -regex '.*/libstream_out_\(record\|standard\|es\|dummy\|duplicate\)_plugin\.so' -delete 2>/dev/null || true
find "$OUT/lib/vlc/plugins/access_output" -name '*.so' ! -name 'libaccess_output_file_plugin.so' -delete 2>/dev/null || true
# plugins that need a desktop toolkit or a GPU stack the app does not use with VLC (it draws the video itself)
find "$OUT/lib/vlc/plugins" \( -name '*_qt_*' -o -name 'libxcb_*' -o -name 'libglx_*' -o -name 'libgl_plugin.so' -o -name 'libegl_*' \
  -o -name 'libvaapi_*' -o -name 'libvdpau_*' -o -name 'libwl_*' -o -name 'libglconv_*' -o -name 'libgles2_*' -o -name 'libglspectrum_*' \) -delete
# plugins with large libraries of their own that a player does not need: SVG pictures, SDL images, text-mode video,
# the x265 encoder, Icecast and SFTP output, the desktop keyring, post-processing (not in the slim FFmpeg)
find "$OUT/lib/vlc/plugins" \( -name 'libsvg*_plugin.so' -o -name 'libsdl_image_plugin.so' -o -name 'libcaca_plugin.so' -o -name 'libaa_plugin.so' \
  -o -name 'libx26[45]_plugin.so' -o -name 'libaccess_output_shout_plugin.so' -o -name 'libsftp_plugin.so' -o -name 'libsecret_plugin.so' \
  -o -name 'libpostproc_plugin.so' -o -name 'libstream_out_chromaprint_plugin.so' -o -name 'libstream_out_chromecast_plugin.so' \) -delete

# Libraries every desktop system has (and that must match the system: glibc, graphics drivers, sound server), after
# the AppImage project's excludelist
EXCLUDE='^(ld-linux.*|libc|libm|libdl|libpthread|librt|libresolv|libutil|libanl|libnsl|libcrypt|libstdc\+\+|libgcc_s|libGL.*|libEGL|libGLX|libGLdispatch|libOpenGL|libgbm|libdrm.*|libva.*|libvdpau|libX.*|libxcb.*|libxkbcommon.*|libwayland-.*|libasound|libjack|libfontconfig|libfreetype|libharfbuzz|libexpat|libz|libuuid|libdbus-1|libsystemd|libudev|libselinux|libgpg-error|libgcrypt|libcom_err|libkeyutils|libkrb5.*|libgssapi_krb5|libk5crypto)\.so'
copy_deps() {   # copies the not-excluded libraries $1 needs into lib/ (ours first: the slim FFmpeg)
  LD_LIBRARY_PATH="$OUT/lib" ldd "$1" 2>/dev/null | awk '/=> \//{print $3}' | while read -r dep; do
    name=$(basename "$dep")
    [[ "$name" =~ $EXCLUDE ]] && continue
    [ -e "$OUT/lib/$name" ] && continue
    cp -L "$dep" "$OUT/lib/$name"
    echo "$OUT/lib/$name"
  done
}
todo=$(find "$OUT/lib" -name '*.so*' -type f)
while [ -n "$todo" ]; do
  next=""
  for f in $todo; do next="$next $(copy_deps "$f")"; done
  todo=$(echo $next)
done
# Rename FFmpeg's functions (patchelf 0.18 rewrites names and hash tables; Debian 12 has 0.14)
PE_SHA256=ce84f2447fb7a8679e58bc54a20dc2b01b37b5802e12c57eece772a6f14bf3f0
curl -sSL --retry 5 --retry-delay 10 --retry-all-errors -o /tmp/patchelf.tar.gz https://github.com/NixOS/patchelf/releases/download/0.18.0/patchelf-0.18.0-x86_64.tar.gz
echo "$PE_SHA256  /tmp/patchelf.tar.gz" | sha256sum -c - >/dev/null
mkdir -p /tmp/patchelf && tar -xzf /tmp/patchelf.tar.gz -C /tmp/patchelf
PE=/tmp/patchelf/bin/patchelf
FFLIBS="libavcodec.so.59 libavformat.so.59 libavutil.so.57 libswscale.so.6 libswresample.so.4"
for l in $FFLIBS; do
  objdump -T "$OUT/lib/$l" | awk 'NF >= 2 && !/\*UND\*/ && $(NF-1) ~ /^LIB(AVCODEC|AVFORMAT|AVUTIL|SWSCALE|SWRESAMPLE)_/ && $NF != $(NF-1) {print $NF}'
done | sort -u > /tmp/ffsyms
awk '{print $1" vlcx_"$1}' /tmp/ffsyms > /tmp/ffmap
renamed=0
for f in $(find "$OUT/lib" -name '*.so*' -type f); do
  name=$(basename "$f")
  if [[ " $FFLIBS " == *" $name "* ]] || objdump -T "$f" | awk '/\*UND\*/{print $NF}' | grep -qxFf /tmp/ffsyms; then
    $PE --rename-dynamic-symbols /tmp/ffmap "$f"; renamed=$((renamed + 1))
  fi
done
left=$(for f in $(find "$OUT/lib" -name '*.so*' -type f); do objdump -T "$f" | awk '/\*UND\*/{print $NF}'; done | grep -cxFf /tmp/ffsyms || true)
echo "FFmpeg: $(wc -l < /tmp/ffsyms) functions renamed in $renamed files, $left calls to the old names left"
[ "$left" = 0 ] || exit 1

# rpaths: lib/ for everything, so the system's copies are not used instead
for f in "$OUT"/lib/*.so*; do [ -L "$f" ] || patchelf --set-rpath '$ORIGIN' "$f"; done
find "$OUT/lib/vlc/plugins" -name '*.so' -exec patchelf --set-rpath '$ORIGIN/../../..' {} \;
$ARCH_DIR/vlc/vlc-cache-gen "$OUT/lib/vlc/plugins"   # plugins.dat: faster start
# every plugin must still find all its symbols (the slim FFmpeg has the same functions as Debian's)
missing=$(for f in $(find "$OUT/lib/vlc/plugins" -name '*.so'); do ldd -r "$f" 2>&1 | grep -E 'undefined symbol|not found' | grep -vE "$EXCLUDE" | sed "s|^|$(basename "$f"): |" || true; done)
if [ -n "$missing" ]; then echo "$missing" | head -20; echo "plugins with missing libraries or symbols"; exit 1; fi

V=$(dpkg-query -W -f='${Version}' libvlc5)
echo "$V linux bundle" > "$OUT/VERSION"
cp /usr/share/doc/libvlc5/copyright "$OUT/COPYING-VLC.txt"
cat > "$OUT/README.txt" <<EOF
libVLC $V from Debian 12 (https://packages.debian.org/bookworm/libvlc5) with the libraries it needs, for VLC Redesign.
FFmpeg $FF_VERSION (https://ffmpeg.org, LGPL 2.1 or later) built for it with decoders and demuxers only.
VLC and libVLC are made by VideoLAN and licensed under the LGPL 2.1 or later (some plugins GPL); see COPYING-VLC.txt.
The other libraries keep their own licenses (see https://packages.debian.org/bookworm/ for each package).
Source code: https://sources.debian.org/src/vlc/ and https://download.videolan.org/pub/videolan/vlc/
EOF

echo "libVLC $V: $(du -sh "$OUT" | cut -f1), $(ls "$OUT/lib" | wc -l) files in lib, $(find "$OUT/lib/vlc/plugins" -name '*.so' | wc -l) plugins"
