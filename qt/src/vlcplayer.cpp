#include "vlcplayer.h"
#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QMetaObject>
#include <cstring>
#include <QImage>
#include <QDateTime>
#include <cstdarg>
#include <cstdio>
#include <QRegularExpression>
#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

// ---- libVLC, loaded at runtime (the folder "vlc" next to the program, or VLCR_VLC) ----
typedef struct libvlc_instance_t libvlc_instance_t;
typedef struct libvlc_media_t libvlc_media_t;
typedef struct libvlc_media_player_t libvlc_media_player_t;
typedef void *(*lock_cb)(void *, void **);
typedef void (*unlock_cb)(void *, void *, void *const *);
typedef void (*display_cb)(void *, void *);
typedef unsigned (*format_cb)(void **, char *, unsigned *, unsigned *, unsigned *, unsigned *);
typedef void (*cleanup_cb)(void *);
struct track_desc { int id; char *name; track_desc *next; };   // libvlc_track_description_t
struct title_desc { int64_t duration; char *name; unsigned flags; };   // libvlc_title_description_t
// libvlc_media_track_t and libvlc_video_track_t (libVLC 3), for the pixel aspect ratio
struct video_track { unsigned height, width, sar_num, sar_den, fr_num, fr_den; };
struct media_track { uint32_t codec, fourcc; int id; int type; int profile, level; void *detail; unsigned bitrate; char *language, *description; };
static struct {
  libvlc_instance_t *(*new_)(int, const char *const *);
  const char *(*get_version)();
  libvlc_media_t *(*media_new_path)(libvlc_instance_t *, const char *);
  libvlc_media_t *(*media_new_location)(libvlc_instance_t *, const char *);
  void (*media_add_option)(libvlc_media_t *, const char *);
  void (*media_release)(libvlc_media_t *);
  libvlc_media_player_t *(*mp_new_from_media)(libvlc_media_t *);
  void (*mp_release)(libvlc_media_player_t *);
  int (*mp_play)(libvlc_media_player_t *);
  void (*mp_set_pause)(libvlc_media_player_t *, int);
  void (*mp_stop)(libvlc_media_player_t *);
  int64_t (*mp_get_time)(libvlc_media_player_t *);
  void (*mp_set_time)(libvlc_media_player_t *, int64_t);
  int64_t (*mp_get_length)(libvlc_media_player_t *);
  int (*mp_get_state)(libvlc_media_player_t *);
  int (*audio_set_volume)(libvlc_media_player_t *, int);
  void (*audio_set_mute)(libvlc_media_player_t *, int);
  int (*mp_set_rate)(libvlc_media_player_t *, float);
  void (*mp_next_frame)(libvlc_media_player_t *);
  track_desc *(*audio_get_track_description)(libvlc_media_player_t *);
  int (*audio_get_track)(libvlc_media_player_t *);
  int (*audio_set_track)(libvlc_media_player_t *, int);
  void (*track_description_list_release)(track_desc *);
  track_desc *(*video_get_spu_description)(libvlc_media_player_t *);
  int (*video_set_spu)(libvlc_media_player_t *, int);
  int (*video_set_spu_delay)(libvlc_media_player_t *, int64_t);
  libvlc_media_t *(*mp_get_media)(libvlc_media_player_t *);
  unsigned (*media_tracks_get)(libvlc_media_t *, media_track ***);
  void (*media_tracks_release)(media_track **, unsigned);
  void (*video_set_callbacks)(libvlc_media_player_t *, lock_cb, unlock_cb, display_cb, void *);
  void (*video_set_format_callbacks)(libvlc_media_player_t *, format_cb, cleanup_cb);
  int (*video_get_size)(libvlc_media_player_t *, unsigned, unsigned *, unsigned *);
  void *(*eq_new)();
  void (*eq_release)(void *);
  int (*eq_set_preamp)(void *, float);
  int (*eq_set_amp)(void *, float, unsigned);
  int (*mp_set_equalizer)(libvlc_media_player_t *, void *);
  int (*audio_set_delay)(libvlc_media_player_t *, int64_t);
  void (*navigate)(libvlc_media_player_t *, unsigned);
  int (*get_titles)(libvlc_media_player_t *, title_desc ***);
  void (*titles_release)(title_desc **, unsigned);
  int (*get_title)(libvlc_media_player_t *);
  void (*set_title)(libvlc_media_player_t *, int);
  void (*log_set)(libvlc_instance_t *, void (*)(void *, int, const void *, const char *, va_list), void *);
} vlc;
// the log (Settings → General → Save a log)
static std::mutex logLock;
static QString logPath;
static bool logEverything;
static void writeLog(int level, const QString &text) {
  std::lock_guard<std::mutex> g(logLock);
  if (logPath.isEmpty()) return;
  QFile f(logPath);
  if (f.open(QIODevice::Append | QIODevice::Text))
    f.write((QDateTime::currentDateTime().toString(Qt::ISODateWithMs) + (level >= 4 ? " [error] " : level == 3 ? " [warning] " : " [info] ") + text + "\n").toUtf8());
}
static void onLog(void *, int level, const void *, const char *fmt, va_list args) {
  if (level < (logEverything ? 2 : 4)) return;                 // 2 notice, 3 warning, 4 error (debug left out)
  char line[1024]; vsnprintf(line, sizeof line, fmt, args);
  writeLog(level, "libVLC: " + QString::fromUtf8(line));
}
static libvlc_instance_t *inst;

