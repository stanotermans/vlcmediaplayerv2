// VlcPlayer: libVLC 3 behind a QML-friendly object. libVLC decodes straight into the memory of Qt video frames
// (no extra copy), which go to a QVideoSink (QML: VideoOutput.videoSink) and, while the mini player or the
// picture-in-picture window is open, to a second one; sound goes from libVLC to the sound card.
#pragma once
#include <QObject>
#include <QPointer>
#include <QTimer>
#include <QElapsedTimer>
#include <QVariantList>
#include <QVideoFrame>
#include <QVideoSink>
#include <QtQml/qqmlregistration.h>
#include <atomic>
#include <mutex>

class VlcPlayer : public QObject {
  Q_OBJECT
  QML_ELEMENT
  Q_PROPERTY(QVideoSink *videoSink READ videoSink WRITE setVideoSink NOTIFY videoSinkChanged)
  Q_PROPERTY(QVideoSink *extraSink READ extraSink WRITE setExtraSink NOTIFY videoSinkChanged)
  Q_PROPERTY(qint64 time READ time NOTIFY timeChanged)
  Q_PROPERTY(qint64 length READ length NOTIFY lengthChanged)
  Q_PROPERTY(bool playing READ playing NOTIFY stateChanged)
  Q_PROPERTY(bool loading READ loading NOTIFY stateChanged)         // opening or buffering (the spinner)
  Q_PROPERTY(bool active READ active NOTIFY stateChanged)           // something is open
  Q_PROPERTY(int volume READ volume WRITE setVolume NOTIFY volumeChanged)   // 0…200 (libVLC's volume, 100 = normal)
  Q_PROPERTY(bool muted READ muted WRITE setMuted NOTIFY volumeChanged)
  Q_PROPERTY(double rate READ rate WRITE setRate NOTIFY rateChanged)
  Q_PROPERTY(QSize videoSize READ videoSize NOTIFY videoSizeChanged) // the picture's size on screen (pixel aspect applied)
  Q_PROPERTY(bool keepSpu MEMBER m_keepSpu)
  Q_PROPERTY(QString version READ version NOTIFY versionChanged)
  Q_PROPERTY(QStringList startArgs MEMBER m_startArgs)
  // Settings → General → Save a log: libVLC's messages (errors only, or all) go to this file ("" = no log)
  Q_PROPERTY(QString logFile READ logFile WRITE setLogFile NOTIFY logChanged)
  Q_PROPERTY(bool logAll READ logAll WRITE setLogAll NOTIFY logChanged)              // more libVLC start options (passthrough), before the first file
  Q_PROPERTY(bool isDvd READ isDvd NOTIFY stateChanged)
  Q_PROPERTY(QSize frameSize READ frameSize NOTIFY videoSizeChanged)   // the picture in pixels (before the pixel aspect)
  Q_PROPERTY(int title READ title NOTIFY titleChanged)               // DVD: the title that plays (menus are titles too)
  Q_PROPERTY(bool recording READ recording NOTIFY recordingChanged)
  Q_PROPERTY(QString error READ error NOTIFY errorChanged)
  Q_PROPERTY(int framesShown READ framesShown NOTIFY timeChanged)
public:
  explicit VlcPlayer(QObject *parent = nullptr);
  ~VlcPlayer() override;
  QVideoSink *videoSink() const { return m_sink; }
  void setVideoSink(QVideoSink *s) { if (m_sink != s) { m_sink = s; if (s && m_last.isValid()) s->setVideoFrame(m_last); emit videoSinkChanged(); } }
  QVideoSink *extraSink() const { return m_extra; }
  void setExtraSink(QVideoSink *s) { if (m_extra != s) { m_extra = s; if (s && m_last.isValid()) s->setVideoFrame(m_last); emit videoSinkChanged(); } }
  qint64 time() const { return m_time; }
  qint64 length() const { return m_length; }
  bool playing() const { return m_playing; }
  bool loading() const { return m_loading; }
  bool active() const { return m_mp != nullptr; }
  int volume() const { return m_volume; }
  void setVolume(int v);
  bool muted() const { return m_muted; }
  void setMuted(bool m);
  double rate() const { return m_rate; }
  void setRate(double r);
  QSize videoSize() const { return m_videoSize; }
  QString version() const { return m_version; }
  bool isDvd() const { return m_dvd; }
  QString logFile() const;
  void setLogFile(const QString &f);
  bool logAll() const { return m_logAll; }
  void setLogAll(bool a);
  QSize frameSize() const { return m_frameSize; }
  int title() const { return m_title; }
  bool recording() const { return m_recording; }
  QString error() const { return m_error; }
  int framesShown() const { return m_frames.load(); }

