#include "frames.h"
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDir>
#include <QFileInfo>
#include <QProcess>
#include <QStandardPaths>
#include <QUrl>
#include <memory>
#include <QDateTime>
#ifdef Q_OS_WIN
#include <windows.h>
#endif

static QString ffmpeg() {
  if (qEnvironmentVariableIsSet("VLCR_FFMPEG")) return qEnvironmentVariable("VLCR_FFMPEG");
#ifdef Q_OS_WIN
  const QString own = QCoreApplication::applicationDirPath() + "/ffmpeg.exe";
#elif defined(Q_OS_ANDROID)
  const QString own = QCoreApplication::applicationDirPath() + "/libffmpeg.so";   // (lib/<abi>/ of the APK: unpacked as a program)
#else
  const QString own = QCoreApplication::applicationDirPath() + "/ffmpeg";
#endif
  return QFileInfo::exists(own) ? own : QStringLiteral("ffmpeg");
}

Frames::Frames(QObject *parent) : QObject(parent) {
  m_exact.setMaxThreadCount(1);
  m_notify.setSingleShot(true); m_notify.setInterval(200);
  connect(&m_notify, &QTimer::timeout, this, &Frames::boardChanged);
}
Frames::~Frames() { m_job++; m_want++; m_pool.clear(); m_exact.clear(); m_pool.waitForDone(5000); m_exact.waitForDone(5000); }

QString Frames::cacheFile(const QString &src, double at, int w) const {
  QString key = src; const QFileInfo fi(src);
  if (fi.exists()) key += QString::number(fi.lastModified().toMSecsSinceEpoch());
  const QString dir = qEnvironmentVariable("VLCR_USER_DATA", QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)) + "/frames/" +
                      QCryptographicHash::hash(key.toUtf8(), QCryptographicHash::Md5).toHex();
  QDir().mkpath(dir);
  return dir + QString("/%1-%2.jpg").arg(qRound64(at * 1000)).arg(w);
}
// one JPEG frame at a moment (-ss before -i: jumps to the keyframe before it, fast), at below-normal priority so
// playback keeps every frame
bool Frames::grab(const QString &src, double at, int w, const QString &file) {
  if (QFileInfo(file).size() > 0) return true;
  QProcess p;
#ifdef Q_OS_WIN
  p.setCreateProcessArgumentsModifier([](QProcess::CreateProcessArguments *a) { a->flags |= BELOW_NORMAL_PRIORITY_CLASS; });
#endif
  p.setStandardOutputFile(file);
  p.start(ffmpeg(), { "-hide_banner", "-loglevel", "error", "-nostdin", "-ss", QString::number(at, 'f', 2), "-i", src, "-frames:v", "1",
                      "-vf", QString("scale='min(%1,iw)':-2").arg(w), "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "5", "pipe:1" });
  if (!p.waitForStarted(5000)) return false;
  if (!p.waitForFinished(20000)) { p.kill(); p.waitForFinished(1000); }
  if (QFileInfo(file).size() > 0) return true;
  QFile::remove(file);
  return false;
}

void Frames::clear() { m_job++; m_pool.clear(); m_board.clear(); m_step = 0; m_src.clear(); emit boardChanged(); }

void Frames::storyboard(const QString &src, double d, bool big) {
  const int job = ++m_job;
  m_pool.clear();
  m_src = src; m_board.clear(); m_step = 0;
  if (d <= 0) { emit boardChanged(); return; }
  const int n = qBound(24, qRound(d / 3), 160);
  m_step = d / n;
  for (int i = 0; i < n; i++) m_board << QString();
  emit boardChanged();
  QList<int> order; QVector<bool> seen(n);                 // coarse-to-fine
  for (int gap = 64; gap >= 1; gap >>= 1) for (int i = 0; i < n; i += gap) if (!seen[i]) { seen[i] = true; order << i; }
  auto next = std::make_shared<std::atomic<int>>(0);
  const double step = m_step;
  m_pool.setMaxThreadCount(big ? 1 : 3);
  // like v2.x: start after a moment, so the opening of the file comes first
  QTimer::singleShot(1200, this, [=]() {
    if (m_job != job) return;
    for (int k = 0; k < m_pool.maxThreadCount(); k++) m_pool.start([=]() {
      for (int j; m_job == job && (j = (*next)++) < order.size();) {
        const int i = order[j]; const double at = qMin(d - 0.3, (i + 0.5) * step);
        const QString file = cacheFile(src, at, 240);
        if (!grab(src, at, 240, file) || m_job != job) continue;
        QMetaObject::invokeMethod(this, [=]() { if (m_job != job || i >= m_board.size()) return; m_board[i] = QUrl::fromLocalFile(file).toString(); if (!m_notify.isActive()) m_notify.start(); }, Qt::QueuedConnection);
      }
    });
  });
}

QString Frames::nearest(double at) const {
  const int n = m_board.size(); if (!n || m_step <= 0) return {};
  const int i0 = qBound(0, int(at / m_step), n - 1);
  for (int r = 0; r < n; r++) {
    if (i0 - r >= 0 && !m_board[i0 - r].toString().isEmpty()) return m_board[i0 - r].toString();
    if (i0 + r < n && !m_board[i0 + r].toString().isEmpty()) return m_board[i0 + r].toString();
  }
  return {};
}

void Frames::frame(const QString &src, double at) {
  const int want = ++m_want;
  m_exact.clear();                                        // only the newest request matters
  m_exact.start([=]() {
    if (m_want != want) return;
    const QString file = cacheFile(src, at, 320);
    if (!grab(src, at, 320, file)) return;
    const QString url = QUrl::fromLocalFile(file).toString();
    QMetaObject::invokeMethod(this, [=]() { emit frameReady(src, at, url); }, Qt::QueuedConnection);
  });
}
