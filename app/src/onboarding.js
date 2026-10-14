// First-run onboarding: welcome + media folder → theme & accent → keyboard shortcuts. Exposes window.Onboarding
(() => {
const { el, icon } = UI;
const CONE = `<svg viewBox="0 0 24 24" class="ob-cone"><path d="M9.6 2h4.8l1.2 4H8.4z" fill="var(--accent)"/><path d="M8.1 7h7.8l1.1 4H7z" fill="currentColor" opacity=".9"/><path d="M6.7 12h10.6l1.2 4.5H5.5z" fill="var(--accent)"/><path d="M3 18h18l1 3H2z" fill="var(--accent)"/></svg>`;

function show(App, { onDone } = {}) {
  let step = 0, folder = S.get('mediaFolders')[0] || App.paths.videos;
  const layer = el('div.ob-layer');
  const card = el('div.ob-card');
  layer.append(card);
  document.body.append(layer);

  const close = () => { layer.classList.add('out'); setTimeout(() => layer.remove(), 250); };
  const nav = (back, nextLabel, onNext) => el('div.ob-nav', {},
    back ? el('button.btn', { type: 'button', onclick: () => go(step - 1) }, 'Terug') : null,
    el('button.btn.primary', { type: 'button', onclick: onNext }, nextLabel));

  function stepWelcome() {
    const input = el('input.txt.ob-path', { value: folder, readonly: true });
    return el('div.ob-step.ob-welcome', {},
      el('div', { html: CONE }),
      el('h1', {}, 'Welkom bij VLC!'),
      el('p.ob-lead', {}, 'VLC is een gratis en open source multimediaspeler die de meeste video- en audiobestanden afspeelt, plus netwerkstreams en ondertitels.'),
      el('label.ob-label', {}, 'Kies een mediamap om mee te beginnen'),
      el('div.ob-folder', {}, input, el('button.btn', { type: 'button', onclick: async () => { const f = await api.chooseFolder('Mediamap kiezen'); if (f) { folder = f; input.value = f; } } }, 'Bladeren')),
      el('button.ob-skip', { type: 'button', onclick: () => { folder = ''; input.value = ''; input.placeholder = 'Geen map – later toevoegen in Instellingen'; } }, 'Nu geen map kiezen'),
      nav(false, 'Volgende', () => go(1)));
  }

  function stepTheme() {
    const tile = (k, label, cls) => el('button.ob-theme' + (S.get('theme') === k ? '.on' : ''), { type: 'button', dataset: { k }, onclick: () => { S.set('theme', k); refresh(); } },
      el('span.ob-tile.' + cls), el('span.ob-tlabel', {}, label));
    const tiles = el('div.ob-themes', {}, tile('light', 'Licht', 'light'), tile('dark', 'Donker', 'dark'), tile('system', 'Systeem', 'system'));
    const dots = el('div.ob-dots', {}, S.ACCENTS.map(c => el('button.ob-dot', { type: 'button', style: { '--c': c }, dataset: { c }, title: c, onclick: () => { S.set('accent', c); refresh(); } })));
    const refresh = () => {
      UI.$$('.ob-theme', tiles).forEach(b => b.classList.toggle('on', b.dataset.k === S.get('theme')));
      UI.$$('.ob-dot', dots).forEach(b => b.classList.toggle('on', b.dataset.c === S.get('accent')));
    };
    refresh();
    // live preview: a miniature player window in the chosen accent
    const preview = el('div.ob-preview', {},
      el('div.ob-pv-title', { html: CONE.replace('ob-cone', 'ob-cone sm') + '<span></span><i></i><i></i><i></i>' }),
      el('div.ob-pv-stage', {}, el('h2', {}, 'Kies je favoriete thema en kleur.'), tiles),
      el('div.ob-pv-bar', {}, el('span.pv-ic', { html: icon('prev') }), el('span.pv-play', { html: icon('play') }), el('span.pv-ic', { html: icon('next') }), el('span.pv-t', {}, '00:02:10'),
        el('span.pv-seek', {}, el('b')), el('span.pv-t', {}, '00:25:40'), el('span.pv-ic', { html: icon('volume') }), el('span.pv-vol'), el('span.pv-ic', { html: icon('audio') }), el('span.pv-ic', { html: icon('subtitle') }), el('span.pv-ic', { html: icon('settings') })));
    return el('div.ob-step.ob-themestep', {}, preview,
      el('div.ob-bottom', {}, dots, nav(true, 'Volgende', () => go(2))));
  }

  function stepKeys() {
    const list = [
      ['Afspelen / pauzeren', ['Spatie']], ['Volledig scherm', ['F']], ['Terug / vooruit spoelen', ['←', '→']], ['Volume omhoog / omlaag', ['↑', '↓']],
      ['Vorige / volgende', ['<', '>']], ['Wachtrij tonen / verbergen', ['Q']], ['Vorig / volgend frame', [',', '.']], ['Bibliotheek tonen / verbergen', ['L']],
      ['Ondertitelspoor wisselen', ['V']], ['Momentopname', ['SHIFT', 'S']], ['Audiospoor wisselen', ['B']], ['Opnemen', ['SHIFT', 'R']],
    ];
    const col = l => el('div.kbcol', {}, l.map(([t, k]) => el('div.kbrow', {}, el('span', {}, t), Panels.keycaps(k))));
    return el('div.ob-step.ob-keys', {},
      el('h2', {}, 'Leer de belangrijkste sneltoetsen.'),
      el('div.kbgrid', {}, col(list.filter((_, i) => i % 2 === 0)), col(list.filter((_, i) => i % 2 === 1))),
      el('div.ob-foot', {}, el('span.ob-note', {}, 'De volledige lijst vind je in het menu (F1).'),
        nav(true, 'Voltooien', finish)));
  }

  async function finish() {
    S.set('onboarded', true);
    close();
    if (folder && !S.get('mediaFolders').includes(folder)) await App.addFolder(folder);
    onDone && onDone();
  }
  function go(n) {
    step = n;
    card.className = 'ob-card step' + n;
    card.replaceChildren([stepWelcome, stepTheme, stepKeys][n](), el('div.ob-progress', {}, [0, 1, 2].map(i => el('span' + (i === n ? '.on' : '')))));
  }
  go(0);
}

window.Onboarding = { show };
})();
