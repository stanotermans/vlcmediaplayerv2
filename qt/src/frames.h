// Frames for the timeline preview (app.js buildStoryboard / requestFrame): a storyboard of small frames across the
// whole file, made in the background (coarse to fine, so the timeline is covered quickly) so hovering is instant,
// and the exact frame under the pointer once it slows down. Both come from the slim FFmpeg as JPEG files in the
// cache and are handed to QML as file URLs.
#pragma once
#include <QHash>
#include <QObject>
#include <QThreadPool>
#include <QTimer>
#include <QVariantList>
#include <QtQml/qqmlregistration.h>
#include <atomic>

class Frames : public QObject {
  Q_OBJECT
  QML_ELEMENT
  Q_PROPERTY(QVariantList board READ board NOTIFY boardChanged)   // storyboard frame URLs ("" = not made yet)
  Q_PROPERTY(double step READ step NOTIFY boardChanged)           // seconds between storyboard frames
  Q_PROPERTY(QString src READ src NOTIFY boardChanged)
public:
  explicit Frames(QObject *parent = nullptr);
  ~Frames() override;
  QVariantList board() const { return m_board; }
  double step() const { return m_step; }
  QString src() const { return m_src; }
  // start a storyboard for a file (duration in seconds; big: above 1440p, one worker instead of three)
  Q_INVOKABLE void storyboard(const QString &src, double duration, bool big);
  Q_INVOKABLE void clear();
  Q_INVOKABLE QString nearest(double at) const;                  // the storyboard frame closest to a moment
  Q_INVOKABLE void frame(const QString &src, double at);         // → frameReady (the newest request wins)
signals:
  void boardChanged();
  void frameReady(const QString &src, double at, const QString &url);
private:
  QString cacheFile(const QString &src, double at, int w) const;
  static bool grab(const QString &src, double at, int w, const QString &file);
  QVariantList m_board;
  double m_step = 0;
  QString m_src;
  std::atomic<int> m_job{0}, m_want{0};
  QThreadPool m_pool, m_exact;
  QTimer m_notify;
};
