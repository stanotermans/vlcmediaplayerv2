## ⬇️ Download for your operating system

| Operating system | Download | Notes |
|---|---|---|
| 🪟 **Windows 10 / 11** | {{WIN_SETUP}} | Recommended: installer with shortcut and "Open with" support |
| 🪟 Windows (no install) | {{WIN_PORTABLE}} | Single file, just run it |
| 🪟 Microsoft Store package | {{WIN_STORE}} | For Store submission only (unsigned) |
| 🍎 **macOS – Apple Silicon** (M1–M4) | {{MAC_ARM}} | macOS 12 or later |
| 🍎 macOS – Intel | {{MAC_X64}} | macOS 12 or later |
| 🐧 **Debian / Ubuntu / Linux Mint / Chrome OS** | {{DEB}} | `sudo apt install ./file.deb` |
| 🐧 **Fedora / openSUSE / Red Hat** | {{RPM}} | `sudo dnf install ./file.rpm` |
| 🐧 **Arch Linux / Manjaro** | {{PACMAN}} | `sudo pacman -U ./file.pacman` |
| 🐧 **Any Linux** (Gentoo, Slackware, …) | {{APPIMAGE}} | `chmod +x` and run |
| 🐧 Linux archive | {{TARGZ}} | Extract and run `vlc-redesign` |

Prefer a one-click download? Use the **[download page](https://stanotermans.github.io/vlcmediaplayerv2/)**: it detects your system automatically.

> **First launch**
> - **Windows:** if the blue SmartScreen dialog appears, click *More info* → *Run anyway*.
> - **macOS:** right-click the app → *Open* → *Open*. Or: `xattr -dr com.apple.quarantine "/Applications/VLC Redesign.app"`.
>
> 🌍 Available in English, Dutch, German, French, Spanish, Italian and Portuguese: pick your language on first launch.

## 🎨 Design

The design is by **[Juxtopposed](https://www.youtube.com/@juxtopposed)** from the video
**[I Redesigned VLC After 25 Years](https://www.youtube.com/watch?v=ERFeOgqk324)**
([Figma file](https://www.figma.com/design/7fsD7tE4rIOTEfaLAAQiDY/VLC-Redesign--Community-)).

---
Windows code signing: free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org) ([code signing policy](https://github.com/stanotermans/vlcmediaplayerv2/blob/main/CODE_SIGNING.md)).

Version {{VERSION}} · Unofficial fan project, not affiliated with VideoLAN. "VLC" and the cone logo are trademarks of VideoLAN.