// VLC's audio filters, the stereo mode, recording and DVD mouse input are object variables (like VLC's own interface
// sets them); libvlc has no calls for them, so they are set through libvlccore (the media player is a VLC object)
typedef union { int64_t i_int; int b_bool; float f_float; char *psz_string; void *p_address; struct { int32_t x, y; } c; } vlc_value_t;
typedef struct { int i_type; int i_count; vlc_value_t *p_values; } vlc_list_t;
enum { VAR_BOOL = 0x20, VAR_INTEGER = 0x30, VAR_STRING = 0x40, VAR_FLOAT = 0x50, VAR_COORDS = 0xA0 };
static struct {
  int (*var_Create)(void *, const char *, int);
  int (*var_SetChecked)(void *, const char *, int, vlc_value_t);
  vlc_list_t *(*list_children)(void *);
  void (*obj_hold)(void *);
  void (*obj_release)(void *);
  void (*free_)(void *);
  int (*var_Trigger)(void *, const char *);
} core;
static bool coreOk() { return core.var_Create && core.var_SetChecked && core.list_children && core.obj_hold && core.obj_release && core.free_; }
static void setVar(void *o, const char *name, int type, vlc_value_t v) {
  if (core.var_SetChecked(o, name, type, v) != 0) { core.var_Create(o, name, type); core.var_SetChecked(o, name, type, v); }
}
static void *eq;                                     // the equalizer (NULL: off), kept across files
static int64_t audioDelayUs;
static int stereoMode;                               // 0 as in the file, 1 stereo (downmix)
static QByteArray fxFilters;                         // "compressor:spatializer"
static QList<QPair<QByteArray, QPair<int, double>>> fxParams;

