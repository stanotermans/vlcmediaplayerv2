<div align="center">

<img src="docs/icon.png" width="96" alt="">

# VLC Media Player – redesign

**Een moderne desktop-mediaspeler in het VLC-redesign van [Juxtopposed](https://www.youtube.com/@juxtopposed).**
Voor Windows, macOS en Linux · speelt bijna alles af dankzij de ingebouwde FFmpeg.

[**⬇️ Download**](https://github.com/stanotermans/vlcmediaplayerv2/releases/latest) ·
[Downloadpagina](https://stanotermans.github.io/vlcmediaplayerv2/) ·
[Design-video](https://www.youtube.com/watch?v=ERFeOgqk324)

<img src="docs/screenshots/library.png" alt="Bibliotheek" width="860">

</div>

> [!NOTE]
> Dit is een **onofficieel fanproject**. Het is niet gemaakt, verbonden aan of goedgekeurd door VideoLAN, de makers van de echte VLC.
> "VLC" en het pylonlogo zijn handelsmerken van VideoLAN.

## 🎨 Design: credits aan Juxtopposed

Het volledige ontwerp van deze app komt van **Juxtopposed**: de bibliotheek, de speler, de onboarding, het instellingenvenster, de menu's en de audio- en video-panelen.

- 📺 Video: **[I Redesigned VLC After 25 Years](https://www.youtube.com/watch?v=ERFeOgqk324)**, door [Juxtopposed](https://www.youtube.com/@juxtopposed)
- 🎨 Figma: **[VLC Redesign (Community)](https://www.figma.com/design/7fsD7tE4rIOTEfaLAAQiDY/VLC-Redesign--Community-)**

Deze repository maakt van dat ontwerp een werkende app. Alle eer voor het design gaat naar Juxtopposed. Bekijk zeker de video! 🙌

## ⬇️ Downloaden

Ga naar de **[nieuwste release](https://github.com/stanotermans/vlcmediaplayerv2/releases/latest)** en kies het bestand voor jouw systeem:

| Besturingssysteem | Bestand |
|---|---|
| 🪟 **Windows 10 / 11** | `VLC-Media-Player-Setup-<versie>-x64.exe` (installer) of `…-Portable-<versie>.exe` |
| 🪟 Microsoft Store-pakket | `VLC-Media-Player-Store-<versie>-x64.appx` |
| 🍎 **macOS** (Apple Silicon / Intel) | `VLC-Media-Player-<versie>-mac-arm64.dmg` / `…-mac-x64.dmg` |
| 🐧 **Debian, Ubuntu, Linux Mint, Chrome OS** | `vlc-redesign-<versie>-amd64.deb` |
| 🐧 **Fedora, openSUSE, Red Hat** | `vlc-redesign-<versie>-x86_64.rpm` |
| 🐧 **Arch Linux, Manjaro** | `vlc-redesign-<versie>-x64.pacman` |
| 🐧 **Elke Linux** (Gentoo, Slackware, …) | `vlc-redesign-<versie>-x86_64.AppImage` of `.tar.gz` |

Of gebruik de **[downloadpagina](https://stanotermans.github.io/vlcmediaplayerv2/)**: die herkent je systeem automatisch.

<details>
<summary><b>Installeren op Linux</b></summary>

```bash
sudo apt install ./vlc-redesign-*-amd64.deb        # Debian, Ubuntu, Mint, Chrome OS
sudo dnf install ./vlc-redesign-*-x86_64.rpm       # Fedora, Red Hat
sudo zypper install ./vlc-redesign-*-x86_64.rpm    # openSUSE
sudo pacman -U ./vlc-redesign-*-x64.pacman         # Arch, Manjaro
chmod +x vlc-redesign-*.AppImage && ./vlc-redesign-*.AppImage   # elke distributie
```

**Chrome OS:** zet *Instellingen → Over ChromeOS → Ontwikkelaars → Linux-ontwikkelomgeving* aan en open daarna het `.deb`-bestand vanuit de app Bestanden.
</details>

<details>
<summary><b>Eerste keer openen op Windows of macOS</b></summary>

De app is niet digitaal ondertekend (dat kost een betaald certificaat), daarom waarschuwt je systeem bij de eerste keer:

- **Windows:** klik bij de blauwe SmartScreen-melding op *Meer info* → *Toch uitvoeren*.
- **macOS:** klik met rechts op de app → *Open* → *Open*. Of in Terminal:
  ```bash
  xattr -dr com.apple.quarantine "/Applications/VLC Media Player.app"
  ```
</details>

## ✨ Functies

- **Speelt bijna alles af.** MP4, MKV, AVI, MOV, WMV, FLV, WebM, MP3, FLAC, AC3/DTS en meer. Wat Chromium zelf niet kan afspelen, zet de ingebouwde FFmpeg live om.
- **Onboarding** bij de eerste start: mediamap kiezen, thema en accentkleur kiezen (met live voorbeeld) en de belangrijkste sneltoetsen leren.
- **Bibliotheek** met video's, muziek, netwerkstreams, afspeellijsten en recent afgespeeld. Mappen bladeren met een kruimelpad (Video's ▸ Shows ▸ The Wand ▸ S01), "verder kijken" en bekeken items gedimd.
- **Speler** met minispeler, wachtrij, hervatten waar je gebleven was, herhalen en willekeurig, snelheid, beeld-in-beeld, volledig scherm en interface verbergen.
- **Ondertitels:** ingebouwde en losse `.srt`/`.ass`/`.vtt`-bestanden worden automatisch geladen. Instelbaar: vertraging, snelheid, duur, lettertype, kleur, rand en achtergrond.
- **Audio:** meerdere audiosporen, een 10-bands equalizer met 18 voorinstellingen, compressor, ruimtelijk geluid (galm), stereoverbreding en volumeversterking tot 200%.
- **Video:** helderheid, contrast, verzadiging, tint, gamma, verscherpen, filmkorrel, negatief, posterize, grijstinten, sepia, bijsnijden in pixels, draaien, zoomen en spiegelen.
- **Thema's:** licht, donker of systeem, met 9 accentkleuren.
- **Opnemen** (R) en **momentopnames** (Shift+S).
- **Instellingen:** rechtermuisknop-menu met submenu's, snelinstellingen in de speler en een groot instellingenvenster met zoekveld (Ctrl+P).

<details>
<summary><b>Sneltoetsen</b></summary>

| Toets | Actie | Toets | Actie |
|---|---|---|---|
| `Spatie` | Afspelen / pauzeren | `F` | Volledig scherm |
| `←` `→` | Spoelen | `↑` `↓` | Volume |
| `<` `>` / `P` `N` | Vorige / volgende | `Q` | Wachtrij |
| `,` `.` | Vorig / volgend frame | `L` | Bibliotheek / speler |
| `V` | Ondertitelspoor wisselen | `B` | Audiospoor wisselen |
| `Shift+S` | Momentopname | `R` | Opnemen |
| `S` | Stoppen | `M` | Dempen |
| `[` `]` `=` | Langzamer / sneller / normaal | `G` `H` | Ondertitelvertraging |
| `Ctrl+O` | Bestanden openen | `Ctrl+N` | Netwerkstream |
| `Ctrl+P` | Instellingen | `Ctrl+\` | Interface verbergen |
| `F1` | Alle sneltoetsen | `Ctrl+Q` | Afsluiten |
</details>

## 🖼️ Screenshots

| Onboarding | Speler met snelinstellingen |
|---|---|
| <img src="docs/screenshots/onboarding.png" alt="Onboarding"> | <img src="docs/screenshots/player.png" alt="Speler"> |
| **Instellingen** | **Lichte modus** |
| <img src="docs/screenshots/settings.png" alt="Instellingen"> | <img src="docs/screenshots/light.png" alt="Lichte modus"> |

## 🛠️ Zelf bouwen

Je hebt [Node.js](https://nodejs.org) 20 of nieuwer nodig.

```bash
cd app
npm install
npm start               # ontwikkelversie starten
npm run dist:win        # Windows: installer + portable (op Windows)
npm run dist:store      # Microsoft Store-pakket (op Windows)
npm run dist:mac        # macOS (op een Mac)
npm run dist:linux      # Linux: AppImage, deb, rpm, pacman, tar.gz (op Linux)
```

### Een release maken

De workflow [`.github/workflows/build.yml`](.github/workflows/build.yml) bouwt de app op de servers van GitHub voor Windows, macOS en Linux en maakt automatisch een release met een downloadtabel:

```bash
# zet eerst de versie in app/package.json, bijv. "version": "1.2.0"
git tag v1.2.0
git push origin v1.2.0
```

Zonder tag kun je de workflow ook handmatig starten (*Actions → Build & Release → Run workflow*); de bestanden staan dan bij *Artifacts*.

### Downloadpagina (GitHub Pages)

De pagina in [`docs/`](docs/index.html) zet je aan via *Settings → Pages → Deploy from a branch → `main` / `/docs`*.
Daarna staat hij op `https://stanotermans.github.io/vlcmediaplayerv2/` en toont hij altijd de nieuwste release.

### BSD

Electron heeft geen officiële builds voor BSD. Op FreeBSD (en OpenBSD) kun je de app wel starten met de Electron-port van het systeem; de app gebruikt dan de FFmpeg van het systeem:

```sh
pkg install electron36 ffmpeg node npm      # versienummer van de port kan verschillen: pkg search electron
cd app && npm install --ignore-scripts --omit=dev
electron36 .
```

Eigen FFmpeg gebruiken kan met `VLCX_FFMPEG=/pad/naar/ffmpeg` en `VLCX_FFPROBE=/pad/naar/ffprobe`.

### Projectstructuur

```
app/
  main.js          Electron-hoofdproces: venster, lokale mediaserver, FFmpeg-omzetting, bestandsdialogen
  preload.js       Veilige brug tussen hoofdproces en interface
  src/
    index.html     Opbouw van de interface
    style.css      Design (licht/donker, accentkleur)
    settings.js    Voorkeuren en thema
    ui.js          Bouwstenen: schuifregelaars, schakelaars, menu's, dialogen
    effects.js     Audio-effecten (Web Audio) en videofilters
    panels.js      Snelinstellingen, instellingenvenster en dialogen
    onboarding.js  Welkomstscherm
    app.js         Bibliotheek, speler, ondertitels, sneltoetsen
  build/icon.png   App-icoon (gemaakt met build/make-icon.js)
docs/              Downloadpagina voor GitHub Pages
```

## ❓ Waarom niet voor iOS, Android, …?

De app draait op [Electron](https://www.electronjs.org), en dat werkt alleen op Windows, macOS en Linux. Voor **iOS, Apple TV en Android** zou er een aparte app gebouwd moeten worden. **Windows Phone** bestaat niet meer, en voor **NetBSD, Solaris, QNX en OS/2** is er geen Electron of Chromium.

## 📄 Licentie

- **Code:** [MIT](LICENSE) © Stan Otermans
- **Design:** © [Juxtopposed](https://www.youtube.com/@juxtopposed). Gebruikt met bronvermelding, op basis van het openbaar gedeelde Figma-communitybestand.
- Bevat [FFmpeg](https://ffmpeg.org) (LGPL/GPL) via [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) en [ffprobe-static](https://github.com/joshwnj/ffprobe-static).
- "VLC" en het pylonlogo zijn handelsmerken van [VideoLAN](https://www.videolan.org). Dit project is daar niet mee verbonden.
