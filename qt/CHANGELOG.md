## 3.2.0
- ✨ **Sharp upscaling** (Video → Filters): low-resolution videos are scaled up more sharply, with AMD FidelityFX's RCAS sharpening (#81).
- ✨ **The window keeps the video's shape:** with *Resize window to the video* on, it takes the video's shape again after you resize it (#89).
- ✨ Settings → Interface: hide the **file name** or the **folder** in the title bar (#90).
- 🐛 Starts maximised also from a desktop shortcut (#73); the sidebar stays hidden after a restart (#91).
- 🐛 Seek-bar previews of videos with an embedded thumbnail show the video (#94); music covers are sharp (#83).
- 🐛 The title bar fits narrow windows (#86).
- 🐧 **Linux / GNOME:** rounded window corners (#85), resizing at the edges works (#87), GNOME's cursor theme (#88) and GNOME's own file and folder dialogs (#84).

## 3.1.1
- 🐛 **No white line round the picture in fullscreen** on Windows 11 (#80).
- 🐱 The pixel cat's blink is easy to see now: its eyes really close and it tilts its head (#77).

## 3.1.0
- ✨ **VLC Redesign is now Vela Player**, with a new icon: a sail (*vela*) that is a play button. Juxtopposed's design stays the same. Your settings, library, playlists and positions come along, and the update replaces the old app.
- ℹ️ Why: "VLC" and the cone are VideoLAN's trademarks, and the app stores (Android and iOS versions are on the way) only accept apps with their own name and icon.
- 🎹 **MIDI plays again** when .mid was on the "always play with FFmpeg" list: MIDI always goes to the built-in synthesizer (#76).
- 🐱 The pixel cat says meow out loud again (at the player's volume), and its mouth opens wide enough to see (#77).

## 3.0.7
- ✨ **360° video:** 360° videos are shown as a view you look around in. Drag to look, use the wheel to zoom, and use the right-click menu → Video to turn it on for files that don't say they're 360° (#78).
- ✨ **Resume where you left off: Always, Ask or Never.** With *Ask* a video starts from the beginning and a bar offers to continue where you were (#79).

## 3.0.6
- 🐛 The cursor stays visible in Settings, dialogs and menus opened in fullscreen (#60).
- 📦 **Flatpak with updates:** `flatpak install https://stanotermans.github.io/vlcmediaplayerv2/flatpak/vlc-redesign.flatpakref`, then `flatpak update` brings new versions (#54).

## 3.0.5
- ✨ **TGV and other difficult files really play through FFmpeg** again: they are converted while they play, like the Classic engine of v2.x (#66).
- 🐛 The cursor hides in fullscreen while a video plays (#60).
- 🐛 The window stays maximised after minimising, after fullscreen and after a restart (#73), and is not resized at the screen edge when maximised (#75).
- 🎨 Rounded corners on Windows 11 for real (#65), and the pixel cat's tricks move like in v2.x (#77).
- 🔊 After holding 2× speed the sound lines up with the picture again (#74).

## 3.0.4
- 🐛 **No more crash at the end of an episode** when the next one starts (#72).
- ✨ **Bigger jumps:** Ctrl+← / → jumps 1 minute, Alt+← / → 5 minutes (#70). Change the keys in Settings → Controls.
- ✨ **What's new:** after an update the app shows what changed, once (#71). Also in Settings → About.

## 3.0.3
- ✨ **Play with FFmpeg again:** choose file types that VLC reads with FFmpeg, in Settings → Playback or the right-click menu of a file (#66).
- ✨ **Time left:** click the time at the right of the bar to see how much is left (#69).
- 🐛 Switches and lists in Settings show a change at once (#68).
- 🎨 Rounded window corners and a shadow on Windows 11 (#65), and the right font weights for headings (#67).

## 3.0.2
- ✨ **Flatpak** for every Linux distribution (#54).
- ✨ The screen stays on while a video plays (#61).
- 🐛 Maximising the window no longer crashes the app, and the window fits your screen (#64).
- 🐛 Updating from the app works again (#63), names with numbers sort correctly (#62), the cursor hides in fullscreen (#60).

## 3.0.1
- ✨ Click the value of any slider to type an exact number, e.g. 168 ms of audio delay (#58).
- ⚡ The library shows complete right away when you open the app (#59).

## 3.0.0
- 🎉 **VLC Redesign 3:** rebuilt with Qt and VLC's own engine. Faster, lighter, plays everything VLC plays, and takes over your settings and library from v2.x.
