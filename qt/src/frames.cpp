#include "frames.h"
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDir>
#include <QFileInfo>
#include <QProcess>
#include <QStandardPaths>
#include <QUrl>
#include <memory>
#include <cmath>
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
Frames::~Frames() { m_job++; m_want++; m_waveJob++; m_pool.clear(); m_exact.clear(); m_wavePool.clear(); m_pool.waitForDone(5000); m_exact.waitForDone(5000); m_wavePool.waitForDone(5000); }

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
  p.start(ffmpeg(), { "-hide_banner", "-loglevel", "error", "-nostdin", "-ss", QString::number(at, 'f', 2), "-i", src, "-map", "0:V:0?", "-frames:v", "1",   // #94: not an attached cover
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

// ---- #114: the waveform of a song. FFmpeg decodes the first audio track to mono 16-bit samples at a low rate; the
// loudness (RMS) of WAVE_N equal parts of the file is kept as one byte each, in the cache next to the file's frames.
// An FFmpeg that cannot write raw samples gives nothing, and the timeline stays plain.
static const int WAVE_N = 600, WAVE_RATE = 4000;
void Frames::waveform(const QString &src, double d) {
  if (src == m_waveSrc) return;
  const int job = ++m_waveJob;
  m_wavePool.clear();
  m_waveSrc = src; m_wave.clear(); emit waveChanged();
  if (src.isEmpty() || d <= 0) return;
  const QString file = cacheFile(src, 0, WAVE_N).replace(QLatin1String(".jpg"), QLatin1String(".wave"));
  m_wavePool.setMaxThreadCount(2);    // (a song that was skipped stops at once and frees its place)
  m_wavePool.start([=]() {
    if (m_waveJob != job) return;
    QByteArray bars;
    { QFile c(file); if (c.open(QIODevice::ReadOnly)) bars = c.readAll(); }
    if (bars.size() != WAVE_N) {
      QProcess p;
#ifdef Q_OS_WIN
      p.setCreateProcessArgumentsModifier([](QProcess::CreateProcessArguments *a) { a->flags |= BELOW_NORMAL_PRIORITY_CLASS; });
#endif
      p.setProcessChannelMode(QProcess::SeparateChannels);
      p.start(ffmpeg(), { "-hide_banner", "-loglevel", "error", "-nostdin", "-i", src, "-map", "0:a:0", "-vn", "-sn", "-ac", "1",
                          "-ar", QString::number(WAVE_RATE), "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1" });
      if (!p.waitForStarted(5000)) return;
      const qint64 total = qMax<qint64>(1, qint64(d * WAVE_RATE));
      QVector<double> sum(WAVE_N, 0.0); QVector<qint64> count(WAVE_N, 0);
      qint64 n = 0; QByteArray buf;
      const qint64 t0 = QDateTime::currentMSecsSinceEpoch();
      while (p.state() != QProcess::NotRunning || p.bytesAvailable() > 0) {
        if (m_waveJob != job || QDateTime::currentMSecsSinceEpoch() - t0 > 180000) { p.kill(); p.waitForFinished(1000); return; }
        if (p.bytesAvailable() == 0) p.waitForReadyRead(200);
        buf += p.readAll();
        const qsizetype m = buf.size() / 2; const char *at = buf.constData();
        for (qsizetype i = 0; i < m; i++, n++) {
          const qint16 v = qint16(quint16(uchar(at[2 * i])) | quint16(uchar(at[2 * i + 1]) << 8));
          const int b = int(qMin<qint64>(WAVE_N - 1, n * WAVE_N / total));
          sum[b] += double(v) * v; count[b]++;
        }
        buf.remove(0, m * 2);
      }
      if (n < WAVE_RATE / 2) return;                       // no sound came out
      double top = 0; QVector<double> rms(WAVE_N, 0.0);
      for (int i = 0; i < WAVE_N; i++) { if (count[i]) rms[i] = std::sqrt(sum[i] / count[i]); top = qMax(top, rms[i]); }
      if (top <= 0) top = 1;
      bars.resize(WAVE_N);
      for (int i = 0; i < WAVE_N; i++) bars[i] = char(uchar(qRound(255 * std::pow(rms[i] / top, 0.7))));   // (quiet parts stay visible)
      QFile c(file); if (c.open(QIODevice::WriteOnly)) c.write(bars);
    }
    QVariantList l; l.reserve(WAVE_N);
    for (int i = 0; i < WAVE_N; i++) l << uchar(bars[i]) / 255.0;
    QMetaObject::invokeMethod(this, [=]() { if (m_waveJob != job) return; m_wave = l; emit waveChanged(); }, Qt::QueuedConnection);
  });
}
