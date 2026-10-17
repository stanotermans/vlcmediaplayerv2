// MIDI → WAV in a separate process (Electron utility process), so the app stays responsive while it renders.
// Uses SpessaSynth (Apache-2.0) with a SoundFont (.sf2/.sf3). The parsed SoundFont is kept between songs.
// Messages in:  { id, type: 'probe', midi }  |  { id, type: 'render', midi, soundfont, out }
// Messages out: { id, ok: true, duration, title }  |  { id, ok: true, file, duration }  |  { id, ok: false, error }
import fs from 'node:fs';
import { audioToWav, BasicMIDI, SoundBankLoader, SpessaLog, SpessaSynthProcessor, SpessaSynthSequencer } from 'spessasynth_core';

SpessaLog.setLogLevel(false, false, false, false);
const RATE = 44100, BLOCK = 128;
let bank = null, bankPath = '';
const buf = file => { const b = fs.readFileSync(file); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const loadMidi = file => BasicMIDI.fromArrayBuffer(buf(file));

function render(midiFile, soundfont, out) {
  if (!bank || bankPath !== soundfont) { bank = SoundBankLoader.fromArrayBuffer(buf(soundfont)); bankPath = soundfont; }
  const midi = loadMidi(midiFile);
  const synth = new SpessaSynthProcessor(RATE, { eventsEnabled: false });
  synth.soundBankManager.addSoundBank(bank, 'main');
  synth.setSystemParameter('autoAllocateVoices', true);
  const seq = new SpessaSynthSequencer(synth);
  seq.loadNewSongList([midi]); seq.play();
  const n = Math.ceil(RATE * (midi.duration + 2)), L = new Float32Array(n), R = new Float32Array(n);   // +2 s for the last notes to ring out
  for (let f = 0; f < n; f += BLOCK) { seq.processTick(); synth.process(L, R, f, Math.min(BLOCK, n - f)); }
  fs.writeFileSync(out, new Uint8Array(audioToWav([L, R], RATE)));
  return { file: out, duration: midi.duration };
}

process.parentPort.on('message', async e => {
  const m = e.data;
  try {
    if (m.type === 'probe') { const midi = loadMidi(m.midi); process.parentPort.postMessage({ id: m.id, ok: true, duration: midi.duration, title: midi.getName ? midi.getName() : '' }); }
    else if (m.type === 'render') process.parentPort.postMessage({ id: m.id, ok: true, ...render(m.midi, m.soundfont, m.out) });
  } catch (err) { process.parentPort.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); }
});
