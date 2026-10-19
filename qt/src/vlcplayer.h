// VlcPlayer: libVLC 3 behind a QML-friendly object. libVLC decodes straight into the memory of Qt video frames
// (no extra copy), which go to a QVideoSink (QML: VideoOutput.videoSink) and, while the mini player or the
// picture-in-picture window is open, to a second one; sound goes from libVLC to the sound card.
#pragma once
#include <QObject>
#include <QPointer>
#include <QTimer>
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
  Q_PROPERTY(QSize videoSize READ videoSize NOTIFY videoSizeChanged) // the picture's size (0×0: no video)
  Q_PROPERTY(QString version READ version CONSTANT)
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
  QString error() const { return m_error; }
  int framesShown() const { return m_frames.load(); }

  // a file, or a URL (http…, dvd://…); startMs: where to begin
  Q_INVOKABLE void open(const QString &src, qint64 startMs = 0);
  Q_INVOKABLE void play();
  Q_INVOKABLE void pause();
  Q_INVOKABLE void togglePause() { m_playing ? pause() : play(); }
  Q_INVOKABLE void seek(qint64 ms);
  Q_INVOKABLE void stop();
  Q_INVOKABLE void nextFrame();
  Q_INVOKABLE QVariantList audioTracks() const;               // [{ id, name }] (id -1 = off)
  Q_INVOKABLE int audioTrack() const;
  Q_INVOKABLE void setAudioTrack(int id);
  Q_INVOKABLE bool snapshot(const QString &file) const;       // the picture on screen, as PNG or JPEG
  Q_INVOKABLE void log(const QString &line);                  // testing: appends a line to VLCR_LOG

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

private:
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
  QSize m_videoSize;
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
