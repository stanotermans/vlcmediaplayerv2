// Tiny translation layer. English text is the key; each language file adds its translations with I18N.add().
// t('Play'), t('{n} items', { n: 5 }). Static HTML uses data-i18n / data-i18n-title / data-i18n-ph attributes.
(() => {
const LANGS = [
  ['en', 'English'], ['nl', 'Nederlands'], ['de', 'Deutsch'], ['fr', 'Français'],
  ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'],
];
const dict = {};
const supported = code => LANGS.some(([c]) => c === code);
// First-run language: the system's preferred languages; navigator.languages only as a fallback, because on macOS
// it reflects the app's bundled localizations rather than the user's choice.
function detect() {
  let sys = []; try { sys = (window.api && api.systemLanguages && api.systemLanguages()) || []; } catch {}
  for (const l of [...sys, ...(navigator.languages || [navigator.language || 'en'])]) {
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

// Subtitle languages as two-letter codes: "English, Nederlands" → ["en", "nl"]. Accepts codes, 3-letter codes
// (eng, dut/nld, ger/deu …) and language names in any of the app's languages and in the language itself.
const SUB_LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it', 'pt', 'pt-BR', 'pt-PT', 'ar', 'bg', 'ca', 'cs', 'da', 'el', 'et', 'fa', 'fi', 'he', 'hi', 'hr',
  'hu', 'id', 'is', 'ja', 'ko', 'lt', 'lv', 'ms', 'no', 'pl', 'ro', 'ru', 'sk', 'sl', 'sr', 'sv', 'th', 'tr', 'uk', 'vi', 'zh-CN', 'zh-TW'];
const ISO3 = { eng: 'en', dut: 'nl', nld: 'nl', ger: 'de', deu: 'de', fre: 'fr', fra: 'fr', spa: 'es', ita: 'it', por: 'pt', ara: 'ar', chi: 'zh-CN', zho: 'zh-CN',
  jpn: 'ja', kor: 'ko', rus: 'ru', pol: 'pl', tur: 'tr', swe: 'sv', dan: 'da', nor: 'no', fin: 'fi', gre: 'el', ell: 'el', heb: 'he', hin: 'hi', cze: 'cs', ces: 'cs',
  hun: 'hu', rum: 'ro', ron: 'ro', ukr: 'uk', vie: 'vi', tha: 'th', ind: 'id', may: 'ms', msa: 'ms', bul: 'bg', hrv: 'hr', srp: 'sr', slo: 'sk', slk: 'sk' };
let langNames = null;
function langCodes(text) {
  if (!langNames) {
    langNames = {};
    const UI = LANGS.map(([c]) => c);                          // names in all app languages, plus each language's own name
    for (const ui of [...UI, ...SUB_LANGS]) {
      let dn; try { dn = new Intl.DisplayNames([ui], { type: 'language' }); } catch { continue; }
      for (const c of SUB_LANGS) { const n = dn.of(c); if (n && (UI.includes(ui) || ui === c)) langNames[n.toLowerCase()] ??= c; }
    }
    Object.assign(langNames, { dutch: 'nl', flemish: 'nl', vlaams: 'nl', brazilian: 'pt-BR', 'brazilian portuguese': 'pt-BR', chinese: 'zh-CN', farsi: 'fa', persian: 'fa' });
  }
  const out = [];
  for (const raw of String(text || '').split(/[,;/]+/)) {
    const w = raw.trim().toLowerCase(); if (!w) continue;
    const code = /^[a-z]{2}(-[a-z]{2})?$/.test(w) ? (w.length > 2 ? w.slice(0, 2) + '-' + w.slice(3).toUpperCase() : w) : ISO3[w] || langNames[w] || null;
    if (code) { if (!out.includes(code)) out.push(code); continue; }
    // several codes or names separated by spaces ("en nl")
    const parts = w.split(/\s+/).map(p => /^[a-z]{2}$/.test(p) ? p : ISO3[p] || langNames[p]).filter(Boolean);
    if (parts.length) parts.forEach(c => { if (!out.includes(c)) out.push(c); });
  }
  return out;
}
window.t = t;
window.I18N = {
  LANGS, t, apply, lang, detect, langCodes,
  add: (code, entries) => { dict[code] = Object.assign(dict[code] || {}, entries); },
  set: code => S.set('language', code),
  onChange: fn => listeners.push(fn),
};
})();
