// Which pieces of video ("cells") each DVD title plays, read from the disc's own IFO files (#35).
// Many discs have titles that play the same video: "intro + episode" and "episode" on its own, a "play all" title
// that strings the episodes together, or plain copies. With the cells we can show every piece of video once.
// Works on a VIDEO_TS folder and on an .iso image (ISO 9660, which DVD-Video images carry next to UDF).
// Anything unexpected → null, and the caller keeps all titles as before.
const fs = require('fs');
const path = require('path');

const SECTOR = 2048;

// Files in VIDEO_TS: name → { read(offset, length) }
function folderFiles(dir) {
  const out = {};
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    out[name.toUpperCase()] = { read: (off, len) => { const b = Buffer.alloc(len); const fd = fs.openSync(p, 'r'); try { fs.readSync(fd, b, 0, len, off); } finally { fs.closeSync(fd); } return b; } };
  }
  return out;
}
function isoFiles(iso) {
  const fd = fs.openSync(iso, 'r');
  const at = (off, len) => { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, off); return b; };
  try {
    const pvd = at(16 * SECTOR, SECTOR);
    if (pvd[0] !== 1 || pvd.toString('latin1', 1, 6) !== 'CD001') return null;
    // directory records: [0] length, [2] extent (LE), [10] size (LE), [25] flags, [32] name length, [33] name
    const list = (lba, size) => {
      const d = at(lba * SECTOR, size), out = [];
      for (let p = 0; p < d.length;) {
        const len = d[p];
        if (!len) { p = (Math.floor(p / SECTOR) + 1) * SECTOR; continue; }   // records never cross a sector
        const name = d.toString('latin1', p + 33, p + 33 + d[p + 32]).replace(/;\d+$/, '').replace(/\.$/, '').toUpperCase();
        out.push({ name, lba: d.readUInt32LE(p + 2), size: d.readUInt32LE(p + 10), dir: !!(d[p + 25] & 2) });
        p += len;
      }
      return out;
    };
    const root = pvd.subarray(156, 190), vts = list(root.readUInt32LE(2), root.readUInt32LE(10)).find(e => e.dir && e.name === 'VIDEO_TS');
    if (!vts) return null;
    const out = {};
    for (const e of list(vts.lba, vts.size)) if (!e.dir) out[e.name] = { read: (off, len) => at(e.lba * SECTOR + off, len) };
    return { files: out, close: () => fs.closeSync(fd) };
  } catch (e) { fs.closeSync(fd); throw e; }
}

// title number → array of cell keys ("vts:firstSector-lastSector"), in play order
function titleCells(src) {
  let files, close = () => {};
  if (/\.iso$/i.test(src)) { const r = isoFiles(src); if (!r) return null; files = r.files; close = r.close; }
  else files = folderFiles(path.dirname(src));
  try {
    const vmg = files['VIDEO_TS.IFO']; if (!vmg) return null;
    if (vmg.read(0, 12).toString('latin1') !== 'DVDVIDEO-VMG') return null;
    const tt = vmg.read(0xC4, 4).readUInt32BE(0) * SECTOR, n = vmg.read(tt, 2).readUInt16BE(0);
    const vtsCache = {}, result = new Map();
    for (let i = 0; i < n; i++) {
      const e = vmg.read(tt + 8 + i * 12, 12), vtsN = e[6], ttn = e[7];
      const vts = vtsCache[vtsN] || (vtsCache[vtsN] = readVts(files[`VTS_${String(vtsN).padStart(2, '0')}_0.IFO`]));
      if (!vts || !vts.ptt[ttn - 1]) return null;
      const cells = [];
      for (const { pgcn, pgn } of vts.ptt[ttn - 1]) {   // each chapter: its program's cells within the PGC
        const pgc = vts.pgcs[pgcn - 1]; if (!pgc) return null;
        const first = pgc.programs[pgn - 1], next = pgc.programs[pgn] || pgc.cells.length + 1;
        for (let c = first; c < next; c++) { const k = `${vtsN}:${pgc.cells[c - 1]}`; if (pgc.cells[c - 1] && !cells.includes(k)) cells.push(k); }
      }
      result.set(i + 1, cells);
    }
    return result;
  } finally { close(); }
}
function readVts(f) {
  if (!f || f.read(0, 12).toString('latin1') !== 'DVDVIDEO-VTS') return null;
  const pttAt = f.read(0xC8, 4).readUInt32BE(0) * SECTOR, pgcitAt = f.read(0xCC, 4).readUInt32BE(0) * SECTOR;
  const ph = f.read(pttAt, 8), nt = ph.readUInt16BE(0), pttEnd = ph.readUInt32BE(4) + 1;
  const offs = []; for (let i = 0; i < nt; i++) offs.push(f.read(pttAt + 8 + i * 4, 4).readUInt32BE(0));
  const ptt = offs.map((o, i) => {
    const end = i + 1 < nt ? offs[i + 1] : pttEnd, list = [];
    for (let p = o; p + 4 <= end; p += 4) { const b = f.read(pttAt + p, 4); list.push({ pgcn: b.readUInt16BE(0), pgn: b.readUInt16BE(2) }); }
    return list;
  });
  const np = f.read(pgcitAt, 2).readUInt16BE(0), pgcs = [];
  for (let i = 0; i < np; i++) {
    const at = pgcitAt + f.read(pgcitAt + 8 + i * 8 + 4, 4).readUInt32BE(0), h = f.read(at, 0xF0);
    const nProg = h[2], nCells = h[3], progAt = h.readUInt16BE(0xE6), cellAt = h.readUInt16BE(0xE8);
    const programs = [...f.read(at + progAt, nProg)];
    const cb = f.read(at + cellAt, nCells * 24), cells = [];
    for (let c = 0; c < nCells; c++) cells.push(`${cb.readUInt32BE(c * 24 + 8)}-${cb.readUInt32BE(c * 24 + 20)}`);
    pgcs.push({ programs, cells });
  }
  return { ptt, pgcs };
}

// Titles worth listing, in disc order: drops plain copies, "play all" titles made of other titles, and the
// version without intro when there is also one with it (the extra part is short compared to the episode).
function uniqueTitles(titles, cells) {
  if (!cells) return titles;
  const key = t => cells.get(t.title) || [];
  const contains = (a, b) => b.length && b.length < a.length && b.every(c => a.includes(c));
  const same = (a, b) => a.length === b.length && a.every((c, i) => c === b[i]);
  let keep = titles.filter((t, i) => key(t).length && !titles.slice(0, i).some(o => same(key(o), key(t))));
  keep = keep.filter(t => keep.filter(o => o !== t && contains(key(t), key(o))).length < 2);   // play all
  keep = keep.filter(t => !keep.some(o => o !== t && contains(key(o), key(t)) && o.duration - t.duration <= Math.max(300, t.duration * 0.25)));
  return keep.length ? keep : titles;
}

module.exports = { titleCells, uniqueTitles };
