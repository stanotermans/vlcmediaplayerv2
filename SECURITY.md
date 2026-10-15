# Security Policy

## Supported versions

Only the [latest release](https://github.com/stanotermans/vlcmediaplayerv2/releases/latest) receives security fixes. Please update before reporting a problem.

| Version | Supported |
|---|---|
| Latest release | ✅ |
| Older releases | ❌ |

## Reporting a vulnerability

**Please don't report security problems in a public issue.**

Use GitHub's private reporting instead:

1. Go to the [Security tab](https://github.com/stanotermans/vlcmediaplayerv2/security) of this repository.
2. Click **Report a vulnerability**.
3. Describe the problem, the affected version and operating system, and how to reproduce it.

You can expect a first response within about a week. If the report is confirmed, a fix will be released as soon as possible and you'll be credited in the release notes (unless you prefer not to be).

## Scope

Things that are in scope, for example:

- The app's local media server (it only listens on `127.0.0.1` and requires a random per-session token)
- Opening crafted media, subtitle or playlist files
- The Electron setup (context isolation, preload bridge, navigation and window rules)
- The release and build workflow

Not in scope:

- Vulnerabilities in **FFmpeg** or **Electron** themselves. Please report those upstream. The app is updated when they release fixes.
- Warnings from Windows SmartScreen or macOS Gatekeeper, which appear because the app is not code-signed.
- The real VLC media player by VideoLAN. This is an unofficial project; report VLC issues at [videolan.org](https://www.videolan.org/security/).
