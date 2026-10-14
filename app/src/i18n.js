// Tiny translation layer. English text is the key; each language file adds its translations with I18N.add().
// t('Play'), t('{n} items', { n: 5 }). Static HTML uses data-i18n / data-i18n-title / data-i18n-ph attributes.
(() => {
const LANGS = [
  ['en', 'English'], ['nl', 'Nederlands'], ['de', 'Deutsch'], ['fr', 'Français'],
  ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'],
];
const dict = {};
const supported = code => LANGS.some(([c]) => c === code);
function detect() {
  for (const l of navigator.languages || [navigator.language || 'en']) {
    const c = String(l).slice(0, 2).toLowerCase();
    if (supported(c)) return c;
  }
  return 'en';
}
const lang = () => { const l = S.get('language'); return supported(l) ? l : detect(); };
function t(key, vars) {
  const l = lang();
  let s = (l !== 'en' && dict[l] && dict[l][key]) || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}
function apply(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach(e => { e.title = t(e.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-ph]').forEach(e => { e.placeholder = t(e.dataset.i18nPh); });
  document.documentElement.lang = lang();
}
const listeners = [];
S.on(path => { if (path === 'language') { apply(); listeners.forEach(fn => { try { fn(lang()); } catch (e) { console.error(e); } }); } });

window.t = t;
window.I18N = {
  LANGS, t, apply, lang, detect,
  add: (code, entries) => { dict[code] = Object.assign(dict[code] || {}, entries); },
  set: code => S.set('language', code),
  onChange: fn => listeners.push(fn),
};
})();
