# Copies the translations of v2.x (app/src/lang/<code>.js: I18N.add('<code>', { "English": "Translated", … })) to
# qt/lang/<code>.json, which the Qt version builds in. Run after changing a v2.x language file:
#   python qt/tools/sync-lang.py
import json, pathlib, re

root = pathlib.Path(__file__).resolve().parents[2]
src, out = root / 'app' / 'src' / 'lang', root / 'qt' / 'lang'
out.mkdir(exist_ok=True)
for f in sorted(src.glob('*.js')):
    text = f.read_text(encoding='utf-8')
    data, dec = {}, json.JSONDecoder()
    # a file has several I18N.add('<code>', { … }) blocks (one per release); later ones win
    for m in re.finditer(r"I18N\.add\(\s*'[^']+'\s*,\s*", text):
        body = re.sub(r',(\s*})', r'\1', text[m.end():])  # a trailing comma is fine in JS, not in JSON
        obj, _ = dec.raw_decode(body)
        data.update(obj)
    (out / (f.stem + '.json')).write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding='utf-8', newline='\n')
    print(f.stem, len(data))