bool VlcPlayer::load() {
  if (inst) return true;
#ifdef _WIN32
  QString dir = qEnvironmentVariable("VLCR_VLC", QCoreApplication::applicationDirPath() + "/vlc");
  SetDllDirectoryW(reinterpret_cast<const wchar_t *>(QDir::toNativeSeparators(dir).utf16()));
  HMODULE dll = LoadLibraryW(reinterpret_cast<const wchar_t *>(QDir::toNativeSeparators(dir + "/libvlc.dll").utf16()));
  if (!dll) { m_error = "libVLC not found in " + dir; emit errorChanged(); return false; }
#define LOAD(f, s) if (!(*(FARPROC *)&vlc.f = GetProcAddress(dll, s))) { m_error = "libVLC: missing " s; emit errorChanged(); return false; }
#else
  // the bundled libVLC (phase 7 packages it next to the program), or the system's
  QString dir = qEnvironmentVariable("VLCR_VLC", QCoreApplication::applicationDirPath() + "/vlc");
  auto open = [](const QString &p) { return dlopen(p.toUtf8().constData(), RTLD_NOW | RTLD_GLOBAL); };
#ifdef __APPLE__
  // VLC.app's layout (scripts/fetch-vlc.js): lib/ and plugins/ side by side. libVLC and the plugins ask for
  // @rpath/libvlccore.dylib, an rpath only VLC's own program has: loading libvlccore by its full path first makes
  // that name refer to it (the dylibs keep VideoLAN's signatures)
  if (!qEnvironmentVariableIsSet("VLC_PLUGIN_PATH")) qputenv("VLC_PLUGIN_PATH", QString(dir + "/plugins").toUtf8());
  if (!open(dir + "/lib/libvlccore.dylib")) open(dir + "/lib/libvlccore.9.dylib");
  void *dll = open(dir + "/lib/libvlc.dylib");
  if (!dll) dll = open(dir + "/lib/libvlc.5.dylib");
#else
  // build/vlc-linux: lib/libvlc.so.5, lib/libvlccore.so.9 and lib/vlc/plugins (found next to libvlccore)
  void *dll = open(dir + "/lib/libvlc.so.5");
  if (!dll) dll = open("libvlc.so.5");                                 // a system libVLC (development)
#endif
  if (!dll) { m_error = "libVLC not found in " + dir; emit errorChanged(); return false; }
#define LOAD(f, s) if (!(*(void **)&vlc.f = dlsym(dll, s))) { m_error = "libVLC: missing " s; emit errorChanged(); return false; }
#endif
  LOAD(new_, "libvlc_new") LOAD(get_version, "libvlc_get_version")
  LOAD(media_new_path, "libvlc_media_new_path") LOAD(media_release, "libvlc_media_release")
  LOAD(media_new_location, "libvlc_media_new_location") LOAD(media_add_option, "libvlc_media_add_option")
  LOAD(audio_set_mute, "libvlc_audio_set_mute") LOAD(mp_set_rate, "libvlc_media_player_set_rate") LOAD(mp_next_frame, "libvlc_media_player_next_frame")
  LOAD(audio_get_track_description, "libvlc_audio_get_track_description") LOAD(audio_get_track, "libvlc_audio_get_track")
  LOAD(audio_set_track, "libvlc_audio_set_track") LOAD(track_description_list_release, "libvlc_track_description_list_release")
  LOAD(video_get_spu_description, "libvlc_video_get_spu_description") LOAD(video_set_spu, "libvlc_video_set_spu") LOAD(video_set_spu_delay, "libvlc_video_set_spu_delay")
  LOAD(mp_get_media, "libvlc_media_player_get_media") LOAD(media_tracks_get, "libvlc_media_tracks_get") LOAD(media_tracks_release, "libvlc_media_tracks_release")
  LOAD(mp_new_from_media, "libvlc_media_player_new_from_media") LOAD(mp_release, "libvlc_media_player_release")
  LOAD(mp_play, "libvlc_media_player_play") LOAD(mp_set_pause, "libvlc_media_player_set_pause") LOAD(mp_stop, "libvlc_media_player_stop")
  LOAD(mp_get_time, "libvlc_media_player_get_time") LOAD(mp_set_time, "libvlc_media_player_set_time")
  LOAD(mp_get_length, "libvlc_media_player_get_length") LOAD(mp_get_state, "libvlc_media_player_get_state")
  LOAD(audio_set_volume, "libvlc_audio_set_volume")
  LOAD(video_set_callbacks, "libvlc_video_set_callbacks") LOAD(video_set_format_callbacks, "libvlc_video_set_format_callbacks")
  LOAD(video_get_size, "libvlc_video_get_size")
  LOAD(eq_new, "libvlc_audio_equalizer_new") LOAD(eq_release, "libvlc_audio_equalizer_release")
  LOAD(eq_set_preamp, "libvlc_audio_equalizer_set_preamp") LOAD(eq_set_amp, "libvlc_audio_equalizer_set_amp_at_index")
  LOAD(mp_set_equalizer, "libvlc_media_player_set_equalizer") LOAD(audio_set_delay, "libvlc_audio_set_delay")
  LOAD(navigate, "libvlc_media_player_navigate") LOAD(get_titles, "libvlc_media_player_get_full_title_descriptions")
  LOAD(log_set, "libvlc_log_set") LOAD(titles_release, "libvlc_title_descriptions_release") LOAD(get_title, "libvlc_media_player_get_title") LOAD(set_title, "libvlc_media_player_set_title")
#ifdef _WIN32
  if (HMODULE c = GetModuleHandleW(L"libvlccore.dll")) {
#define CORE(f, s) *(FARPROC *)&core.f = GetProcAddress(c, s);
    CORE(var_Create, "var_Create") CORE(var_SetChecked, "var_SetChecked") CORE(list_children, "vlc_list_children")
    CORE(obj_hold, "vlc_object_hold") CORE(obj_release, "vlc_object_release") CORE(var_Trigger, "var_TriggerCallback")
  }
  if (HMODULE crt = LoadLibraryW(L"msvcrt.dll")) *(FARPROC *)&core.free_ = GetProcAddress(crt, "free");   // libVLC is built against msvcrt
#else
  {
#ifdef __APPLE__
    void *c = open(dir + "/lib/libvlccore.dylib");
    if (!c) c = open(dir + "/lib/libvlccore.9.dylib");
#else
    void *c = open(dir + "/lib/libvlccore.so.9");
    if (!c) c = open("libvlccore.so.9");
#endif
    if (!c) c = RTLD_DEFAULT;
    *(void **)&core.var_Create = dlsym(c, "var_Create"); *(void **)&core.var_SetChecked = dlsym(c, "var_SetChecked");
    *(void **)&core.list_children = dlsym(c, "vlc_list_children"); *(void **)&core.obj_hold = dlsym(c, "vlc_object_hold");
    *(void **)&core.obj_release = dlsym(c, "vlc_object_release"); *(void **)&core.var_Trigger = dlsym(c, "var_TriggerCallback");
    core.free_ = free;
  }
#endif
  // --quiet also keeps libVLC's messages from the log; with the log on they are wanted
  QList<QByteArray> keep = { "--no-video-title-show", "--no-sub-autodetect-file", logFile().isEmpty() ? "--quiet" : "--verbose=2", "--no-osd", "--no-snapshot-preview", "--no-stats", "--no-lua" };
  for (const QString &a : m_startArgs) keep << a.toUtf8();
  QVector<const char *> args; for (const QByteArray &a : keep) args << a.constData();
  inst = vlc.new_(args.size(), args.data());
  if (!inst) { m_error = "libvlc_new failed"; emit errorChanged(); return false; }
  m_version = QString::fromUtf8(vlc.get_version());
  vlc.log_set(inst, onLog, nullptr);
  writeLog(2, "libVLC " + m_version + " started");
  emit versionChanged();
  applyStereo();
  return true;
}

