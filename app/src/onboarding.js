// First-run onboarding: language → welcome + media folder → theme & accent → default player → keyboard shortcuts.
// Exposes window.Onboarding
(() => {
const { el, icon } = UI;
const CONE = `<svg viewBox="0 0 24 24" class="ob-cone"><path d="M9.6 2h4.8l1.2 4H8.4z" fill="var(--accent)"/><path d="M8.1 7h7.8l1.1 4H7z" fill="currentColor" opacity=".9"/><path d="M6.7 12h10.6l1.2 4.5H5.5z" fill="var(--accent)"/><path d="M3 18h18l1 3H2z" fill="var(--accent)"/></svg>`;
// "Choose your language" in each language, so everyone can find their own
const HELLO = { en: 'Choose your language', nl: 'Kies je taal', de: 'Wähle deine Sprache', fr: 'Choisissez votre langue', es: 'Elige tu idioma', it: 'Scegli la tua lingua', pt: 'Escolha o seu idioma' };

function show(App, { onDone } = {}) {
  let step = 0, folder = S.get('mediaFolders')[0] || App.paths.videos;
  const STEPS = [stepLanguage, stepWelcome, stepTheme, stepDefault, stepKeys];
  const layer = el('div.ob-layer');
  const card = el('div.ob-card');
  layer.append(card);
  document.body.append(layer);

  const close = () => { layer.classList.add('out'); setTimeout(() => layer.remove(), 250); };
  const nav = (back, nextLabel, onNext) => el('div.ob-nav', {},
    back ? el('button.btn', { type: 'button', onclick: () => go(step - 1) }, t('Back')) : null,
    el('button.btn.primary', { type: 'button', onclick: onNext }, t(nextLabel)));

  function stepLanguage() {
    if (!S.get('language')) S.set('language', I18N.detect());   // preselect the system language
    const title = el('h1', {}, HELLO[I18N.lang()] || HELLO.en);
    const list = el('div.ob-langs', {}, I18N.LANGS.map(([code, name]) => el('button.ob-lang' + (I18N.lang() === code ? '.on' : ''), {
      type: 'button', dataset: { code },
      onclick: () => { I18N.set(code); go(0); },     // re-render in the chosen language
      ondblclick: () => go(1),
    }, el('span.ob-lname', {}, name), el('span.ob-lcode', {}, code.toUpperCase()))));
    return el('div.ob-step.ob-language', {},
      el('div', { html: CONE }), title,
      el('p.ob-lead.center', {}, t('You can change this later in Settings.')),
      list,
      nav(false, 'Continue', () => go(1)));
  }

  function stepWelcome() {
    const input = el('input.txt.ob-path', { value: folder, readonly: true });
    return el('div.ob-step.ob-welcome', {},
      el('div', { html: CONE }),
      el('h1', {}, t('Welcome to VLC!')),
      el('p.ob-lead', {}, t('VLC is a free and open source multimedia player that plays most video and audio files, as well as network streams and subtitles.')),
      el('label.ob-label', {}, t('Choose a media folder to get started with')),
      el('div.ob-folder', {}, input, el('button.btn', { type: 'button', onclick: async () => { const f = await api.chooseFolder(t('Choose media folder')); if (f) { folder = f; input.value = f; } } }, t('Browse'))),
      el('button.ob-skip', { type: 'button', onclick: () => { folder = ''; input.value = ''; input.placeholder = t('No folder – add one later in Settings'); } }, t('Skip for now')),
      nav(true, 'Continue', () => go(2)));
  }

  function stepTheme() {
    const tile = (k, label, cls) => el('button.ob-theme' + (S.get('theme') === k ? '.on' : ''), { type: 'button', dataset: { k }, onclick: () => { S.set('theme', k); refresh(); } },
      el('span.ob-tile.' + cls), el('span.ob-tlabel', {}, t(label)));
    const tiles = el('div.ob-themes', {}, tile('light', 'Light', 'light'), tile('dark', 'Dark', 'dark'), tile('system', 'System', 'system'));
    const dots = el('div.ob-dots', {}, S.ACCENTS.map(c => el('button.ob-dot', { type: 'button', style: { '--c': c }, dataset: { c }, title: c, onclick: () => { S.set('accent', c); refresh(); } })));
    const refresh = () => {
      UI.$$('.ob-theme', tiles).forEach(b => b.classList.toggle('on', b.dataset.k === S.get('theme')));
      UI.$$('.ob-dot', dots).forEach(b => b.classList.toggle('on', b.dataset.c === S.get('accent')));
    };
    refresh();
    // live preview: a miniature player window in the chosen accent
    const preview = el('div.ob-preview', {},
      el('div.ob-pv-title', { html: CONE.replace('ob-cone', 'ob-cone sm') + '<span></span><i></i><i></i><i></i>' }),
      el('div.ob-pv-stage', {}, el('h2', {}, t('Select your preferred theme and color.')), tiles),
      el('div.ob-pv-bar', {}, el('span.pv-ic', { html: icon('prev') }), el('span.pv-play', { html: icon('play') }), el('span.pv-ic', { html: icon('next') }), el('span.pv-t', {}, '00:02:10'),
        el('span.pv-seek', {}, el('b')), el('span.pv-t', {}, '00:25:40'), el('span.pv-ic', { html: icon('volume') }), el('span.pv-vol'), el('span.pv-ic', { html: icon('audio') }), el('span.pv-ic', { html: icon('subtitle') }), el('span.pv-ic', { html: icon('settings') })));
    return el('div.ob-step.ob-themestep', {}, preview,
      el('div.ob-bottom', {}, dots, nav(true, 'Continue', () => go(3))));
  }

  // Optional: make VLC Redesign the app that opens videos and music (the system decides how; see Panels.setDefaultPlayer)
  function stepDefault() {
    const result = el('p.ob-result', { hidden: true });
    const setBtn = el('button.btn.primary.ob-bigbtn', { type: 'button', onclick: async () => {
      setBtn.disabled = true; result.hidden = false; result.textContent = t('One moment…');
      result.textContent = await Panels.setDefaultPlayer(); setBtn.disabled = false;
    } }, t('Set as default player'));
    return el('div.ob-step.ob-default', {},
      el('div', { html: CONE }),
      el('h1', {}, t('Make VLC your default player')),
      el('p.ob-lead', {}, t('Then videos and music open in VLC Redesign when you double-click them. You can also do this later in Settings → General.')),
      setBtn, result,
      nav(true, 'Continue', () => go(4)));
  }

  function stepKeys() {
    const list = [
      ['Play / pause', ['Space']], ['Fullscreen', ['F']], ['Seek backward / forward', ['←', '→']], ['Volume up / down', ['↑', '↓']],
      ['Previous / next', ['<', '>']], ['Show / hide queue', ['Q']], ['Previous / next frame', [',', '.']], ['Show / hide library', ['L']],
      ['Cycle subtitle track', ['V']], ['Snapshot', ['SHIFT', 'S']], ['Cycle audio track', ['B']], ['Record', ['SHIFT', 'R']],
    ];
    const col = l => el('div.kbcol', {}, l.map(([label, k]) => el('div.kbrow', {}, el('span', {}, t(label)), Panels.keycaps(k))));
    return el('div.ob-step.ob-keys', {},
      el('h2', {}, t('Learn the basic keyboard shortcuts.')),
      el('div.kbgrid', {}, col(list.filter((_, i) => i % 2 === 0)), col(list.filter((_, i) => i % 2 === 1))),
      el('div.ob-foot', {}, el('span.ob-note', {}, t('Find the full list in the menu (F1).')),
        nav(true, 'Finish', finish)));
  }

  async function finish() {
    if (!S.get('language')) S.set('language', I18N.lang());
    S.set('onboarded', true);
    close();
    if (folder && !S.get('mediaFolders').includes(folder)) await App.addFolder(folder);
    onDone && onDone();
  }
  function go(n) {
    step = n;
    card.className = 'ob-card step' + n;
    card.replaceChildren(STEPS[n](), el('div.ob-progress', {}, STEPS.map((_, i) => el('span' + (i === n ? '.on' : '')))));
  }
  go(0);
}

window.Onboarding = { show };
})();
