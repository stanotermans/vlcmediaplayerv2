<div align="center">

<img src="docs/icon.png" width="96" alt="">

# VLC Media Player – Redesign

**A modern desktop media player built from the VLC redesign by [Juxtopposed](https://www.youtube.com/@juxtopposed).**
For Windows, macOS and Linux · plays almost anything thanks to built-in FFmpeg.

[**⬇️ Download**](https://github.com/stanotermans/vlcmediaplayerv2/releases/latest) ·
[Download page](https://stanotermans.github.io/vlcmediaplayerv2/) ·
[Design video](https://www.youtube.com/watch?v=ERFeOgqk324)

<img src="docs/screenshots/library.png" alt="Library" width="860">

</div>

> [!NOTE]
> This is an **unofficial fan project**. It is not made by, affiliated with, or endorsed by VideoLAN, the makers of the real VLC.
> "VLC" and the cone logo are trademarks of VideoLAN.

## 🎨 Design credits: Juxtopposed

The entire design of this app comes from **Juxtopposed**: the library, the player, the onboarding, the settings window, the menus and the audio/video panels.

- 📺 Video: **[I Redesigned VLC After 25 Years](https://www.youtube.com/watch?v=ERFeOgqk324)** by [Juxtopposed](https://www.youtube.com/@juxtopposed)
- 🎨 Figma: **[VLC Redesign (Community)](https://www.figma.com/design/7fsD7tE4rIOTEfaLAAQiDY/VLC-Redesign--Community-)**

This repository turns that design into a working app. All credit for the design goes to Juxtopposed. Go watch the video! 🙌

## ⬇️ Download

Open the **[latest release](https://github.com/stanotermans/vlcmediaplayerv2/releases/latest)** and pick the file for your system:

| Operating system | File |
|---|---|
| 🪟 **Windows 10 / 11** | `VLC-Media-Player-Setup-<version>-x64.exe` (installer) or `…-Portable-<version>.exe` |
| 🪟 Microsoft Store package | `VLC-Media-Player-Store-<version>-x64.appx` |
| 🍎 **macOS** (Apple Silicon / Intel) | `VLC-Media-Player-<version>-mac-arm64.dmg` / `…-mac-x64.dmg` |
| 🐧 **Debian, Ubuntu, Linux Mint, Chrome OS** | `vlc-redesign-<version>-amd64.deb` |
| 🐧 **Fedora, openSUSE, Red Hat** | `vlc-redesign-<version>-x86_64.rpm` |
| 🐧 **Arch Linux, Manjaro** | `vlc-redesign-<version>-x64.pacman` |
| 🐧 **Any Linux** (Gentoo, Slackware, …) | `vlc-redesign-<version>-x86_64.AppImage` or `.tar.gz` |

Or use the **[download page](https://stanotermans.github.io/vlcmediaplayerv2/)**, which detects your system automatically.

> The app's interface is in **Dutch**.

<details>
<summary><b>Installing on Linux</b></summary>

```bash
sudo apt install ./vlc-redesign-*-amd64.deb        # Debian, Ubuntu, Mint, Chrome OS
sudo dnf install ./vlc-redesign-*-x86_64.rpm       # Fedora, Red Hat
sudo zypper install ./vlc-redesign-*-x86_64.rpm    # openSUSE
sudo pacman -U ./vlc-redesign-*-x64.pacman         # Arch, Manjaro
chmod +x vlc-redesign-*.AppImage && ./vlc-redesign-*.AppImage   # any distribution
```

**Chrome OS:** turn on *Settings → About ChromeOS → Developers → Linux development environment*, then open the `.deb` file from the Files app.
</details>

<details>
<summary><b>First launch on Windows or macOS</b></summary>

The app is not code-signed (that requires a paid certificate), so your system shows a warning the first time:

- **Windows:** on the blue SmartScreen dialog, click *More info* → *Run anyway*.
- **macOS:** right-click the app → *Open* → *Open*. Or in Terminal:
  ```bash
  xattr -dr com.apple.quarantine "/Applications/VLC Media Player.app"
  ```
</details>

## ✨ Features

- **Plays almost anything.** MP4, MKV, AVI, MOV, WMV, FLV, WebM, MP3, FLAC, AC3/DTS and more. Anything Chromium can't play natively is converted on the fly by the built-in FFmpeg.
- **Onboarding** on first launch: pick a media folder, choose a theme and accent color (with live preview), and learn the key shortcuts.
- **Library** with videos, music, network streams, playlists and recently played. Browse folders with breadcrumbs (Videos ▸ Shows ▸ The Wand ▸ S01), "continue watching", and watched items dimmed.
- **Player** with mini player, queue, resume where you left off, repeat/shuffle, playback speed, picture-in-picture, fullscreen and hide-UI mode.
- **Subtitles:** embedded and external `.srt`/`.ass`/`.vtt` files load automatically. You can set the delay, speed, duration, font, color, outline and background.
- **Audio:** multiple audio tracks, a 10-band equalizer with 18 presets, compressor, spatial audio (reverb), stereo widener and volume boost up to 200%.
- **Video:** brightness, contrast, saturation, hue, gamma, sharpen, film grain, negative, posterize, grayscale, sepia, pixel cropping, rotate, zoom and mirror.
- **Themes:** light, dark or system, with 9 accent colors.
- **Recording** (R) and **snapshots** (Shift+S).
- **Settings:** right-click menu with submenus, quick settings in the player, and a full settings window with search (Ctrl+P).

<details>
<summary><b>Keyboard shortcuts</b></summary>

| Key | Action | Key | Action |
|---|---|---|---|
| `Space` | Play / pause | `F` | Fullscreen |
| `←` `→` | Seek | `↑` `↓` | Volume |
| `<` `>` / `P` `N` | Previous / next | `Q` | Queue |
| `,` `.` | Previous / next frame | `L` | Library / player |
| `V` | Cycle subtitle track | `B` | Cycle audio track |
| `Shift+S` | Snapshot | `R` | Record |
| `S` | Stop | `M` | Mute |
| `[` `]` `=` | Slower / faster / normal | `G` `H` | Subtitle delay |
| `Ctrl+O` | Open files | `Ctrl+N` | Network stream |
| `Ctrl+P` | Settings | `Ctrl+\` | Hide interface |
| `F1` | All shortcuts | `Ctrl+Q` | Quit |
</details>

## 🖼️ Screenshots

| Onboarding | Player with quick settings |
|---|---|
| <img src="docs/screenshots/onboarding.png" alt="Onboarding"> | <img src="docs/screenshots/player.png" alt="Player"> |
| **Settings** | **Light mode** |
| <img src="docs/screenshots/settings.png" alt="Settings"> | <img src="docs/screenshots/light.png" alt="Light mode"> |

## 🛠️ Building from source

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
cd app
npm install
npm start               # run the development version
npm run dist:win        # Windows: installer + portable (on Windows)
npm run dist:store      # Microsoft Store package (on Windows)
npm run dist:mac        # macOS (on a Mac)
npm run dist:linux      # Linux: AppImage, deb, rpm, pacman, tar.gz (on Linux)
```

### Making a release

The workflow [`.github/workflows/build.yml`](.github/workflows/build.yml) builds the app on GitHub's servers for Windows, macOS and Linux, and creates a release with a download table automatically:

```bash
# first set the version in app/package.json, e.g. "version": "1.2.1"
git tag v1.2.1
git push origin v1.2.1
```

You can also run the workflow manually (*Actions → Build & Release → Run workflow*). The files then appear under *Artifacts*.

### Download page (GitHub Pages)

The page in [`docs/`](docs/index.html) is published at `https://stanotermans.github.io/vlcmediaplayerv2/`. To enable it, go to *Settings → Pages → Deploy from a branch → `main` / `/docs`*. It always shows the latest release.

### BSD

Electron has no official builds for BSD. On FreeBSD (and OpenBSD) you can run the app with the system's Electron port; it then uses the system's FFmpeg:

```sh
pkg install electron36 ffmpeg node npm      # the port's version number may differ: pkg search electron
cd app && npm install --ignore-scripts --omit=dev
electron36 .
```

To use your own FFmpeg, set `VLCX_FFMPEG=/path/to/ffmpeg` and `VLCX_FFPROBE=/path/to/ffprobe`.

### Project structure

```
app/
  main.js          Electron main process: window, local media server, FFmpeg transcoding, file dialogs
  preload.js       Secure bridge between the main process and the UI
  src/
    index.html     UI layout
    style.css      Design (light/dark, accent color)
    settings.js    Preferences and theme
    ui.js          Building blocks: sliders, toggles, menus, dialogs
    effects.js     Audio effects (Web Audio) and video filters
    panels.js      Quick settings, settings window and dialogs
    onboarding.js  Welcome screen
    app.js         Library, player, subtitles, keyboard shortcuts
  build/icon.png   App icon (generated by build/make-icon.js)
docs/              Download page for GitHub Pages
```

## ❓ Why not iOS, Android, …?

The app runs on [Electron](https://www.electronjs.org), which only supports Windows, macOS and Linux. **iOS, Apple TV and Android** would need a separate native app. **Windows Phone** has been discontinued, and **NetBSD, Solaris, QNX and OS/2** have no Electron or Chromium.

## 📄 License

- **Code:** [MIT](LICENSE) © Stan Otermans
- **Design:** © [Juxtopposed](https://www.youtube.com/@juxtopposed), used with attribution based on the publicly shared Figma community file.
- Includes [FFmpeg](https://ffmpeg.org) (LGPL/GPL) via [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) and [ffprobe-static](https://github.com/joshwnj/ffprobe-static).
- "VLC" and the cone logo are trademarks of [VideoLAN](https://www.videolan.org). This project is not affiliated with VideoLAN.