VlcPlayer::VlcPlayer(QObject *parent) : QObject(parent) {
  // after QML has set the properties (startArgs)
  QMetaObject::invokeMethod(this, [this]() { load(); }, Qt::QueuedConnection);
  m_timer.setInterval(50);
  connect(&m_timer, &QTimer::timeout, this, &VlcPlayer::poll);
  m_timer.start();
}
VlcPlayer::~VlcPlayer() { stop(); }

static libvlc_media_player_t *MP(void *p) { return static_cast<libvlc_media_player_t *>(p); }

void VlcPlayer::open(const QString &src, qint64 startMs, const QStringList &options) {
  if (!load()) return;
  stop();
  const bool url = QRegularExpression("^[a-z][a-z0-9+.-]*://", QRegularExpression::CaseInsensitiveOption).match(src).hasMatch();
  libvlc_media_t *m = url ? vlc.media_new_location(inst, src.toUtf8().constData())
                          : vlc.media_new_path(inst, QDir::toNativeSeparators(src).toUtf8().constData());   // libVLC wants backslashes on Windows
  if (!m) return;
  if (startMs > 0) vlc.media_add_option(m, QString(":start-time=%1").arg(startMs / 1000.0, 0, 'f', 3).toUtf8().constData());
  for (const QString &o : options) vlc.media_add_option(m, o.toUtf8().constData());
  auto *mp = vlc.mp_new_from_media(m); vlc.media_release(m);
  m_mp = mp; m_frames = 0; m_state = 0; m_last = QVideoFrame();
  m_spu = -1; m_spuDelay = 0; m_spuApplied = false; m_sar = 0;
  if (!m_error.isEmpty()) { m_error.clear(); emit errorChanged(); }
  vlc.video_set_callbacks(mp, onLock, onUnlock, onDisplay, this);
  vlc.video_set_format_callbacks(mp, onFormat, onCleanup);
  vlc.audio_set_volume(mp, m_volume);
  vlc.mp_set_equalizer(mp, eq);                    // NULL is "off"
  applyFx(mp);
  if (coreOk()) { vlc_value_t f{}; f.b_bool = m_fastSeek; setVar(mp, "input-fast-seek", VAR_BOOL, f); }   // the input inherits it
  const bool dvd = src.startsWith("dvd:", Qt::CaseInsensitive);
  if (dvd != m_dvd) m_dvd = dvd;
  if (m_title != -1) { m_title = -1; emit titleChanged(); }
  if (m_recording) { m_recording = false; emit recordingChanged(); }
  vlc.mp_play(mp);
  if (audioDelayUs) vlc.audio_set_delay(mp, audioDelayUs);   // the input exists once play() returns
  vlc.audio_set_mute(mp, m_muted);
  if (m_rate != 1) vlc.mp_set_rate(mp, float(m_rate));
  m_loading = true; m_time = startMs; emit stateChanged(); emit timeChanged();
}
void VlcPlayer::play() {
  if (!m_mp) return;
  if (m_state == 6) { vlc.mp_stop(MP(m_mp)); vlc.mp_play(MP(m_mp)); return; }   // ended: from the start
  vlc.mp_set_pause(MP(m_mp), 0);
}
void VlcPlayer::pause() { if (m_mp) vlc.mp_set_pause(MP(m_mp), 1); }
void VlcPlayer::seek(qint64 ms) {
  if (!m_mp) return;
  ms = qMax<qint64>(0, m_length > 0 ? qMin(ms, m_length - 300) : ms);
  if (m_state == 6) { vlc.mp_stop(MP(m_mp)); vlc.mp_play(MP(m_mp)); m_state = 0; }
  vlc.mp_set_time(MP(m_mp), ms);
  m_time = ms; emit timeChanged();
}
void VlcPlayer::setVolume(int v) { v = qBound(0, v, 200); if (v == m_volume) return; m_volume = v; if (m_mp) vlc.audio_set_volume(MP(m_mp), m_volume); emit volumeChanged(); }
void VlcPlayer::setMuted(bool m) { if (m == m_muted) return; m_muted = m; if (m_mp) vlc.audio_set_mute(MP(m_mp), m); emit volumeChanged(); }
void VlcPlayer::setRate(double r) { r = qBound(0.25, r, 4.0); if (qFuzzyCompare(r, m_rate)) return; m_rate = r; if (m_mp) vlc.mp_set_rate(MP(m_mp), float(r)); emit rateChanged(); }
void VlcPlayer::nextFrame() { if (m_mp) vlc.mp_next_frame(MP(m_mp)); }
QVariantList VlcPlayer::audioTracks() const {
  QVariantList out;
  if (!m_mp) return out;
  track_desc *list = vlc.audio_get_track_description(MP(m_mp));
  for (track_desc *t = list; t; t = t->next) out << QVariantMap{ { "id", t->id }, { "name", QString::fromUtf8(t->name ? t->name : "") } };
  if (list) vlc.track_description_list_release(list);
  return out;
}
int VlcPlayer::audioTrack() const { return m_mp ? vlc.audio_get_track(MP(m_mp)) : -1; }
void VlcPlayer::setAudioTrack(int id) { if (m_mp) vlc.audio_set_track(MP(m_mp), id); }
QVariantList VlcPlayer::spuTracks() const {
  QVariantList out;
  if (!m_mp) return out;
  track_desc *list = vlc.video_get_spu_description(MP(m_mp));
  for (track_desc *t = list; t; t = t->next) if (t->id >= 0) out << QVariantMap{ { "id", t->id }, { "name", QString::fromUtf8(t->name ? t->name : "") } };
  if (list) vlc.track_description_list_release(list);
  return out;
}
void VlcPlayer::setSpu(int id) { m_spu = id; if (m_mp && m_spuApplied) { vlc.video_set_spu(MP(m_mp), id); vlc.video_set_spu_delay(MP(m_mp), m_spuDelay); } }
void VlcPlayer::setSpuDelay(double s) { const qint64 us = qRound64(s * 1e6); if (us == m_spuDelay) return; m_spuDelay = us; if (m_mp && m_spuApplied && m_spu >= 0) vlc.video_set_spu_delay(MP(m_mp), us); }
bool VlcPlayer::snapshot(const QString &file) const {
  if (!m_last.isValid()) return false;
  QImage img = QVideoFrame(m_last).toImage();
  const QRect vp = m_last.surfaceFormat().viewport();
  if (vp.isValid() && vp != img.rect()) img = img.copy(vp);
  return !img.isNull() && img.save(file);
}
void VlcPlayer::stop() {
  if (!m_mp) return;
  if (m_recording) record(false);
  auto *mp = MP(m_mp); m_mp = nullptr;
  vlc.mp_stop(mp); vlc.mp_release(mp);
  m_playing = m_loading = false; m_state = 0; m_time = m_length = 0; m_last = QVideoFrame();
  if (m_videoSize.isValid()) { m_videoSize = m_frameSize = QSize(); emit videoSizeChanged(); }
  emit stateChanged(); emit timeChanged(); emit lengthChanged();
}

