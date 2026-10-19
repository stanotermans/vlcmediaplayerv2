// VlcPlayer: libVLC 3 behind a QML-friendly object. libVLC decodes straight into the memory of Qt video frames
// (no extra copy), which go to a QVideoSink (QML: VideoOutput.videoSink); sound goes from libVLC to the sound card.
#pragma once
#include <QObject>
#include <QPointer>
#include <QTimer>
#include <QVideoFrame>
#include <QVideoSink>
#include <QtQml/qqmlregistration.h>
#include <atomic>
#include <mutex>

class VlcPlayer : public QObject {
  Q_OBJECT
  QML_ELEMENT
  Q_PROPERTY(QVideoSink *videoSink READ videoSink WRITE setVideoSink NOTIFY videoSinkChanged)
  Q_PROPERTY(qint64 time READ time NOTIFY timeChanged)
  Q_PROPERTY(qint64 length READ length NOTIFY lengthChanged)
  Q_PROPERTY(bool playing READ playing NOTIFY stateChanged)
  Q_PROPERTY(int volume READ volume WRITE setVolume NOTIFY volumeChanged)
  Q_PROPERTY(QString version READ version CONSTANT)
  Q_PROPERTY(QString error READ error NOTIFY errorChanged)
  Q_PROPERTY(int framesShown READ framesShown NOTIFY timeChanged)
public:
  explicit VlcPlayer(QObject *parent = nullptr);
  ~VlcPlayer() override;
  QVideoSink *videoSink() const { return m_sink; }
  void setVideoSink(QVideoSink *s) { if (m_sink != s) { m_sink = s; emit videoSinkChanged(); } }
  qint64 time() const { return m_time; }
  qint64 length() const { return m_length; }
  bool playing() const { return m_playing; }
  int volume() const { return m_volume; }
  void setVolume(int v);
  QString version() const { return m_version; }
  QString error() const { return m_error; }
  int framesShown() const { return m_frames.load(); }

  Q_INVOKABLE void open(const QString &path);
  Q_INVOKABLE void play();
  Q_INVOKABLE void pause();
  Q_INVOKABLE void togglePause() { m_playing ? pause() : play(); }
  Q_INVOKABLE void seek(qint64 ms);
  Q_INVOKABLE void stop();
  Q_INVOKABLE void log(const QString &line);   // testing: appends a line to VLCR_LOG

signals:
  void videoSinkChanged();
  void timeChanged();
  void lengthChanged();
  void stateChanged();
  void volumeChanged();
  void errorChanged();

private:
  // libVLC video callbacks (on libVLC's video thread)
  static unsigned onFormat(void **opaque, char *chroma, unsigned *w, unsigned *h, unsigned *pitches, unsigned *lines);
  static void onCleanup(void *opaque);
  static void *onLock(void *opaque, void **planes);
  static void onUnlock(void *opaque, void *picture, void *const *planes);
  static void onDisplay(void *opaque, void *picture);
  void poll();
  bool load();

  QPointer<QVideoSink> m_sink;
  QTimer m_timer;
  qint64 m_time = 0, m_length = 0;
  bool m_playing = false;
  int m_volume = 100;
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
