// The audio effect settings of v2.x (effects.js EQ_PRESETS / BAND_LABELS, panels.js blocks), shared by the settings
// page and the quick settings
.pragma library

var BAND_LABELS = ['60 Hz', '170 Hz', '310 Hz', '600 Hz', '1 KHz', '3 KHz', '6 KHz', '12 KHz', '14 KHz', '16 KHz'];
// name, preamp, 10 bands (dB)
var EQ_PRESETS = {
  flat: ['Flat', 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  classical: ['Classical', 12, 0, 0, 0, 0, 0, 0, -7.2, -7.2, -7.2, -9.6],
  club: ['Club', 6, 0, 0, 8, 5.6, 5.6, 5.6, 3.2, 0, 0, 0],
  dance: ['Dance', 5, 9.6, 7.2, 2.4, 0, 0, -5.6, -7.2, -7.2, 0, 0],
  fullbass: ['Full bass', 5, -8, 9.6, 9.6, 5.6, 1.6, -4, -8, -10.4, -11.2, -11.2],
  fullbasstreble: ['Bass & treble', 4, 7.2, 5.6, 0, -7.2, -4.8, 1.6, 8, 11.2, 12, 12],
  fulltreble: ['Full treble', 3, -9.6, -9.6, -9.6, -4, 2.4, 11.2, 16, 16, 16, 16.8],
  headphones: ['Headphones', 4, 4.8, 11.2, 5.6, -3.2, -2.4, 1.6, 4.8, 9.6, 12.8, 14.4],
  largehall: ['Large hall', 5, 10.4, 10.4, 5.6, 5.6, 0, -4.8, -4.8, -4.8, 0, 0],
  live: ['Live', 7, -4.8, 0, 4, 5.6, 5.6, 5.6, 4, 2.4, 2.4, 2.4],
  party: ['Party', 6, 7.2, 7.2, 0, 0, 0, 0, 0, 0, 7.2, 7.2],
  pop: ['Pop', 6, -1.6, 4.8, 7.2, 8, 5.6, 0, -2.4, -2.4, -1.6, -1.6],
  reggae: ['Reggae', 8, 0, 0, 0, -5.6, 0, 6.4, 6.4, 0, 0, 0],
  rock: ['Rock', 5, 8, 4.8, -5.6, -8, -3.2, 4, 8.8, 11.2, 11.2, 11.2],
  ska: ['Ska', 6, -2.4, -4.8, -4, 0, 4, 5.6, 8.8, 9.6, 11.2, 9.6],
  soft: ['Soft', 5, 4.8, 1.6, 0, -2.4, 0, 4, 8, 9.6, 11.2, 12],
  softrock: ['Soft rock', 6, 4, 4, 2.4, 0, -4, -5.6, -3.2, 0, 2.4, 8.8],
  techno: ['Techno', 5, 8, 5.6, 0, -5.6, -4.8, 0, 8, 9.6, 9.6, 8.8]
};
function presetOptions() { return Object.keys(EQ_PRESETS).map(function (k) { return [k, EQ_PRESETS[k][0]]; }).concat([['custom', 'Custom']]); }
var f1 = function (v) { return (+v).toFixed(1); };
var COMP = [['threshold', 'Threshold', -60, 0, 0.5, ' dB'], ['ratio', 'Ratio', 1, 20, 0.5, ' : 1'], ['knee', 'Knee', 0, 40, 0.5, ' dB'],
            ['attack', 'Attack', 1, 500, 1, ' ms'], ['release', 'Release', 10, 1000, 5, ' ms'], ['makeup', 'Make-up gain', 0, 24, 0.5, ' dB']];
var REVERB = [['size', 'Size'], ['width', 'Width'], ['wet', 'Wet'], ['dry', 'Dry'], ['damp', 'Damp']];
var WIDEN = [['delay', 'Delay', 1, 100, 1, 1, ' ms'], ['feedback', 'Feedback', 0, 0.9, 0.01, 100, ' %'], ['crossfeed', 'Crossfeed', 0, 0.8, 0.01, 100, ' %'], ['dry', 'Dry mix', 0, 1, 0.01, 100, ' %']];