void VlcPlayer::poll() {
  if (!m_mp) return;
  auto *mp = MP(m_mp);
  const int st = vlc.mp_get_state(mp);
  const qint64 t = vlc.mp_get_time(mp), l = vlc.mp_get_length(mp);
  const bool p = st == 3, ld = st == 1 || st == 2;
  if (t >= 0 && t != m_time && st != 6) { m_time = t; emit timeChanged(); }
  if (l != m_length) { m_length = l; emit lengthChanged(); }
  if (p != m_playing || ld != m_loading) { m_playing = p; m_loading = ld; emit stateChanged(); }
  // once playing, libVLC's own subtitle choice is replaced by ours (off, or the image subtitle that was chosen)
  if (st == 3 && !m_spuApplied) { m_spuApplied = true; if (!m_keepSpu) { vlc.video_set_spu(mp, m_spu); vlc.video_set_spu_delay(mp, m_spuDelay); } }
  if (m_dvd) { const int t = vlc.get_title(mp); if (t != m_title) { m_title = t; emit titleChanged(); } }
  if (st != m_state) {
    m_state = st;
    if (st == 6) { m_time = m_length; emit timeChanged(); emit ended(); }
    if (st == 7) { m_error = tr("Cannot play this file"); emit errorChanged(); emit failed(); }
  }
  // the picture's visible size (decoders add padding rows): the frames show only that part
  unsigned vw = 0, vh = 0;
  if (vlc.video_get_size(mp, 0, &vw, &vh) == 0 && vw && vh) {
    // DVD and broadcast video have non-square pixels (720×576 shown as 4:3 or 16:9): read the track's pixel aspect
    if (m_sar == 0) {
      m_sar = 1;
      if (libvlc_media_t *m = vlc.mp_get_media(mp)) {
        media_track **t = nullptr; const unsigned n = vlc.media_tracks_get(m, &t);
        for (unsigned i = 0; i < n; i++) if (t[i]->type == 1 && t[i]->detail) {   // libvlc_track_video
          const auto *v = static_cast<video_track *>(t[i]->detail);
          if (v->sar_num && v->sar_den && v->width == vw) { m_sar = double(v->sar_num) / v->sar_den; break; }
        }
        if (t) vlc.media_tracks_release(t, n);
        vlc.media_release(m);   // get_media added a reference
      }
    }
    const QSize shown(qRound(vw * m_sar), int(vh));
    if (m_videoSize != shown || m_frameSize != QSize(int(vw), int(vh))) { m_videoSize = shown; m_frameSize = QSize(int(vw), int(vh)); emit videoSizeChanged(); }
    std::lock_guard<std::mutex> g(m_lock);
    if (m_format.isValid() && m_format.viewport().size() != QSize(int(vw), int(vh))) m_format.setViewport(QRect(0, 0, int(vw), int(vh)));
  }
}
// ---- audio effects ----
// the media player's child object of this type ("audio output", "video output", "input"), held; NULL if none yet
void *VlcPlayer::holdChild(const char *want) const {
  if (!m_mp || !coreOk()) return nullptr;
  vlc_list_t *l = core.list_children(m_mp); void *a = nullptr;
  if (!l) return nullptr;
  for (int i = 0; i < l->i_count; i++) {
    void *o = l->p_values[i].p_address;
    const char *type = *(const char **)o;                          // vlc_object_t starts with its type name
    if (!a && type && !strcmp(type, want)) { core.obj_hold(o); a = o; }
    core.obj_release(o);
  }
  core.free_(l->p_values); core.free_(l);
  return a;
}
// the filter list and the filters' settings on o (the media player before playback, or its audio output while
// playing, which then rebuilds its filters right away)
void VlcPlayer::applyFx(void *o) const {
  if (!o || !coreOk()) return;
  for (const auto &p : fxParams) {
    vlc_value_t v{};
    if (p.second.first == VAR_FLOAT) v.f_float = float(p.second.second);
    else if (p.second.first == VAR_BOOL) v.b_bool = p.second.second != 0;
    else v.i_int = int64_t(p.second.second);
    setVar(o, p.first.constData(), p.second.first, v);
  }
  QByteArray f = QByteArray(eq ? "equalizer" : "") + (eq && !fxFilters.isEmpty() ? ":" : "") + fxFilters;
  vlc_value_t v{}; v.psz_string = f.data(); setVar(o, "audio-filter", VAR_STRING, v);
}
void VlcPlayer::setEqualizer(const QVariant &bands) {
  if (!load()) return;
  const QVariantList b = bands.toList();
  if (b.isEmpty()) { if (eq) { vlc.eq_release(eq); eq = nullptr; } }
  else {
    if (!eq) eq = vlc.eq_new();
    for (int i = 0; i < 11 && i < b.size(); i++) { const float d = b[i].toFloat(); if (i == 0) vlc.eq_set_preamp(eq, d); else vlc.eq_set_amp(eq, d, unsigned(i - 1)); }
  }
  if (m_mp) {   // set_equalizer resets the filter list
    vlc.mp_set_equalizer(MP(m_mp), eq); applyFx(m_mp);
    if (void *a = holdChild("audio output")) { applyFx(a); core.obj_release(a); }
  }
}
bool VlcPlayer::setAudioFx(const QString &filters, const QVariantList &params) {
  if (!load()) return false;
  fxFilters = filters.toUtf8(); fxParams.clear();
  for (const QVariant &p : params) {
    const QVariantList x = p.toList(); if (x.size() < 3) continue;
    const QString t = x[1].toString();
    fxParams << qMakePair(x[0].toString().toUtf8(), qMakePair(t == "f" ? int(VAR_FLOAT) : t == "b" ? int(VAR_BOOL) : int(VAR_INTEGER), x[2].toDouble()));
  }
  if (m_mp) { applyFx(m_mp); if (void *a = holdChild("audio output")) { applyFx(a); core.obj_release(a); } }
  return coreOk();
}
// The stereo mode: VLC resets it to the audio output's first value (inherited from the libVLC instance) whenever a
// decoder starts, so it is set on the instance for the next files and on the running output to switch now
void VlcPlayer::applyStereo() const {
  if (!inst || !coreOk()) return;
  vlc_value_t m{}; m.i_int = stereoMode;
  setVar(*(void **)inst, "stereo-mode", VAR_INTEGER, m);           // libvlc_instance_t starts with its libvlc_int_t
  if (void *a = holdChild("audio output")) { setVar(a, "stereo-mode", VAR_INTEGER, m); core.obj_release(a); }
}
void VlcPlayer::setStereo(bool downmix) { stereoMode = downmix ? 1 : 0; applyStereo(); }
void VlcPlayer::setAudioDelay(double ms) { audioDelayUs = int64_t(ms * 1000); if (m_mp) vlc.audio_set_delay(MP(m_mp), audioDelayUs); }

