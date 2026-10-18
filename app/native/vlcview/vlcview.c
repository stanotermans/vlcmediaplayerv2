// vlcview: plays media with libVLC (VLC's engine) for the "VLC" playback engine (Settings → Playback → Engine).
// libvlc.dll is loaded at runtime from the folder passed to init(), so no import library is needed and the app still
// starts when libVLC is missing (the Classic engine is used then).
// Video: libVLC writes every decoded frame (I420) straight into one of three slots of an ArrayBuffer that the app
// allocated; the preload script uploads the newest slot to WebGL. Audio goes from libVLC to the sound card itself.
#include <node_api.h>
#include <windows.h>
#include <stdint.h>
#include <string.h>
#include <stdio.h>

typedef struct libvlc_instance_t libvlc_instance_t;
typedef struct libvlc_media_t libvlc_media_t;
typedef struct libvlc_media_player_t libvlc_media_player_t;
typedef struct libvlc_equalizer_t libvlc_equalizer_t;
typedef int64_t libvlc_time_t;
typedef struct libvlc_track_description_t { int i_id; char *psz_name; struct libvlc_track_description_t *p_next; } libvlc_track_description_t;
typedef void *(*lock_cb)(void *opaque, void **planes);
typedef void (*unlock_cb)(void *opaque, void *picture, void *const *planes);
typedef void (*display_cb)(void *opaque, void *picture);
typedef unsigned (*format_cb)(void **opaque, char *chroma, unsigned *width, unsigned *height, unsigned *pitches, unsigned *lines);
typedef void (*cleanup_cb)(void *opaque);

static struct {
  libvlc_instance_t *(*new_)(int, const char *const *);
  const char *(*get_version)(void);
  libvlc_media_t *(*media_new_path)(libvlc_instance_t *, const char *);
  libvlc_media_t *(*media_new_location)(libvlc_instance_t *, const char *);
  void (*media_release)(libvlc_media_t *);
  void (*media_add_option)(libvlc_media_t *, const char *);
  libvlc_media_player_t *(*mp_new_from_media)(libvlc_media_t *);
  void (*mp_release)(libvlc_media_player_t *);
  int (*mp_play)(libvlc_media_player_t *);
  void (*mp_set_pause)(libvlc_media_player_t *, int);
  void (*mp_stop)(libvlc_media_player_t *);
  libvlc_time_t (*mp_get_time)(libvlc_media_player_t *);
  void (*mp_set_time)(libvlc_media_player_t *, libvlc_time_t);
  libvlc_time_t (*mp_get_length)(libvlc_media_player_t *);
  int (*mp_get_state)(libvlc_media_player_t *);
  int (*mp_set_rate)(libvlc_media_player_t *, float);
  int (*audio_set_volume)(libvlc_media_player_t *, int);
  void (*audio_set_mute)(libvlc_media_player_t *, int);
  void (*video_set_callbacks)(libvlc_media_player_t *, lock_cb, unlock_cb, display_cb, void *);
  void (*video_set_format_callbacks)(libvlc_media_player_t *, format_cb, cleanup_cb);
  int (*video_get_size)(libvlc_media_player_t *, unsigned, unsigned *, unsigned *);
  libvlc_track_description_t *(*audio_tracks)(libvlc_media_player_t *);
  void (*tracks_release)(libvlc_track_description_t *);
  int (*audio_set_track)(libvlc_media_player_t *, int);
  int (*audio_get_track)(libvlc_media_player_t *);
  int (*video_set_spu)(libvlc_media_player_t *, int);
  void (*next_frame)(libvlc_media_player_t *);
  libvlc_equalizer_t *(*eq_new)(void);
  void (*eq_release)(libvlc_equalizer_t *);
  int (*eq_set_preamp)(libvlc_equalizer_t *, float);
  int (*eq_set_amp)(libvlc_equalizer_t *, float, unsigned);
  int (*mp_set_equalizer)(libvlc_media_player_t *, libvlc_equalizer_t *);
  int (*audio_set_channel)(libvlc_media_player_t *, int);
} vlc;

static HMODULE dll;
static libvlc_instance_t *inst;
static libvlc_media_player_t *mp;
static libvlc_equalizer_t *eq;                  // VLC's 10-band equalizer; NULL = off (kept across files)
static int stereo_mode = 0;                     // libVLC stereo mode: 0 = as the file is, 1 = stereo (downmix)

