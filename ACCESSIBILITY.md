# Accessibility

We want **VLC Redesign** to be usable by as many people as possible. This page describes what the app supports today, its known limitations, and how to report problems.

## What the app supports

- **Keyboard control.** Everything you need while watching works without a mouse: play/pause (`Space`), seek (`←` `→`), volume (`↑` `↓`), fullscreen (`F`), mute (`M`), previous/next (`P` `N`), subtitles (`V`), audio track (`B`), speed (`[` `]` `=`) and more. Press `F1` in the app for the full list.
- **Standard controls.** Buttons, menus, dropdowns and text fields are regular HTML controls that can be reached with `Tab`. Icon-only buttons have a tooltip that describes them. Toggle switches report their on/off state to assistive technology.
- **Visual settings.** You can choose a light, dark or system theme and one of 9 accent colors.
- **Subtitles.** Size (50–250%), font, text color, outline color and background opacity are adjustable. Subtitle timing can be corrected with the delay and speed settings.
- **Audio.** Volume boost up to 200%, a 10-band equalizer, and playback speed from 0.25× to 4×.
- **Languages.** The interface is available in English, Dutch, German, French, Spanish, Italian and Portuguese.
- **Fewer distractions.** You can hide the interface (`Ctrl+\`) or turn off thumbnails. In fullscreen, the cursor and controls hide automatically after a delay you can set.

## Supported environments

- Windows 10 and 11, macOS 11 or later, and common Linux distributions (see the [README](README.md)).
- The app follows the system's display scaling. The window has its own minimize, maximize and close buttons; the usual system shortcuts (such as `Alt+F4` on Windows) also work.

## Known limitations

- **Screen readers:** the app has **not yet been tested** with screen readers such as NVDA, JAWS, VoiceOver or Orca. Some parts will not be announced well.
- **Seek and volume bars** are custom controls. They cannot be focused with `Tab`; use the arrow keys or number keys (`0`–`9` jump to 0–90%) instead.
- **Icon-only buttons** use tooltips (`title`) instead of dedicated accessible labels.
- **Focus outlines** are not clearly visible on every control.
- There is no separate high-contrast theme, and the app does not yet follow the system's *reduce motion* setting (the few animations are short).
- Video and audio effects change the picture and sound only. Rendering of the video itself depends on the source file.

We plan to improve these points. Contributions are very welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Reporting a barrier

If something in the app is hard or impossible for you to use, please [open an accessibility issue](https://github.com/stanotermans/vlcmediaplayerv2/issues/new?template=accessibility.yml). Tell us:

- what you were trying to do,
- what got in the way,
- which assistive technology you use (if any), your operating system and the app version.

Accessibility issues are treated as bugs.