// ---- DVD menus ----
QString VlcPlayer::logFile() const { std::lock_guard<std::mutex> g(logLock); return logPath; }
void VlcPlayer::setLogFile(const QString &f) { { std::lock_guard<std::mutex> g(logLock); logPath = f; logEverything = m_logAll; } emit logChanged(); }
void VlcPlayer::setLogAll(bool a) { m_logAll = a; { std::lock_guard<std::mutex> g(logLock); logEverything = a; } emit logChanged(); }
void VlcPlayer::navigate(int mode) { if (m_mp) vlc.navigate(MP(m_mp), unsigned(mode)); }
// the disc's menu, like VLC's Menu button (the title menu, else the root menu)
bool VlcPlayer::dvdMenu() {
  void *in = core.var_Trigger ? holdChild("input") : nullptr; if (!in) return false;
  const int r = core.var_Trigger(in, "menu-title"); core.obj_release(in);
  return r == 0;
}
QVariantList VlcPlayer::titles() const {
  QVariantList out;
  if (!m_mp) return out;
  title_desc **t = nullptr; const int n = vlc.get_titles(MP(m_mp), &t);
  for (int i = 0; i < n; i++)
    out << QVariantMap{ { "duration", double(t[i]->duration) }, { "name", QString::fromUtf8(t[i]->name ? t[i]->name : "") }, { "menu", bool(t[i]->flags & 1) }, { "interactive", bool(t[i]->flags & 2) } };
  if (n > 0) vlc.titles_release(t, unsigned(n));
  return out;
}
void VlcPlayer::setTitle(int i) { if (m_mp) vlc.set_title(MP(m_mp), i); }
// libVLC takes these from its own video window; here our window is it, so they are set the same way (on every video
// output: VLC can keep a spare one)
int VlcPlayer::dvdMouse(int x, int y, bool click) {
  if (!m_mp || !coreOk()) return 0;
  vlc_value_t c{}; c.c.x = x; c.c.y = y;
  vlc_list_t *l = core.list_children(m_mp); int n = 0;
  if (!l) return 0;
  for (int i = 0; i < l->i_count; i++) {
    void *o = l->p_values[i].p_address; const char *type = *(const char **)o;
    if (type && !strcmp(type, "video output")) { core.var_SetChecked(o, "mouse-moved", VAR_COORDS, c); if (click) core.var_SetChecked(o, "mouse-clicked", VAR_COORDS, c); n++; }
    core.obj_release(o);
  }
  core.free_(l->p_values); core.free_(l);
  return n;
}
// ---- recording ----
bool VlcPlayer::record(bool on, const QString &folder) {
  if (!m_mp || !coreOk()) return false;
  QByteArray dir = QDir::toNativeSeparators(folder).toUtf8();
  if (on && !dir.isEmpty()) { vlc_value_t d{}; d.psz_string = dir.data(); setVar(m_mp, "input-record-path", VAR_STRING, d); }
  void *in = holdChild("input"); if (!in) return false;
  vlc_value_t b{}; b.b_bool = on;
  const int r = core.var_SetChecked(in, "record", VAR_BOOL, b); core.obj_release(in);
  if (r == 0 && m_recording != on) { m_recording = on; emit recordingChanged(); }
  return r == 0;
}

