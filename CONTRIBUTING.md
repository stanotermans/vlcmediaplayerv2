# Contributing

Thanks for your interest in improving **VLC Media Player – Redesign**! Bug reports, ideas, translations and code are all welcome.

> This is an unofficial fan project built from the [VLC redesign by Juxtopposed](https://www.youtube.com/watch?v=ERFeOgqk324). It is not affiliated with VideoLAN.

## Reporting bugs

1. Check the [existing issues](https://github.com/stanotermans/vlcmediaplayerv2/issues) to see if it has already been reported.
2. Open a new issue with the **Bug report** template and include:
   - your operating system and app version (for example *Windows 11, v1.3.0*),
   - what you did, what you expected, and what happened instead,
   - the file type if it's about playback (for example *MKV with AC3 audio*), and a screenshot if useful.

If a file doesn't play, try **Settings → Video → Always convert with ffmpeg**, and mention in the issue whether that helped. You can also turn on **Settings → General → Save a log** and attach the log file.

## Suggesting features

Open an issue with the **Feature request** template. Explain the problem you want to solve, not only the solution. Ideas that fit the original design by Juxtopposed have the best chance.

## Translations

The app is available in English, Dutch, German, French, Spanish, Italian and Portuguese. Translations live in [`app/src/lang/`](app/src/lang):

- **Improve a translation:** edit the value next to the English key in the language file (for example `app/src/lang/de.js`).
- **Add a language:** copy `nl.js` to a new file named after the language code (for example `pl.js`), translate the values, add the language to `LANGS` in [`app/src/i18n.js`](app/src/i18n.js) and add a `<script>` line for it in [`app/src/index.html`](app/src/index.html).
- Keep placeholders such as `{n}`, `{name}` and `{v}` exactly as they are.

## Working on the code

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/stanotermans/vlcmediaplayerv2.git
cd vlcmediaplayerv2/app
npm install
npm start
```

The [README](README.md#project-structure) explains which file does what.

### Guidelines

- Keep the look and feel consistent with Juxtopposed's design.
- Put every user-facing text through the translation function (`t('English text')`) and add the key to all files in `app/src/lang/`.
- Keep changes focused: one fix or feature per pull request.
- Test your change on at least one platform by running the app with `npm start`.
- Don't commit build output (`app/dist/`) or `node_modules/`.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change and test it.
3. Open a pull request and fill in the template.

By contributing, you agree that your code is released under the project's [MIT license](LICENSE). The design remains © Juxtopposed.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces.
