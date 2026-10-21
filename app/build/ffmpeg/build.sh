#!/usr/bin/env bash
# Builds a slim, self-contained ffmpeg for the app – the same idea VLC uses in contrib/src/ffmpeg/rules.mak:
# start from --disable-everything and only switch on what the player needs. All decoders, demuxers and
# parsers stay in (so it still plays almost anything); encoders, muxers and filters are limited to the
# handful the app uses (live H.264/AAC transcode to fragmented MP4, JPEG thumbnails, WebVTT subtitles).
#
#   bash build.sh <target>        target: linux-x64 | win-x64 | mac-arm64 | mac-x64 | android-arm64 | android-x64
#
# linux-x64 and win-x64 run inside Docker (see docker.sh); mac-* run on macOS with Xcode command line tools.
# Result: out/<target>/ffmpeg[.exe]. The binary is GPL (because of x264); this script is its build recipe.
set -euo pipefail

TARGET=${1:?usage: build.sh linux-x64|win-x64|mac-arm64|mac-x64|android-arm64|android-x64}
FFMPEG_VERSION=8.1.2                                       # same release as VLC 3.0.24
X264_HASH=e067ab0b530395f90b578f6d05ab0a225e2efdf9         # same commit as VLC 3.0.24
DVDREAD_VERSION=6.1.3                                      # DVD ISOs and VIDEO_TS folders (ffmpeg's dvdvideo demuxer),
DVDNAV_VERSION=6.1.1                                       # same versions as VLC 3.0.24; without libdvdcss (no decryption)

HERE=$(cd "$(dirname "$0")" && pwd)
WORK=${WORK:-$HERE/work/$TARGET}
PREFIX=$WORK/prefix
OUT=$HERE/out/$TARGET
JOBS=$( (nproc || sysctl -n hw.ncpu) 2>/dev/null || echo 4)
mkdir -p "$WORK" "$PREFIX" "$OUT"
cd "$WORK"

fetch() { [ -f "$2" ] || curl -fsSL --retry 3 -o "$2" "$1"; }
fetch "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" ffmpeg.tar.xz
fetch "https://code.videolan.org/videolan/x264/-/archive/$X264_HASH/x264-$X264_HASH.tar.bz2" x264.tar.bz2
fetch "https://download.videolan.org/pub/videolan/libdvdread/$DVDREAD_VERSION/libdvdread-$DVDREAD_VERSION.tar.bz2" dvdread.tar.bz2
fetch "https://download.videolan.org/pub/videolan/libdvdnav/$DVDNAV_VERSION/libdvdnav-$DVDNAV_VERSION.tar.bz2" dvdnav.tar.bz2
rm -rf ffmpeg-src x264-src dvdread-src dvdnav-src && mkdir ffmpeg-src x264-src dvdread-src dvdnav-src
tar -xjf dvdread.tar.bz2 -C dvdread-src --strip-components=1
tar -xjf dvdnav.tar.bz2 -C dvdnav-src --strip-components=1
tar -xJf ffmpeg.tar.xz -C ffmpeg-src --strip-components=1
tar -xjf x264.tar.bz2 -C x264-src --strip-components=1

# ---- per-target toolchain ----
X264_HOST=(); AC_HOST=(); FF_CROSS=(); FF_TLS=(); EXTRA_LDFLAGS=""; EXT=""
case "$TARGET" in
  linux-x64)   # Alpine/musl → fully static, runs on any distribution
    EXTRA_LDFLAGS="-static"
    FF_TLS=(--enable-openssl)
    ;;
  win-x64)     # cross-compiled with mingw-w64; Schannel = Windows' own TLS
    X264_HOST=(--host=x86_64-w64-mingw32 --cross-prefix=x86_64-w64-mingw32-)
    AC_HOST=(--host=x86_64-w64-mingw32)
    FF_CROSS=(--enable-cross-compile --target-os=mingw32 --arch=x86_64 --cross-prefix=x86_64-w64-mingw32-)
    EXTRA_LDFLAGS="-static"
    FF_TLS=(--enable-schannel)
    EXT=".exe"
    ;;
  mac-arm64|mac-x64)
    export MACOSX_DEPLOYMENT_TARGET=12.0                   # Electron 38 needs macOS 12+
    ARCH=${TARGET#mac-}; [ "$ARCH" = x64 ] && ARCH=x86_64
    export CC="clang -arch $ARCH"
    X264_HOST=(--host=$ARCH-apple-darwin)
    AC_HOST=(--host=${ARCH/arm64/aarch64}-apple-darwin)        # libdvdread/libdvdnav's config.sub only knows "aarch64"
    FF_CROSS=(--enable-cross-compile --target-os=darwin --arch=$ARCH --cc="clang -arch $ARCH")
    FF_TLS=(--enable-securetransport)
    ;;
  android-arm64|android-x64)   # Vela Player for Android (#53): a program next to the app's libraries (lib/<abi>/libffmpeg.so),
                               # built with the NDK (ANDROID_NDK_ROOT) against Android 9 (API 28) like the app; no TLS: local files only
    ARCH=aarch64; [ "$TARGET" = android-x64 ] && ARCH=x86_64
    TC=$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin
    export CC=$TC/$ARCH-linux-android28-clang CXX=$TC/$ARCH-linux-android28-clang++ AR=$TC/llvm-ar RANLIB=$TC/llvm-ranlib STRIP=$TC/llvm-strip NM=$TC/llvm-nm
    X264_HOST=(--host=$ARCH-linux-android --cross-prefix=$TC/llvm-)
    AC_HOST=(--host=$ARCH-linux-android)
    FF_CROSS=(--enable-cross-compile --target-os=android --arch=$ARCH --cc=$CC --cxx=$CXX --ar=$AR --ranlib=$RANLIB --nm=$NM --strip=$STRIP --enable-pic)
    ;;
  *) echo "unknown target $TARGET"; exit 1 ;;