void VlcPlayer::show(const QVideoFrame &fr) {
  m_last = fr;
  if (m_sink) m_sink->setVideoFrame(fr);
  if (m_extra) m_extra->setVideoFrame(fr);
}

// ---- video: libVLC writes I420 into the planes of a fresh QVideoFrame, which then goes to the sink ----
unsigned VlcPlayer::onFormat(void **opaque, char *chroma, unsigned *w, unsigned *h, unsigned *pitches, unsigned *lines) {
  auto *self = static_cast<VlcPlayer *>(*opaque);
  const unsigned W = (*w + 1) & ~1u, H = (*h + 1) & ~1u;
  std::memcpy(chroma, "I420", 4); *w = W; *h = H;
  QVideoFrameFormat f(QSize(int(W), int(H)), QVideoFrameFormat::Format_YUV420P);
  f.setColorSpace(H > 576 ? QVideoFrameFormat::ColorSpace_BT709 : QVideoFrameFormat::ColorSpace_BT601);
  f.setColorRange(QVideoFrameFormat::ColorRange_Video);
  QVideoFrame probe(f);                                   // Qt decides the line sizes: libVLC writes with the same
  if (!probe.map(QVideoFrame::WriteOnly)) return 0;
  for (int i = 0; i < 3; i++) pitches[i] = unsigned(probe.bytesPerLine(i));
  probe.unmap();
  lines[0] = H; lines[1] = lines[2] = H / 2;
  std::lock_guard<std::mutex> g(self->m_lock);
  self->m_format = f;
  for (auto &fr : self->m_slots) fr = QVideoFrame(f);
  return 1;
}
void VlcPlayer::onCleanup(void *) {}
void *VlcPlayer::onLock(void *opaque, void **planes) {
  auto *self = static_cast<VlcPlayer *>(opaque);
  std::lock_guard<std::mutex> g(self->m_lock);
  const int s = self->m_next; self->m_next = (s + 1) % SLOTS;
  QVideoFrame &fr = self->m_slots[s];
  if (fr.surfaceFormat().viewport() != self->m_format.viewport()) fr = QVideoFrame(self->m_format);   // visible size became known
  fr.map(QVideoFrame::WriteOnly);
  for (int i = 0; i < 3; i++) planes[i] = fr.bits(i);
  return reinterpret_cast<void *>(intptr_t(s));
}
void VlcPlayer::onUnlock(void *opaque, void *picture, void *const *) {
  auto *self = static_cast<VlcPlayer *>(opaque);
  std::lock_guard<std::mutex> g(self->m_lock);
  self->m_slots[intptr_t(picture)].unmap();
}
void VlcPlayer::onDisplay(void *opaque, void *picture) {
  auto *self = static_cast<VlcPlayer *>(opaque);
  QVideoFrame fr;
  { std::lock_guard<std::mutex> g(self->m_lock); fr = self->m_slots[intptr_t(picture)]; }
  self->m_frames++;
  QMetaObject::invokeMethod(self, [self, fr]() { if (self->m_mp) self->show(fr); }, Qt::QueuedConnection);
}

void VlcPlayer::log(const QString &line) {
  QFile f(qEnvironmentVariable("VLCR_LOG")); if (f.fileName().isEmpty() || !f.open(QIODevice::Append | QIODevice::Text)) return;
  f.write((line + QLatin1Char('\n')).toUtf8());
}