// VLC's audio filters (compressor, spatializer, stereo widener) and the stereo mode are object variables that the audio
// output reads from the media player, like VLC's own interface sets them. libvlc has no call for them, so they are set
// through libvlccore (the media player is a VLC object).
typedef union { int64_t i_int; int b_bool; float f_float; char *psz_string; void *p_address; struct { int32_t x, y; } c; } vlc_value_t;
typedef struct { int i_type; int i_count; vlc_value_t *p_values; } vlc_list_t;
#define VAR_BOOL 0x20
#define VAR_INTEGER 0x30
#define VAR_STRING 0x40
#define VAR_FLOAT 0x50
static struct {
  int (*var_Create)(void *, const char *, int);
  int (*var_SetChecked)(void *, const char *, int, vlc_value_t);
  vlc_list_t *(*list_children)(void *);
  void (*obj_hold)(void *);
  void (*obj_release)(void *);
  void (*free_)(void *);
} core;
static char fx_filters[256];                    // e.g. "compressor:spatializer" (the equalizer is added when it is on)
static struct { char name[48]; int type; double v; } fx_param[32]; static int fx_n;

// frame slots inside the JS-owned buffer
#define SLOTS 3
static uint8_t *buf; static size_t buf_size; static napi_ref buf_ref;
static volatile LONG width, height, slot_size, fmt_ok, sample_bytes = 1;
static int want_deep = 0;                      // HDR: ask libVLC for 10-bit frames (I0AL) instead of 8-bit
static char source_chroma[5];
static volatile LONG latest = -1, reading = -1, next_slot = 0;
static volatile LONG64 frames = 0;            // frames libVLC has shown since open()

static unsigned on_format(void **opaque, char *chroma, unsigned *w, unsigned *h, unsigned *pitches, unsigned *lines) {
  unsigned W = (*w + 1) & ~1u, H = (*h + 1) & ~1u;   // decoders can add a few padding rows; the visible size comes from libVLC
  memcpy(source_chroma, chroma, 4); source_chroma[4] = 0;
  LONG B = want_deep ? 2 : 1;                        // bytes per sample: I0AL keeps 10 bits in 16-bit samples
  size_t need = (size_t)W * H * 3 / 2 * B;
  memcpy(chroma, B == 2 ? "I0AL" : "I420", 4);
  if (need * SLOTS > buf_size) { InterlockedExchange(&fmt_ok, 0); return 0; }   // larger than the buffer: no picture
  *w = W; *h = H;
  InterlockedExchange(&sample_bytes, B);
  pitches[0] = W * B; pitches[1] = pitches[2] = W / 2 * B;
  lines[0] = H; lines[1] = lines[2] = H / 2;
  InterlockedExchange(&width, W); InterlockedExchange(&height, H); InterlockedExchange(&slot_size, (LONG)need);
  InterlockedExchange(&latest, -1); InterlockedExchange(&fmt_ok, 1);
  return 1;
}
static void on_cleanup(void *opaque) { InterlockedExchange(&fmt_ok, 0); }
static void *on_lock(void *opaque, void **planes) {
  LONG s = next_slot;
  for (int i = 0; i < SLOTS; i++) { s = (s + 1) % SLOTS; if (s != latest && s != reading) break; }   // never the slot JS is reading
  next_slot = s;
  uint8_t *base = buf + (size_t)s * slot_size;
  LONG W = width, H = height, B = sample_bytes;
  planes[0] = base; planes[1] = base + W * H * B; planes[2] = base + W * H * B + (W / 2) * (H / 2) * B;
  return (void *)(intptr_t)s;
}
static void on_unlock(void *opaque, void *picture, void *const *planes) {}
static void on_display(void *opaque, void *picture) {
  InterlockedExchange(&latest, (LONG)(intptr_t)picture);
  InterlockedIncrement64(&frames);
}

#define FN(name) static napi_value name(napi_env env, napi_callback_info info)
#define ARGS(n) size_t argc = n; napi_value argv[n]; napi_get_cb_info(env, info, &argc, argv, NULL, NULL)
static napi_value num(napi_env env, double v) { napi_value r; napi_create_double(env, v, &r); return r; }
static napi_value str(napi_env env, const char *s) { napi_value r; napi_create_string_utf8(env, s, NAPI_AUTO_LENGTH, &r); return r; }
static void set(napi_env env, napi_value o, const char *k, double v) { napi_set_named_property(env, o, k, num(env, v)); }
static void throw_(napi_env env, const char *m) { napi_throw_error(env, NULL, m); }

