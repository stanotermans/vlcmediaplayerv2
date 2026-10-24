# Building Vela Player

Vela Player 3 is a native app written with **Qt 6.8** (C++ and QML) and **libVLC 3**, the engine of VLC. Its source is in [`qt/`](qt). The old Electron version 2 is still in [`app/`](app); how to build that is [at the end](#version-2-electron).

The release builds are made by GitHub Actions ([`.github/workflows/qt.yml`](.github/workflows/qt.yml) for Windows, macOS, Linux and the Flatpak, [`android.yml`](.github/workflows/android.yml) for Android). The workflows are the reference: if a step below doesn't work for you, compare it with them.

- [What you need](#what-you-need)
- [Windows](#windows)
- [macOS](#macos)
- [Linux](#linux)
- [Android](#android)
- [The slim FFmpeg](#the-slim-ffmpeg)
- [libVLC](#libvlc)
- [Tests](#tests)
- [Making a release](#making-a-release)
- [Download page](#download-page)
- [Project structure](#project-structure)
- [Version 2 (Electron)](#version-2-electron)

## What you need

- **Qt 6.8.3** with the modules *Qt Multimedia*, *Qt Shader Tools* and *Qt Image Formats* (from the [Qt online installer](https://www.qt.io/download-qt-installer), or [aqtinstall](https://github.com/miurahr/aqtinstall)).
- **CMake** 3.21 or newer and **Ninja**.
- A C++17 compiler: Visual Studio 2022 (Build Tools are enough) on Windows, Xcode's command line tools on macOS, GCC on Linux.
- **libVLC 3** and the **slim FFmpeg** next to the app (see below). Without libVLC the app starts but cannot play.
- **Node.js** 20 or newer, only for [`app/scripts/fetch-vlc.js`](app/scripts/fetch-vlc.js), which fetches libVLC on Windows and macOS.

## Windows

```bat
qt\build.bat
```

[`build.bat`](qt/build.bat) uses Qt in `C:\Qt\6.8.3\msvc2022_64` (or `QT_DIR`) and the Visual Studio 2022 Build Tools. The program lands in `qt\build\Vela Player.exe`; `qt\build.bat deploy` also copies Qt's files next to it.

To run the development build, give it libVLC and FFmpeg:

```bat
cd app && node scripts/fetch-vlc.js && cd ..
set VLCR_VLC=%CD%\app\vendor\vlc
set VLCR_FFMPEG=C:\path\to\ffmpeg.exe
"qt\build\Vela Player.exe"
```

The installer and the portable zip (from Git Bash, in a shell with the Visual Studio environment; the installer needs NSIS):

```bash
qt/packaging/windows/package.sh <ffmpeg.exe> [out dir]
```

## macOS

On a Mac with Qt 6.8 and Xcode's command line tools:

```bash
cd app && node scripts/fetch-vlc.js mac-arm64 && cd ..     # or mac-x64
qt/packaging/macos/package.sh arm64 <ffmpeg for arm64> [out dir]   # or x64
```

This builds `Vela Player.app` (Qt's frameworks by `macdeployqt`, libVLC in `Contents/MacOS/vlc`), signs it ad hoc and puts it in a `.dmg`.

## Linux

VideoLAN publishes no Linux builds of libVLC, so [`app/build/vlc-linux`](app/build/vlc-linux) bundles Debian 12's libVLC (needs Docker):

```bash
bash app/build/vlc-linux/docker.sh          # → app/vendor/vlc
QT_ROOT_DIR=~/Qt/6.8.3/gcc_64 qt/packaging/linux/package.sh <ffmpeg> [out dir]
```

[`package.sh`](qt/packaging/linux/package.sh) makes an AppDir with linuxdeploy and from it the AppImage, `.deb`, `.rpm`, Arch package and `.tar.gz`. The app runs through X11 (XWayland on Wayland desktops), because it draws its own window frame.

**Flatpak** ([`qt/packaging/flatpak`](qt/packaging/flatpak)): built on KDE's runtime with `flatpak-builder` 1.4 or newer, e.g. in Flathub's container `ghcr.io/flathub-infra/flatpak-github-actions:kde-6.11`:

```bash
qt/packaging/flatpak/package.sh <ffmpeg> app/vendor/vlc [out dir]
```

## Android

```bash
qt/packaging/android/build.sh arm64-v8a <Qt for android_arm64_v8a> [ffmpeg] [out dir]   # or x86_64
```

It needs `ANDROID_SDK_ROOT`, `ANDROID_NDK_ROOT` (r26b), `JAVA_HOME` (JDK 17), CMake and Ninja, and `QT_HOST_PATH` pointing to the desktop Qt of the same version. libVLC comes from VideoLAN's `libvlc-all` on Maven Central; FFmpeg is built with the NDK (`app/build/ffmpeg/build.sh android-arm64`).

- Signing: `APK_KEYSTORE` (with `APK_KEYSTORE_PASS` and `APK_KEY_ALIAS`), otherwise Android's debug key.
- `FORMAT=aab` makes the app bundle for Google Play; `ANDROID_BUILD` raises the version code for another upload of the same version.

## The slim FFmpeg

Like VLC, the app doesn't ship a general-purpose FFmpeg. [`app/build/ffmpeg/build.sh`](app/build/ffmpeg/build.sh) builds FFmpeg from source with `--disable-everything`, then switches on all decoders, demuxers and parsers (plus dav1d for AV1, and libdvdread/libdvdnav for DVDs) but only the few encoders, muxers and filters the app uses: thumbnails, previews, live conversion and subtitles.

```bash
bash app/build/ffmpeg/docker.sh win-x64       # or linux-x64 (needs Docker)
bash app/build/ffmpeg/build.sh mac-arm64      # or mac-x64, on a Mac with nasm, pkg-config, meson and ninja
bash app/build/ffmpeg/build.sh android-arm64  # or android-x64, with ANDROID_NDK_ROOT
```

The result lands in `app/build/ffmpeg/out/<target>/`.

## libVLC

The app loads libVLC 3 at runtime from the folder `vlc` next to the program, or from `VLCR_VLC`.

- **Windows and macOS:** [`app/scripts/fetch-vlc.js`](app/scripts/fetch-vlc.js) takes libVLC and its plugins from VideoLAN's official VLC builds (checked against VideoLAN's SHA-256) and leaves out what the app doesn't use.
- **Linux:** Debian 12's libVLC, bundled by [`app/build/vlc-linux`](app/build/vlc-linux).
- **Android:** VideoLAN's libVLC for Android.

## Tests

The test suite starts the app with a fresh profile for each scenario, runs test steps in it and checks the results:

```bash
qt/tests/make-media.sh testdata                 # the test media, needs a full FFmpeg (e.g. Debian's or Ubuntu's)
python qt/tests/run.py "qt/build/Vela Player.exe" testdata --vlc app/vendor/vlc --ffmpeg <ffmpeg> \
       --soundfont app/assets/FluidR3Mono_GM.sf3 [test name …]
```

`VLCR_SCREEN` puts the test windows on another monitor (its Qt name, e.g. `VLCR_SCREEN="DELL U2720Q"`).

## Making a release

1. Set the version in [`qt/CMakeLists.txt`](qt/CMakeLists.txt) (`project(velaplayer VERSION 3.x.y …)`), add it to [`qt/CHANGELOG.md`](qt/CHANGELOG.md) and to the Flatpak metainfo.
2. Push a tag with the same version:

```bash
git tag v3.x.y
git push origin v3.x.y
```

The workflow builds and tests every desktop platform and creates the release with all the files. Without a tag (*Actions → Qt build (v3) → Run workflow*), it only builds and tests. Android goes to Google Play, not to GitHub releases.

## Download page

The page in [`docs/`](docs/index.html) is published at `https://stanotermans.github.io/vlcmediaplayerv2/` by [`pages.yml`](.github/workflows/pages.yml), together with the Flatpak repository. It always shows the latest release.

## Project structure

```
qt/
  CMakeLists.txt     the build; the version lives here
  build.bat          Windows build
  src/               C++: libVLC player, library, settings, subtitles, store (Pro), system and window details
  qml/               the interface: Main.qml, Theme.qml and
    controls/        buttons, sliders, menus, dialogs
    library/         library browser, cards, lists, rail
    player/          player view, control bar, quick settings, phone controls
    pages/           the settings pages
    dialogs/         media info, network, playlists, shortcuts, Pro
  shaders/           video filters, 360°, sharp upscaling
  lang/              translations (nl, de, fr, es, it, pl, pt; English is built in)
  assets/            icon and sounds
  packaging/         windows, macos, linux, flatpak, android
  tests/             run.py, make-media.sh
app/                 version 2 (Electron); app/build/ffmpeg and app/scripts/fetch-vlc.js are used by version 3 too
docs/                download page and privacy policy
```

## Version 2 (Electron)

The Electron app needs Node.js 20 or newer:

```bash
cd app
npm install
npm start               # the development version
npm run dist:win        # Windows: installer and portable (on Windows)
npm run dist:mac        # macOS (on a Mac)
npm run dist:linux      # Linux: AppImage, deb, rpm, pacman, tar.gz (on Linux)
```

Its libVLC is loaded by a small native module ([`app/native/vlcview`](app/native/vlcview)): `npx node-gyp@12 rebuild -C native/vlcview`. Releases of version 2 were made by [`build.yml`](.github/workflows/build.yml) from `v2.*` tags (all `v*` tags except `v3.*`).

### BSD

Electron has no official builds for BSD. On FreeBSD (and OpenBSD) version 2 runs with the system's Electron port and FFmpeg:

```sh
pkg install electron36 ffmpeg node npm      # the port's version number may differ: pkg search electron
cd app && npm install --ignore-scripts --omit=dev
electron36 .
```

To use your own FFmpeg, set `VLCX_FFMPEG=/path/to/ffmpeg`.
