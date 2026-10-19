// Small UI toolkit: DOM builder, bound controls (slider/toggle/select/…), menus and dialogs. Exposes window.UI
(() => {
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const tr = s => (typeof s === 'string' && window.t ? window.t(s) : s);   // auto-translate UI labels
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function el(tag, props = {}, ...kids) {
  const [t, ...cls] = tag.split('.');
  const e = document.createElement(t || 'div');
  if (cls.length) e.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className += (e.className ? ' ' : '') + v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? e.style.setProperty(sk, sv) : (e.style[sk] = sv);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

/* ---------- icons (24×24 stroke) ---------- */
const P = {
  play: '<path d="M7 4l13 8-13 8z"/>', pause: '<path d="M7 5v14M17 5v14"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  prev: '<path d="M6 5v14"/><path d="M19 5L9 12l10 7z"/>', next: '<path d="M18 5v14"/><path d="M5 5l10 7-10 7z"/>',
  record: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
  hide: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8l8 8"/>',
  playback: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>',
  video: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M8 5l-1.5 4M13 5l-1.5 4M18 5l-1.5 4"/>',
  audio: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>', subtitle: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 14h4M13 14h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5l2 2.6 3.2-.6.9 3.1 3 1.4-1.2 3 1.2 3-3 1.4-.9 3.1-3.2-.6-2 2.6-2-2.6-3.2.6-.9-3.1-3-1.4 1.2-3-1.2-3 3-1.4.9-3.1 3.2.6z"/>',
  playlist: '<path d="M4 6h12M4 11h12M4 16h7"/><path d="M15 14l5 3-5 3z"/>', open: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9a5 5 0 0 0 5-5"/>',
  quit: '<path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8"/><path d="M10 12h11M17 8l4 4-4 4"/>', check: '<path d="M5 12l5 5 9-10"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>', folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  bookmark: '<path d="M7 4h10v16l-5-4-5 4z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', pip: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  general: '<path d="M6 4v16M12 4v16M18 4v16"/><path d="M4 8h4M10 15h4M16 10h4"/>', pointer: '<path d="M5 3l14 8-6 2-3 6z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', library: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  network: '<circle cx="12" cy="12" r="1.5"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  puzzle: '<path d="M9 4a2 2 0 1 1 4 0v2h4v4h-1a2 2 0 1 0 0 4h1v4h-4v-1a2 2 0 1 0-4 0v1H5v-4h1a2 2 0 1 0 0-4H5V6h4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  github: '<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.8 2.8 5.8 3.1 5.8 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  repeat: '<path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3"/>', shuffle: '<path d="M3 6h4l10 12h4M3 18h4l3-3.5M14 9.5L17 6h4M18 3l3 3-3 3M18 15l3 3-3 3"/>',
  speed: '<path d="M4 15a8 8 0 1 1 16 0"/><path d="M12 15l4-5"/>', mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>', rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8"/><path d="M20 3v5h-5"/>',
  queue: '<path d="M4 6h16M4 12h16M4 18h10"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = (name, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24">${P[name] || ''}</svg>`;

/* ---------- bound controls ---------- */
// binding: 'settings.path' string or { get, set }
const registry = [];
const B = b => typeof b === 'string' ? { get: () => S.get(b), set: v => S.set(b, v), path: b } : b;
function track(path, refresh, node) { registry.push({ path, refresh, node }); }
S.on(path => {
  for (let i = registry.length - 1; i >= 0; i--) {
    const r = registry[i];
    if (!r.node.isConnected) { if (r.node.dataset.keep !== '1') registry.splice(i, 1); continue; }
    if (r.path && (r.path === path || r.path.startsWith(path + '.') || path.startsWith(r.path + '.'))) r.refresh();
  }
});
const refreshAll = root => registry.filter(r => root.contains(r.node)).forEach(r => r.refresh());

function toggle(binding, onChange) {
  const b = B(binding);
  const t = el('button.tgl', { type: 'button', role: 'switch' }, el('span.knob'), el('span.lbl'));
  const draw = () => { const v = !!b.get(); t.classList.toggle('on', v); t.setAttribute('aria-checked', v); t.lastChild.textContent = v ? 'ON' : 'OFF'; };
  t.addEventListener('click', () => { b.set(!b.get()); draw(); onChange && onChange(!!b.get()); });
  draw(); track(b.path, draw, t); t.refresh = draw;
  return t;
}
function select(options, binding, onChange) {
  const b = B(binding);
  const s = el('select.sel');
  const fill = opts => { s.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(tr(l))}</option>`).join(''); };
  fill(typeof options === 'function' ? options() : options);
  const draw = () => { if (typeof options === 'function') fill(options()); s.value = String(b.get()); };
  s.addEventListener('change', () => { const o = (typeof options === 'function' ? options() : options).find(([v]) => String(v) === s.value); b.set(o ? o[0] : s.value); onChange && onChange(b.get()); });
  draw(); track(b.path, draw, s); s.refresh = draw;
  return s;
}
function segmented(options, binding) {
  const b = B(binding);
  const w = el('div.seg');
  options.forEach(([v, l]) => w.append(el('button', { type: 'button', dataset: { v }, onclick: () => { b.set(v); draw(); } }, tr(l))));
  const draw = () => $$('button', w).forEach(x => x.classList.toggle('on', x.dataset.v === String(b.get())));
  draw(); track(b.path, draw, w);
  return w;
}
function swatches(colors, binding) {
  const b = B(binding);
  const w = el('div.swatches');
  colors.forEach(c => w.append(el('button', { type: 'button', style: { '--c': c }, title: c, dataset: { c }, onclick: () => { b.set(c); draw(); } })));
  const draw = () => $$('button', w).forEach(x => x.classList.toggle('on', x.dataset.c.toLowerCase() === String(b.get()).toLowerCase()));
  draw(); track(b.path, draw, w);
  return w;
}
// horizontal slider in the design style: label + value on top, thick track below
function slider({ label, min, max, step = 1, binding, fmt = v => v, ticks = 0, box = false, center = false, vertical = false }) {
  const b = B(binding);
  label = tr(label);
  const input = el('input.vs', { type: 'range', min, max, step });
  if (vertical) input.classList.add('vertical');
  const val = box ? el('input.valbox', { type: 'text' }) : el('span.val');
  const paint = () => {
    const v = +input.value, p = (v - min) / (max - min) * 100, c = (0 - min) / (max - min) * 100;
    input.style.setProperty('--p', (center ? Math.max(p, c) : p) + '%');
    input.style.setProperty('--c0', (center ? Math.min(p, c) : 0) + '%');
    if (box) { if (document.activeElement !== val) val.value = fmt(v); } else val.textContent = fmt(v);
  };
  const draw = () => { input.value = b.get(); paint(); };
  input.addEventListener('input', () => { b.set(+input.value); paint(); });
  input.addEventListener('dblclick', () => { if (center) { b.set(0); draw(); } });
  if (box) val.addEventListener('change', () => { const n = parseFloat(val.value.replace(',', '.')); if (isFinite(n)) { b.set(Math.min(max, Math.max(min, n))); draw(); } else paint(); });
  if (ticks) input.style.setProperty('--ticks', `repeating-linear-gradient(90deg, transparent 0 calc(${100 / ticks}% - 2px), #ffffff14 calc(${100 / ticks}% - 2px) ${100 / ticks}%)`);
  draw(); track(b.path, draw, input);
  if (vertical) return el('div.vslider', {}, input, el('span.vlabel', {}, label), val);
  return el('div.srow-slider', {}, el('div.slabel', {}, el('span', {}, label), val), input);
}
function color(binding) {
  const b = B(binding);
  const txt = el('input.colortxt', { type: 'text', spellcheck: 'false' });
  const pick = el('input.colorpick', { type: 'color' });
  const draw = () => { txt.value = String(b.get()).toUpperCase(); pick.value = b.get(); };
  pick.addEventListener('input', () => { b.set(pick.value); draw(); });
  txt.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(txt.value)) b.set(txt.value.toLowerCase()); draw(); });
  draw(); track(b.path, draw, txt);
  return el('div.colorbox', {}, txt, pick);
}
function textInput(binding, placeholder = '') {
  const b = B(binding);
  const i = el('input.txt', { type: 'text', placeholder: tr(placeholder) });
  const draw = () => { if (document.activeElement !== i) i.value = b.get() ?? ''; };
  i.addEventListener('change', () => b.set(i.value));
  draw(); track(b.path, draw, i);
  return i;
}
function row(label, control, { info, stacked, cls } = {}) {
  label = tr(label); info = tr(info);
  const l = el('span.rlabel', {}, label);
  const r = el('div.frow' + (stacked ? '.stacked' : '') + (cls ? '.' + cls : ''), { dataset: { search: (typeof label === 'string' ? label : '') + ' ' + (info || '') } }, l, control);
  // ⓘ: a click (or Enter / Space) opens the explanation in a panel right under the setting (#56: a hover tooltip ends
  // up under a large cursor); a second click or Escape closes it
  if (info) {
    const b = el('span.info', { role: 'button', tabindex: '0', 'aria-label': tr('More information'), 'aria-expanded': 'false', html: icon('info') });
    let note = null;
    const toggle = e => {
      e.preventDefault(); e.stopPropagation();
      if (note) { note.remove(); note = null; b.classList.remove('on'); b.setAttribute('aria-expanded', 'false'); return; }
      note = el('div.frow-note', { role: 'note' }, info); r.after(note);
      b.classList.add('on'); b.setAttribute('aria-expanded', 'true');
    };
    b.addEventListener('click', toggle);
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ' || (e.key === 'Escape' && note)) toggle(e); });
    l.append(b);
  }
  return r;
}
function collapse(children, { open = false, onLabel = 'Collapse settings', offLabel = 'Expand settings' } = {}) {
  const body = el('div.cbody', {}, children);
  const head = el('button.chead', { type: 'button' }, el('span'), el('span.chev', { html: icon('chevron') }));
  const w = el('div.collapse', {}, head, body);
  const draw = () => { w.classList.toggle('open', open); head.firstChild.textContent = tr(open ? onLabel : offLabel); };
  head.addEventListener('click', () => { open = !open; draw(); });
  draw();
  return w;
}
function button(label, onclick, cls = '') { return el('button.btn' + (cls ? '.' + cls : ''), { type: 'button', onclick }, tr(label)); }

/* ---------- context / popup menus with submenus ---------- */
let menuRoot = null;
function closeMenus() { if (menuRoot) { menuRoot.remove(); menuRoot = null; } }
function menu(items, x, y) {
  closeMenus();
  menuRoot = el('div.menu-layer');
  document.body.append(menuRoot);
  openLevel(items, x, y, 0);
  return menuRoot;
}
function openLevel(items, x, y, depth, parentRect) {
  $$(`.cmenu[data-depth]`, menuRoot).forEach(m => { if (+m.dataset.depth >= depth) m.remove(); });
  const m = el('div.cmenu', { dataset: { depth } });
  for (const it of (typeof items === 'function' ? items() : items)) {
    if (!it) continue;
    if (it.sep) { m.append(el('hr')); continue; }
    if (it.header) { m.append(el('div.mhead', {}, tr(it.header))); continue; }
    const b = el('button.mitem' + (it.disabled ? '.disabled' : '') + (it.danger ? '.danger' : ''), { type: 'button' },
      el('span.micon' + (it.accent ? '.accent' : ''), { html: it.checked ? icon('check') : (it.icon ? icon(it.icon) : '') }),
      el('span.mlabel', {}, tr(it.label)),
      el('span.mkbd', { html: it.sub ? icon('chevron') : esc(tr(it.kbd || '')) }));
    if (it.sub) {
      const openSub = () => { const r = b.getBoundingClientRect(); openLevel(it.sub, r.right + 2, r.top - 4, depth + 1, r); };
      b.addEventListener('mouseenter', () => { clearTimeout(b._t); b._t = setTimeout(openSub, 120); });
      b.addEventListener('mouseleave', () => clearTimeout(b._t));
      b.addEventListener('click', e => { e.stopPropagation(); openSub(); });
    } else {
      b.addEventListener('mouseenter', () => $$(`.cmenu`, menuRoot).forEach(x => { if (+x.dataset.depth > depth) x.remove(); }));
      b.addEventListener('click', () => { if (it.disabled) return; closeMenus(); it.action && it.action(); });
    }
    m.append(b);
  }
  menuRoot.append(m);
  const r = m.getBoundingClientRect();
  let left = x, top = y;
  if (left + r.width > innerWidth - 6) left = parentRect ? parentRect.left - r.width - 2 : innerWidth - r.width - 6;
  if (top + r.height > innerHeight - 6) top = Math.max(6, innerHeight - r.height - 6);
  m.style.left = Math.max(6, left) + 'px'; m.style.top = top + 'px';
}
document.addEventListener('mousedown', e => { if (menuRoot && !e.target.closest('.cmenu')) closeMenus(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuRoot) { e.stopPropagation(); closeMenus(); } }, true);
addEventListener('blur', closeMenus);

/* ---------- dialogs ---------- */
const stack = [];
function dialog({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], width = 460, cls = '', onOpen }) {
  return new Promise(res => {
    const layer = el('div.dlg-layer');
    const box = el('div.dlg' + (cls ? '.' + cls : ''), { style: { width: `min(${width}px, calc(100% - 32px))` } });
    const close = v => { layer.remove(); stack.splice(stack.indexOf(close), 1); res(v); };
    const head = el('div.dlg-head', {}, el('span', {}, tr(title)), el('button.ibtn', { type: 'button', html: icon('x'), onclick: () => close(null), title: tr('Close') }));
    const content = el('div.dlg-body', {}, body);
    const foot = el('div.dlg-foot');
    buttons.forEach(bt => foot.append(el('button.btn' + (bt.primary ? '.primary' : ''), { type: 'button', onclick: () => close(typeof bt.value === 'function' ? bt.value() : bt.value) }, tr(bt.label))));
    box.append(head, content); if (buttons.length) box.append(foot);
    layer.append(box);
    layer.addEventListener('mousedown', e => { if (e.target === layer) close(null); });
    document.body.append(layer);
    stack.push(close);
    box._close = close;
    onOpen && onOpen(box, close);
    const f = box.querySelector('input:not([type=range]):not([type=color]),textarea,select') || foot.querySelector('.primary');
    f && setTimeout(() => f.focus(), 0);
  });
}
document.addEventListener('keydown', e => {
  if (!stack.length) return;
  if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); stack[stack.length - 1](null); }
}, true);
const dialogOpen = () => stack.length > 0;

