#!/bin/bash
# Packages VLC Redesign 3 as a Flatpak (#54): a .flatpak file that installs on any Linux with Flatpak
#   (flatpak install VLC-Redesign-<version>-x86_64.flatpak; KDE's runtime comes from Flathub by itself).
#   qt/packaging/flatpak/package.sh <ffmpeg> <libVLC folder (app/build/vlc-linux)> [out dir]
# Needs flatpak and flatpak-builder with org.kde.Sdk//6.8 and org.kde.Platform//6.8 from Flathub.
set -euo pipefail
cd "$(dirname "$0")/../.."                       # qt/
FFMPEG=$(realpath "${1:?ffmpeg}"); VLC=$(realpath "${2:?libVLC folder}"); OUT=$(realpath -m "${3:-dist}")
VERSION=$(sed -n 's/^project(vlcredesign3 VERSION \([0-9.]*\).*/\1/p' CMakeLists.txt)
ID=io.github.stanotermans.VLCRedesign
B=$(realpath -m ../build-flatpak); S="$B/stage"
rm -rf "$S"; mkdir -p "$S" "$OUT"
# the sources (without build folders) and the parts that are not built here
tar -C .. --exclude='qt/build*' --exclude='qt/dist' --exclude='qt/deploy' -cf - qt | tar -C "$S" -xf -
cp -a "$VLC" "$S/vlc"
cp "$FFMPEG" "$S/ffmpeg"
cp ../app/assets/FluidR3Mono_GM.sf3 ../app/build/icon.png ../LICENSE packaging/linux/vlc-redesign.desktop packaging/flatpak/$ID.metainfo.xml "$S/"
[ -f keys.json ] && cp keys.json "$S/" || true
flatpak-builder --user --force-clean --disable-rofiles-fuse --repo="$B/repo" --state-dir="$B/state" "$B/app" packaging/flatpak/$ID.yml
flatpak build-bundle --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo "$B/repo" "$OUT/VLC-Redesign-$VERSION-x86_64.flatpak" $ID
ls -la "$OUT"/*.flatpak
