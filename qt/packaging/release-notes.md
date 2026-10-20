## ⬇️ Download for your operating system

| Operating system | Download | Notes |
|---|---|---|
| 🪟 **Windows 10 / 11** | {{WIN_SETUP}} | Recommended: installer with shortcut and "Open with" support |
| 🪟 Windows (no install) | {{WIN_PORTABLE}} | Unzip and run; keeps its settings next to it |
| 🍎 **macOS – Apple Silicon** (M1–M4) | {{MAC_ARM}} | macOS 12 or later |
| 🍎 macOS – Intel | {{MAC_X64}} | macOS 12 or later |
| 🐧 **Debian / Ubuntu / Linux Mint / Chrome OS** | {{DEB}} | `sudo apt install ./file.deb` |
| 🐧 **Fedora / openSUSE / Red Hat** | {{RPM}} | `sudo dnf install ./file.rpm` |
| 🐧 **Arch Linux / Manjaro** | {{PACMAN}} | `sudo pacman -U ./file.pkg.tar.zst` |
| 🐧 **Any Linux with Flatpak** | {{FLATPAK}} | `flatpak install ./file.flatpak` |
| 🐧 **Any Linux** (Gentoo, Slackware, …) | {{APPIMAGE}} | `chmod +x` and run |
| 🐧 Linux archive | {{TARGZ}} | Extract and run `bin/vlc-redesign` |

Prefer a one-click download? Use the **[download page](https://stanotermans.github.io/vlcmediaplayerv2/)**: it detects your system automatically.

## ✨ VLC Redesign 3

The number 1 best build of **Juxtopposed's VLC redesign**, now rebuilt from the ground up with **Qt** and **VLC's own engine (libVLC)** instead of a web browser:

- Starts faster and uses far less memory and disk space than v2.x.
- Plays everything VLC plays, with hardware decoding: no more converting with FFmpeg ("Classic" engine is gone).
- Every screen of v2.x is still there: the library, playlists, the player, quick settings, subtitles and lyrics, effects, DVD menus, recording, the mini player, the onboarding.
- **Coming from v2.x?** Your settings, library, playlists, positions and bookmarks are taken over automatically the first time you start v3 (v2.2 or later must have run once).

> **First launch**
> - **Windows:** if the blue SmartScreen dialog appears, click *More info* → *Run anyway*.
> - **macOS:** right-click the app → *Open* → *Open*. Or: `xattr -dr com.apple.quarantine "/Applications/VLC Redesign.app"`.
>
> 🌍 Available in English, Dutch, German, French, Spanish, Italian, Portuguese and Polish: pick your language on first launch.

## 🎨 Design

The design is by **[Juxtopposed](https://www.youtube.com/@juxtopposed)** from the video
**[I Redesigned VLC After 25 Years](https://www.youtube.com/watch?v=ERFeOgqk324)**
([Figma file](https://www.figma.com/design/7fsD7tE4rIOTEfaLAAQiDY/VLC-Redesign--Community-)).

---
Built with Qt (LGPL), libVLC (LGPL/GPL) and FFmpeg (LGPL/GPL).

Version {{VERSION}} · Unofficial fan project, not affiliated with VideoLAN. "VLC" and the cone logo are trademarks of VideoLAN.
