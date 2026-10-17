# Code signing policy

Windows releases of **VLC Redesign** are code-signed so Windows can verify that the files really come from this project and were not changed afterwards.

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## What gets signed

- `VLC-Redesign-Setup-<version>-x64.exe` (installer)
- `VLC-Redesign-Portable-<version>.exe` (portable)
- The app itself (`VLC Redesign.exe`) and the bundled `ffmpeg.exe` inside them

Only files built by the [GitHub Actions workflow](.github/workflows/build.yml) from the source code in this repository are signed. Nothing built on a personal computer is ever submitted for signing. Every signing request has to be approved manually before a release is published.

The Microsoft Store package (`.appx`) is signed by Microsoft when it is published in the Store. macOS and Linux builds are not covered by this policy.

## Team roles

| Role | Members |
|---|---|
| Committers and reviewers | [Stan Otermans](https://github.com/stanotermans) |
| Approvers | [Stan Otermans](https://github.com/stanotermans) |

Contributions from others are reviewed by a committer before they are merged. Only approvers can approve a signing request.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it, with one exception:

- **Update check.** The app asks the GitHub API (`api.github.com`) for the latest release of this repository, at most once every 6 hours. No personal data, usage data or file information is sent. This only reveals your IP address to GitHub, as with any web request. You can turn it off under *Settings → ⓘ About → Check for updates automatically*.

Everything else only happens when you ask for it: downloading an update, playing a network stream you entered, or opening a link (GitHub, the website, the design video) in your browser.

**Online subtitles:** only when you search for subtitles, the search text, the chosen languages and a fingerprint of the video file (the OpenSubtitles hash, which contains no personal data) are sent to [OpenSubtitles.com](https://www.opensubtitles.com). If you log in with an OpenSubtitles account, your username and password go only to OpenSubtitles; the app keeps just the session token, encrypted on your computer.

## Reporting

If you find a signed file that does not match this repository, or have any other security concern, please follow the [security policy](SECURITY.md).
