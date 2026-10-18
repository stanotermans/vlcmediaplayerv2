// MIDI → WAV in a separate process (Electron utility process), so the app stays responsive while it renders.
// Uses SpessaSynth (Apache-2.0) with a SoundFont (.sf2/.sf3). The parsed SoundFont is kept between songs.
// The WAV is written in pieces as it renders, so playback can start right away instead of waiting for the whole
// song (#36): first the header with the final size, then 16-bit stereo audio, second by second.
// Messages in:  { id, type: 'probe', midi }  |  { id, type: 'render', midi, soundfont, out }
// Messages out: { id, ok: true, duration, title }
//               { id, started: true, part, total }   (render: the growing file and its final size in bytes)
//               { id, ok: true, file, duration }     (render done: the finished file)
//               { id, ok: false, error }
import fs from 'node:fs';
import { BasicMIDI, SoundBankLoader, SpessaLog, SpessaSynthProcessor, SpessaSynthSequencer } from 'spessasynth_core';

SpessaLog.setLogLevel(false, false, false, false);
const RATE = 44100, BLOCK = 128, CHUNK = RATE;   // render one second, write it, let messages through, repeat
const GAIN = 2.5;                                // SpessaSynth peaks around 0.2–0.4 for most songs
// Soft limiter instead of hard clipping: unchanged up to 80%, then rounded off smoothly towards full scale
const soft = x => { const a = Math.abs(x); return a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2)); };
let bank = null, bankPath = '', current = 0;
const buf = file => { const b = fs.readFileSync(file); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const loadMidi = file => BasicMIDI.fromArrayBuffer(buf(file));
const tick = () => new Promise(r => setImmediate(r));

function wavHeader(frames) {
  const h = Buffer.alloc(44), data = frames * 4;
  h.write('RIFF', 0); h.writeUInt32LE(36 + data, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data, 40);
  return h;
}

async function render(id, midiFile, soundfont, out) {
  current = id;                                  // a newer request stops this one (another song, another SoundFont)
  if (!bank || bankPath !== soundfont) { bank = SoundBankLoader.fromArrayBuffer(buf(soundfont)); bankPath = soundfont; await tick(); }
  const midi = loadMidi(midiFile);
  const synth = new SpessaSynthProcessor(RATE, { eventsEnabled: false });
  synth.soundBankManager.addSoundBank(bank, 'main');
  synth.setSystemParameter('autoAllocateVoices', true);
  const seq = new SpessaSynthSequencer(synth);
  seq.loadNewSongList([midi]); seq.play();
  const frames = Math.ceil(RATE * (midi.duration + 2));   // +2 s for the last notes to ring out
  const part = out + '.part', fd = fs.openSync(part, 'w');
  fs.writeSync(fd, wavHeader(frames));
  process.parentPort.postMessage({ id, started: true, part, total: 44 + frames * 4 });
  const L = new Float32Array(CHUNK), R = new Float32Array(CHUNK), pcm = Buffer.alloc(CHUNK * 4);
  try {
    for (let done = 0; done < frames; done += CHUNK) {
      const n = Math.min(CHUNK, frames - done);
      L.fill(0, 0, n); R.fill(0, 0, n);
      for (let f = 0; f < n; f += BLOCK) { seq.processTick(); synth.process(L, R, f, Math.min(BLOCK, n - f)); }
      for (let i = 0; i < n; i++) {
        pcm.writeInt16LE(Math.round(soft(L[i] * GAIN) * 32767), i * 4);
        pcm.writeInt16LE(Math.round(soft(R[i] * GAIN) * 32767), i * 4 + 2);
      }
      fs.writeSync(fd, pcm, 0, n * 4);
      await tick();
      if (current !== id) throw new Error('stopped');
    }
  } catch (e) { fs.closeSync(fd); try { fs.unlinkSync(part); } catch {} throw e; }
  fs.closeSync(fd);
  fs.renameSync(part, out);
  return { file: out, duration: midi.duration };
}

process.parentPort.on('message', async e => {
  const m = e.data;
  try {
    if (m.type === 'probe') { const midi = loadMidi(m.midi); process.parentPort.postMessage({ id: m.id, ok: true, duration: midi.duration, title: midi.getName ? midi.getName() : '' }); }
    else if (m.type === 'render') process.parentPort.postMessage({ id: m.id, ok: true, ...await render(m.id, m.midi, m.soundfont, m.out) });
  } catch (err) { process.parentPort.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); }
});