#define LOAD(field, sym) if (!(*(FARPROC *)&vlc.field = GetProcAddress(dll, sym))) { throw_(env, "libvlc: missing " sym); return NULL; }
// init(vlcFolder, frameBuffer, extraArgs) → libVLC version; extraArgs: more libVLC options (e.g. passthrough)
FN(Init) {
  ARGS(3);
  if (inst) return str(env, vlc.get_version());
  wchar_t dir[1024]; char d8[1024]; size_t n;
  napi_get_value_string_utf8(env, argv[0], d8, sizeof d8, &n);
  MultiByteToWideChar(CP_UTF8, 0, d8, -1, dir, 1024);
  SetDllDirectoryW(dir);                                         // libvlc.dll finds libvlccore.dll and plugins\ next to it
  wchar_t path[1100]; swprintf(path, 1100, L"%s\\libvlc.dll", dir);
  dll = LoadLibraryW(path);
  if (!dll) { throw_(env, "libvlc.dll not found"); return NULL; }
  LOAD(new_, "libvlc_new") LOAD(get_version, "libvlc_get_version")
  LOAD(media_new_path, "libvlc_media_new_path") LOAD(media_new_location, "libvlc_media_new_location")
  LOAD(media_release, "libvlc_media_release") LOAD(media_add_option, "libvlc_media_add_option") LOAD(mp_new_from_media, "libvlc_media_player_new_from_media")
  LOAD(mp_release, "libvlc_media_player_release") LOAD(mp_play, "libvlc_media_player_play")
  LOAD(mp_set_pause, "libvlc_media_player_set_pause") LOAD(mp_stop, "libvlc_media_player_stop")
  LOAD(mp_get_time, "libvlc_media_player_get_time") LOAD(mp_set_time, "libvlc_media_player_set_time")
  LOAD(mp_get_length, "libvlc_media_player_get_length") LOAD(mp_get_state, "libvlc_media_player_get_state")
  LOAD(mp_set_rate, "libvlc_media_player_set_rate")
  LOAD(audio_set_volume, "libvlc_audio_set_volume") LOAD(audio_set_mute, "libvlc_audio_set_mute")
  LOAD(video_set_callbacks, "libvlc_video_set_callbacks") LOAD(video_set_format_callbacks, "libvlc_video_set_format_callbacks")
  LOAD(video_get_size, "libvlc_video_get_size")
  LOAD(audio_tracks, "libvlc_audio_get_track_description") LOAD(tracks_release, "libvlc_track_description_list_release")
  LOAD(audio_set_track, "libvlc_audio_set_track") LOAD(audio_get_track, "libvlc_audio_get_track")
  LOAD(video_set_spu, "libvlc_video_set_spu") LOAD(next_frame, "libvlc_media_player_next_frame")
  LOAD(eq_new, "libvlc_audio_equalizer_new") LOAD(eq_release, "libvlc_audio_equalizer_release")
  LOAD(eq_set_preamp, "libvlc_audio_equalizer_set_preamp") LOAD(eq_set_amp, "libvlc_audio_equalizer_set_amp_at_index")
  LOAD(mp_set_equalizer, "libvlc_media_player_set_equalizer") LOAD(audio_set_channel, "libvlc_audio_set_channel")
  HMODULE cdll = GetModuleHandleW(L"libvlccore.dll"), crt = LoadLibraryW(L"msvcrt.dll");
  if (cdll && crt) {
    *(FARPROC *)&core.var_Create = GetProcAddress(cdll, "var_Create");
    *(FARPROC *)&core.var_SetChecked = GetProcAddress(cdll, "var_SetChecked");
    *(FARPROC *)&core.list_children = GetProcAddress(cdll, "vlc_list_children");
    *(FARPROC *)&core.obj_hold = GetProcAddress(cdll, "vlc_object_hold");
    *(FARPROC *)&core.obj_release = GetProcAddress(cdll, "vlc_object_release");
    *(FARPROC *)&core.free_ = GetProcAddress(crt, "free");       // libVLC is built against msvcrt
  }
  static char extra[8][1024]; const char *args[16] = { "--no-video-title-show", "--quiet", "--no-osd", "--no-snapshot-preview", "--no-stats", "--no-lua", "--no-sub-autodetect-file" };
  int na = 7; uint32_t ne = 0;
  if (argc > 2) { bool isArr = false; napi_is_array(env, argv[2], &isArr); if (isArr) napi_get_array_length(env, argv[2], &ne); }
  for (uint32_t i = 0; i < ne && i < 8; i++) { napi_value e; size_t l; napi_get_element(env, argv[2], i, &e); napi_get_value_string_utf8(env, e, extra[i], sizeof extra[i], &l); args[na++] = extra[i]; }
  inst = vlc.new_(na, args);
  if (!inst) { throw_(env, "libvlc_new failed"); return NULL; }
  void *data; napi_get_arraybuffer_info(env, argv[1], &data, &buf_size); buf = data;
  napi_create_reference(env, argv[1], 1, &buf_ref);              // keeps the buffer alive (and in place)
  return str(env, vlc.get_version());
}
static int core_ok(void) { return core.var_Create && core.var_SetChecked && core.list_children && core.obj_hold && core.obj_release && core.free_; }
// the media player's audio output (held), or NULL before the file's audio started
static void *hold_aout(void) {
  if (!mp || !core_ok()) return NULL;
  vlc_list_t *l = core.list_children(mp); void *a = NULL;
  if (!l) return NULL;
  for (int i = 0; i < l->i_count; i++) {
    void *o = l->p_values[i].p_address;
    const char *type = *(const char **)o;                        // vlc_object_t starts with its type name
    if (!a && type && !strcmp(type, "audio output")) { core.obj_hold(o); a = o; }
    core.obj_release(o);
  }
  core.free_(l->p_values); core.free_(l);
  return a;
}
static void set_var(void *o, const char *name, int type, vlc_value_t v) {
  if (core.var_SetChecked(o, name, type, v) != 0) { core.var_Create(o, name, type); core.var_SetChecked(o, name, type, v); }
}
// sets the filter list, filter settings and stereo mode on o (the media player before playback, or its audio output
// while playing, which then rebuilds its filters right away)
static void apply_fx(void *o) {
  if (!o || !core_ok()) return;
  for (int i = 0; i < fx_n; i++) {
    vlc_value_t v; memset(&v, 0, sizeof v);
    if (fx_param[i].type == VAR_FLOAT) v.f_float = (float)fx_param[i].v;
    else if (fx_param[i].type == VAR_BOOL) v.b_bool = fx_param[i].v != 0;
    else v.i_int = (int64_t)fx_param[i].v;
    set_var(o, fx_param[i].name, fx_param[i].type, v);
  }
  char f[300]; snprintf(f, sizeof f, "%s%s%s", eq ? "equalizer" : "", eq && fx_filters[0] ? ":" : "", fx_filters);
  vlc_value_t v; v.psz_string = f; set_var(o, "audio-filter", VAR_STRING, v);
}
static void apply_fx_live(void) { void *a = hold_aout(); if (a) { apply_fx(a); core.obj_release(a); } }
// The stereo mode: VLC resets it to the audio output's first value (inherited from the libVLC instance) whenever a
// decoder starts, so it is set on the instance for the next files and on the running output to switch now
static void apply_stereo(void) {
  if (!inst || !core_ok()) return;
  vlc_value_t m; m.i_int = stereo_mode;
  set_var(*(void **)inst, "stereo-mode", VAR_INTEGER, m);         // libvlc_instance_t starts with its libvlc_int_t
  void *a = hold_aout(); if (a) { set_var(a, "stereo-mode", VAR_INTEGER, m); core.obj_release(a); }
}
static void release_player(void) { if (mp) { vlc.mp_stop(mp); vlc.mp_release(mp); mp = NULL; } InterlockedExchange(&fmt_ok, 0); }
// open(target, isLocation, startMs, deep, options) → plays a file path, or a URL/MRL when isLocation; deep: 10-bit
// frames; options: extra libVLC media options (":audio-filter=…" etc.)
FN(Open) {
  ARGS(5); char p[4096]; size_t n; bool loc = false; double start = 0;
  napi_get_value_string_utf8(env, argv[0], p, sizeof p, &n);
  if (argc > 1) napi_get_value_bool(env, argv[1], &loc);
  if (argc > 2) napi_get_value_double(env, argv[2], &start);
  bool deep = false; if (argc > 3) napi_get_value_bool(env, argv[3], &deep); want_deep = deep;
  release_player();
  libvlc_media_t *m = loc ? vlc.media_new_location(inst, p) : vlc.media_new_path(inst, p);
  if (!m) { throw_(env, "cannot open"); return NULL; }
  if (start > 0) { char o[64]; snprintf(o, sizeof o, ":start-time=%.3f", start / 1000.0); vlc.media_add_option(m, o); }   // resume point
  uint32_t no = 0; if (argc > 4) { bool isArr = false; napi_is_array(env, argv[4], &isArr); if (isArr) napi_get_array_length(env, argv[4], &no); }
  for (uint32_t i = 0; i < no; i++) { napi_value e; char o[512]; size_t l; napi_get_element(env, argv[4], i, &e); napi_get_value_string_utf8(env, e, o, sizeof o, &l); vlc.media_add_option(m, o); }
  mp = vlc.mp_new_from_media(m); vlc.media_release(m);
  vlc.video_set_callbacks(mp, on_lock, on_unlock, on_display, NULL);
  vlc.video_set_format_callbacks(mp, on_format, on_cleanup);
  InterlockedExchange64(&frames, 0); InterlockedExchange(&latest, -1);
  vlc.mp_set_equalizer(mp, eq);                    // NULL is "off"
  apply_fx(mp); apply_fx_live();                   // libVLC makes the audio output with the player, so set it there too
  int r = vlc.mp_play(mp);
  return num(env, r);
}
FN(Play) { if (mp) vlc.mp_set_pause(mp, 0); return NULL; }
FN(Pause) { if (mp) vlc.mp_set_pause(mp, 1); return NULL; }
FN(Stop) { release_player(); return NULL; }
FN(Seek) { ARGS(1); double ms; napi_get_value_double(env, argv[0], &ms); if (mp) vlc.mp_set_time(mp, (libvlc_time_t)ms); return NULL; }
FN(Rate) { ARGS(1); double r; napi_get_value_double(env, argv[0], &r); if (mp) vlc.mp_set_rate(mp, (float)r); return NULL; }
FN(Volume) { ARGS(1); int32_t v; napi_get_value_int32(env, argv[0], &v); if (mp) vlc.audio_set_volume(mp, v); return NULL; }   // 0–200
FN(Mute) { ARGS(1); bool b; napi_get_value_bool(env, argv[0], &b); if (mp) vlc.audio_set_mute(mp, b); return NULL; }
// state() → { state, time, length, width, height, frames } (state: 0 idle, 1 opening, 2 buffering, 3 playing,
// 4 paused, 5 stopped, 6 ended, 7 error)
FN(State) {
  napi_value o; napi_create_object(env, &o);
  unsigned vw = 0, vh = 0;
  if (mp) vlc.video_get_size(mp, 0, &vw, &vh);
  set(env, o, "state", mp ? vlc.mp_get_state(mp) : 0);
  set(env, o, "time", mp ? (double)vlc.mp_get_time(mp) : 0);
  set(env, o, "length", mp ? (double)vlc.mp_get_length(mp) : 0);
  set(env, o, "width", fmt_ok ? vw : 0); set(env, o, "height", fmt_ok ? vh : 0);
  set(env, o, "frames", (double)frames);
  napi_set_named_property(env, o, "chroma", str(env, source_chroma));
  return o;
}
// frame() → { slot, width, height, offset, frames } for the newest picture; marks that slot as being read until done()
FN(Frame) {
  napi_value o; napi_create_object(env, &o);
  LONG s = fmt_ok ? latest : -1;
  InterlockedExchange(&reading, s);
  set(env, o, "slot", s); set(env, o, "width", width); set(env, o, "height", height);
  set(env, o, "offset", (double)(s < 0 ? 0 : s) * slot_size); set(env, o, "frames", (double)frames); set(env, o, "bytes", sample_bytes);
  return o;
}
FN(Done) { InterlockedExchange(&reading, -1); return NULL; }
// audioTracks() → [{ id, name }] without VLC's "Disable" entry, in stream order; current: id of the playing one
FN(AudioTracks) {
  napi_value arr; napi_create_array(env, &arr);
  if (!mp) return arr;
  libvlc_track_description_t *list = vlc.audio_tracks(mp), *d; uint32_t i = 0;
  for (d = list; d; d = d->p_next) {
    if (d->i_id < 0) continue;
    napi_value o; napi_create_object(env, &o);
    set(env, o, "id", d->i_id);
    napi_set_named_property(env, o, "name", str(env, d->psz_name ? d->psz_name : ""));
    napi_set_element(env, arr, i++, o);
  }
  if (list) vlc.tracks_release(list);
  napi_set_named_property(env, arr, "current", num(env, vlc.audio_get_track(mp)));
  return arr;
}
FN(SetAudioTrack) { ARGS(1); int32_t id; napi_get_value_int32(env, argv[0], &id); return num(env, mp ? vlc.audio_set_track(mp, id) : -1); }
FN(NoSpu) { if (mp) vlc.video_set_spu(mp, -1); return NULL; }   // embedded subtitles are drawn by the app
FN(NextFrame) { if (mp) vlc.next_frame(mp); return NULL; }
// equalizer([preamp, 10 band gains in dB]) on, or equalizer(null) off; applies right away
FN(Equalizer) {
  ARGS(1); bool isArr = false; napi_is_array(env, argv[0], &isArr);
  if (!isArr) { if (eq) { vlc.eq_release(eq); eq = NULL; } if (mp) { vlc.mp_set_equalizer(mp, NULL); apply_fx(mp); apply_fx_live(); } return NULL; }
  if (!eq) eq = vlc.eq_new();
  for (uint32_t i = 0; i < 11; i++) { napi_value e; double d = 0; if (napi_get_element(env, argv[0], i, &e) == napi_ok) napi_get_value_double(env, e, &d); if (i == 0) vlc.eq_set_preamp(eq, (float)d); else vlc.eq_set_amp(eq, (float)d, i - 1); }
  if (mp) { vlc.mp_set_equalizer(mp, eq); apply_fx(mp); apply_fx_live(); }   // set_equalizer resets the filter list
  return NULL;
}
// stereo(true): mix surround down to stereo; stereo(false): channels as in the file
FN(Stereo) { ARGS(1); bool b; napi_get_value_bool(env, argv[0], &b); int was = stereo_mode; stereo_mode = b ? 1 : 0; if (was != stereo_mode || !mp) apply_stereo(); return NULL; }
// audioFx("compressor:spatializer", [[name, "f"|"i"|"b", value], …]) → applies right away; "" = no filters
FN(AudioFx) {
  ARGS(2); size_t n; napi_get_value_string_utf8(env, argv[0], fx_filters, sizeof fx_filters, &n);
  uint32_t np = 0; bool isArr = false; napi_is_array(env, argv[1], &isArr); if (isArr) napi_get_array_length(env, argv[1], &np);
  fx_n = 0;
  for (uint32_t i = 0; i < np && fx_n < 32; i++) {
    napi_value e, a, b, c; char t[4]; size_t l;
    napi_get_element(env, argv[1], i, &e); napi_get_element(env, e, 0, &a); napi_get_element(env, e, 1, &b); napi_get_element(env, e, 2, &c);
    napi_get_value_string_utf8(env, a, fx_param[fx_n].name, sizeof fx_param[fx_n].name, &l);
    napi_get_value_string_utf8(env, b, t, sizeof t, &l);
    fx_param[fx_n].type = t[0] == 'f' ? VAR_FLOAT : t[0] == 'b' ? VAR_BOOL : VAR_INTEGER;
    napi_get_value_double(env, c, &fx_param[fx_n].v); fx_n++;
  }
  if (mp) { apply_fx(mp); apply_fx_live(); }
  return num(env, core_ok());
}

static napi_value Init_(napi_env env, napi_value exports) {
  napi_property_descriptor p[] = {
#define P(n, f) { n, 0, f, 0, 0, 0, napi_default, 0 }
    P("init", Init), P("open", Open), P("play", Play), P("pause", Pause), P("stop", Stop), P("seek", Seek),
    P("rate", Rate), P("volume", Volume), P("mute", Mute), P("state", State), P("frame", Frame), P("done", Done),
    P("audioTracks", AudioTracks), P("setAudioTrack", SetAudioTrack), P("noSpu", NoSpu), P("nextFrame", NextFrame),
    P("equalizer", Equalizer), P("stereo", Stereo), P("audioFx", AudioFx),
  };
  napi_define_properties(env, exports, sizeof p / sizeof *p, p);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init_)