esac

# ---- x264 (8-bit 4:2:0 only – that is all the transcoder outputs) ----
( cd x264-src
  ./configure --prefix="$PREFIX" ${X264_HOST[@]+"${X264_HOST[@]}"} --enable-static --enable-pic --disable-cli \
    --bit-depth=8 --chroma-format=420 --disable-opencl --disable-avs --disable-swscale --disable-lavf \
    --disable-ffms --disable-gpac --disable-lsmash
  make -j"$JOBS" && make install )

# ---- libdvdread + libdvdnav (static), with VLC's patches ----
( cd dvdread-src
  for p in "$HERE"/patches/dvdread/*.patch; do patch -p1 < "$p"; done
  ./configure --prefix="$PREFIX" ${AC_HOST[@]+"${AC_HOST[@]}"} --enable-static --disable-shared --with-pic --disable-apidoc
  make -j"$JOBS" && make install )
( cd dvdnav-src
  for p in "$HERE"/patches/dvdnav/*.patch; do patch -p1 < "$p"; done
  # VLC's configure.ac patch: same struct packing as libdvdread and ffmpeg (no -mno-ms-bitfields on Windows)
  sed -i.bak 's/-mno-ms-bitfields//g' configure
  PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig" ./configure --prefix="$PREFIX" ${AC_HOST[@]+"${AC_HOST[@]}"} --enable-static --disable-shared --with-pic
  make -j"$JOBS" && make install )

# ---- ffmpeg ----
( cd ffmpeg-src
  PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}" ./configure \
    --prefix="$PREFIX" ${FF_CROSS[@]+"${FF_CROSS[@]}"} --pkg-config=pkg-config --pkg-config-flags=--static \
    --extra-cflags="-I$PREFIX/include" --extra-ldflags="-L$PREFIX/lib $EXTRA_LDFLAGS" \
    --enable-gpl --enable-version3 --enable-static --disable-shared \
    --disable-autodetect --disable-debug --disable-doc --disable-ffplay --disable-ffprobe \
    --disable-everything --disable-avdevice \
    --enable-decoders --enable-demuxers --enable-parsers --enable-bsfs --enable-protocols \
    --enable-libx264 --enable-zlib --enable-libdvdread --enable-libdvdnav ${FF_TLS[@]+"${FF_TLS[@]}"} \
    --enable-encoder=libx264,aac,flac,mjpeg,webvtt,wrapped_avframe \
    --enable-muxer=mp4,null,image2pipe,webvtt \
    --enable-filter=scale,aresample,format,aformat,null,anull,copy,acopy,showinfo,trim,atrim,setpts,asetpts,crop,transpose,hflip,vflip,setsar
  make -j"$JOBS" && make install )

cp "$PREFIX/bin/ffmpeg$EXT" "$OUT/ffmpeg$EXT"
case "$TARGET" in win-x64) x86_64-w64-mingw32-strip "$OUT/ffmpeg$EXT" ;; mac-*) strip -x "$OUT/ffmpeg" ;; android-*) "$STRIP" "$OUT/ffmpeg" ;; *) strip "$OUT/ffmpeg" ;; esac
ls -l "$OUT/ffmpeg$EXT"