async function prompt(title, { text = '', value = '', placeholder = '', ok = 'OK' } = {}) {
  const i = el('input.txt.wide', { value, placeholder: tr(placeholder) });
  const r = await dialog({ title, body: el('div', {}, text ? el('p.dlg-text', {}, tr(text)) : null, i), buttons: [{ label: 'Cancel', value: null }, { label: ok, primary: true, value: () => i.value }],
    onOpen: (box, close) => i.addEventListener('keydown', e => { if (e.key === 'Enter') close(i.value); }) });
  return r;
}
async function confirm(title, text, ok = 'OK', force = false) {
  if (!force && !S.get('confirmDialogs')) return true;
  return !!(await dialog({ title, body: el('p.dlg-text', {}, tr(text)), buttons: [{ label: 'Cancel', value: false }, { label: ok, primary: true, value: true }] }));
}
function choose(title, options, ok = 'OK') {
  const s = el('select.sel.wide', {}, ...options.map((o, i) => el('option', { value: i }, o)));
  return dialog({ title, body: s, buttons: [{ label: 'Cancel', value: null }, { label: ok, primary: true, value: () => +s.value }] });
}

window.UI = { $, $$, esc, tr, el, icon, P, toggle, select, segmented, swatches, slider, color, textInput, row, collapse, button, menu, closeMenus, dialog, dialogOpen, prompt, confirm, choose, refreshAll };
})();