  // a file, or a URL (http…, dvd://…); startMs: where to begin
  Q_INVOKABLE void open(const QString &src, qint64 startMs = 0, const QStringList &options = {});   // options: ":soundfont=…"
  Q_INVOKABLE void play();
  Q_INVOKABLE void pause();
  Q_INVOKABLE void togglePause() { m_playing ? pause() : play(); }
  Q_INVOKABLE void seek(qint64 ms);
  Q_INVOKABLE void stop();
  Q_INVOKABLE void nextFrame();
  Q_INVOKABLE QVariantList audioTracks() const;               // [{ id, name }] (id -1 = off)
  Q_INVOKABLE int audioTrack() const;
  Q_INVOKABLE void setAudioTrack(int id);
  Q_INVOKABLE bool snapshot(const QString &file) const;
  // libVLC's subtitle tracks (image subtitles: PGS, DVD, DVB). Off by default (text subtitles are drawn by the
  // interface); keepSpu leaves libVLC's choice alone (a DVD's menus).
  Q_INVOKABLE QVariantList spuTracks() const;                 // [{ id, name }] without "Disable"
  Q_INVOKABLE void setSpu(int id);                            // -1: off
  Q_INVOKABLE void setSpuDelay(double seconds);       // the picture on screen, as PNG or JPEG
  Q_INVOKABLE void log(const QString &line);                  // testing: appends a line to VLCR_LOG

  // audio: VLC's own 10-band equalizer ([preamp, 10 bands] in dB, or null: off), its audio filters (compressor,
  // spatializer, stereo widener; "" = none) with their settings [[name, "f"|"i"|"b", value]], surround → stereo,
  // the sound earlier/later than the picture, and "fast seek" (keyframes) from the next file on
  Q_INVOKABLE void setEqualizer(const QVariant &bands);
  Q_INVOKABLE bool setAudioFx(const QString &filters, const QVariantList &params);
  Q_INVOKABLE void setStereo(bool downmix);
  Q_INVOKABLE void setAudioDelay(double ms);
  Q_INVOKABLE void setFastSeek(bool on) { m_fastSeek = on; }
  // DVD menus (libdvdnav): navigate 0 OK, 1 up, 2 down, 3 left, 4 right; the disc's menu; titles; the mouse over a
  // menu in video pixels (moves the highlight; click presses it)
  Q_INVOKABLE void navigate(int mode);
  Q_INVOKABLE bool dvdMenu();
  Q_INVOKABLE QVariantList titles() const;                    // [{ duration, name, menu, interactive }]
  Q_INVOKABLE void setTitle(int i);
  Q_INVOKABLE int dvdMouse(int x, int y, bool click);
  // VLC's Record: the playing streams saved unchanged (with sound) into folder until record(false)
  Q_INVOKABLE bool record(bool on, const QString &folder = {});

signals:
  void videoSinkChanged();
  void timeChanged();
  void lengthChanged();
  void stateChanged();
  void volumeChanged();
  void rateChanged();
  void videoSizeChanged();
  void errorChanged();
  void ended();          // played to the end
  void failed();         // libVLC could not play it
  void versionChanged();
  void logChanged();
  void titleChanged();
  void recordingChanged();

public:
  // a stalled network stream can keep libVLC's stop busy for long: the app then ends without unloading libVLC
  static bool stopsPending();

private:
  static void release(void *mp, int waitMs);   // stop and release on a worker thread, waiting at most waitMs
  // libVLC video callbacks (on libVLC's video thread)
  static unsigned onFormat(void **opaque, char *chroma, unsigned *w, unsigned *h, unsigned *pitches, unsigned *lines);
  static void onCleanup(void *opaque);
  static void *onLock(void *opaque, void **planes);
  static void onUnlock(void *opaque, void *picture, void *const *planes);
  static void onDisplay(void *opaque, void *picture);
  void poll();
  bool load();
  void show(const QVideoFrame &fr);

  QPointer<QVideoSink> m_sink, m_extra;
  QVideoFrame m_last;
  QTimer m_timer;
  qint64 m_time = 0, m_length = 0;
  bool m_playing = false, m_loading = false, m_muted = false;
  int m_volume = 80, m_state = 0;
  double m_rate = 1;
  QStringList m_startArgs;
  bool m_logAll = false;
  bool m_dvd = false, m_recording = false, m_fastSeek = false;
  // #66: playing through FFmpeg (the time counts from where FFmpeg started)
  bool m_tc = false, m_pauseWhenPlaying = false;
  qint64 m_tcOffset = 0, m_tcLength = 0, m_tcPlayed = 0;
  QElapsedTimer m_tcClock;
  QString m_src;
  QStringList m_opts;
  int m_title = -1;
  void *holdChild(const char *type) const;
  void applyFx(void *o) const;
  void applyStereo() const;
  double m_sar = 0;                       // pixel aspect ratio of the video track (0: not read yet)
  int m_spu = -1;
  qint64 m_spuDelay = 0;
  bool m_keepSpu = false, m_spuApplied = false;
  QSize m_videoSize, m_frameSize;
  QString m_version, m_error;
  std::atomic<int> m_frames{0};
  // frames libVLC writes into: a fixed ring, reused (the sink only keeps the newest one or two, so a frame is written
  // again only long after it was shown); made again when the video format changes
  static constexpr int SLOTS = 6;
  std::mutex m_lock;
  QVideoFrameFormat m_format;
  QVideoFrame m_slots[SLOTS];
  int m_next = 0;
  void *m_mp = nullptr;
};
