// Checks that the vlcview module and the libVLC next to it work (the release workflow runs this after fetching libVLC):
// makes a 3-second H.264/AAC clip with the app's FFmpeg, plays it through libVLC without sound output and expects
// pictures, a length and VLC's own audio filters. Usage (from app/): node scripts/vlc-smoke.js [vlc folder | ""]
//   default folder: vendor/vlc; "" = the system's libVLC (Linux)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = process.argv[2] != null ? process.argv[2] : path.join(__dirname, '..', 'vendor', 'vlc');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vlc-smoke-'));
const W = 320, H = 240, FPS = 25, SECS = 3;
// raw video (Y4M, a moving gradient) and a 440 Hz tone (WAV), then H.264/AAC in MP4 with the app's FFmpeg
const y4m = [Buffer.from(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`)];
for (let f = 0; f < FPS * SECS; f++) {
  const frame = Buffer.alloc(W * H * 3 / 2, 128);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) frame[y * W + x] = (x + y + f * 4) & 255;
  y4m.push(Buffer.from('FRAME\n'), frame);
}
fs.writeFileSync(path.join(tmp, 'v.y4m'), Buffer.concat(y4m));
const rate = 48000, n = rate * SECS, wav = Buffer.alloc(44 + n * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
fs.writeFileSync(path.join(tmp, 'a.wav'), wav);
const ffmpeg = require('ffmpeg-static');
execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', path.join(tmp, 'v.y4m'), '-i', path.join(tmp, 'a.wav'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-shortest', '-y', path.join(tmp, 'clip.mp4')]);

const v = require(path.join(__dirname, '..', 'native', 'vlcview', 'build', 'Release', 'vlcview.node'));
const buf = new ArrayBuffer(4096 * 2304 * 3 / 2 * 2 * 3);
const fail = m => { console.error('vlc-smoke: FAILED:', m); process.exit(1); };
console.log('libVLC', v.init(dir, buf, ['--aout=dummy']), 'from', dir || 'the system');
v.open(path.join(tmp, 'clip.mp4'), false, 0, false, []);
setTimeout(() => {
  const s = v.state(), fx = v.audioFx('compressor', [['compressor-ratio', 'f', 4]]);
  console.log(`state ${s.state}, ${s.width}x${s.height} ${s.chroma}, length ${s.length} ms, ${s.frames} frames shown, VLC audio filters ${fx ? 'ok' : 'missing'}`);
  v.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (s.state !== 3 && s.state !== 6) fail('not playing (state ' + s.state + ')');
  if (s.width !== W || s.height !== H) fail('no picture');
  if (s.frames < 10) fail('too few frames');
  if (Math.abs(s.length - SECS * 1000) > 300) fail('wrong length');
  if (!fx) fail('libvlccore functions not found');
  console.log('vlc-smoke: ok');
  process.exit(0);
}, 2000);
