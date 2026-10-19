#include "library.h"
#include <QCryptographicHash>
#include <QDir>
#include <QFileInfo>
#include <QProcess>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QThread>
#include <QUrl>

static const QStringList MEDIA = { "*.mp4", "*.mkv", "*.avi", "*.mov", "*.webm", "*.wmv", "*.flv", "*.m4v", "*.mpg", "*.ts", "*.tgv" };
static QString ffmpeg() { return qEnvironmentVariable("VLCR_FFMPEG", "ffmpeg"); }

void Library::scan(const QString &folder) {
  m_folder = folder;
  const QFileInfoList files = QDir(folder).entryInfoList(MEDIA, QDir::Files, QDir::Name | QDir::IgnoreCase);
  m_items.clear();
  for (const QFileInfo &f : files) m_items << QVariantMap{ { "name", f.fileName() }, { "path", f.absoluteFilePath() }, { "thumb", "" }, { "duration", 0 } };
  emit itemsChanged();
  // thumbnails and durations in a worker thread, one by one
  const QString cache = QStandardPaths::writableLocation(QStandardPaths::CacheLocation) + "/thumbs";
  QDir().mkpath(cache);
  auto *t = QThread::create([this, files, cache]() {
    for (int i = 0; i < files.size(); i++) {
      const QString path = files[i].absoluteFilePath();
      const QString png = cache + "/" + QCryptographicHash::hash(path.toUtf8(), QCryptographicHash::Md5).toHex() + ".jpg";
      QProcess p; p.setStandardOutputFile(png);               // the slim FFmpeg writes JPEG to a pipe (like v2.x)
      p.start(ffmpeg(), { "-hide_banner", "-nostdin", "-ss", "3", "-i", path, "-frames:v", "1", "-vf", "scale=320:-2", "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "4", "pipe:1" });
      p.waitForFinished(15000);
      const QString log = QString::fromUtf8(p.readAllStandardError());
      const auto m = QRegularExpression("Duration: (\\d+):(\\d+):(\\d+)").match(log);
      const int secs = m.hasMatch() ? m.captured(1).toInt() * 3600 + m.captured(2).toInt() * 60 + m.captured(3).toInt() : 0;
      const QString thumb = QFileInfo(png).size() > 0 ? QUrl::fromLocalFile(png).toString() : QString();
      QMetaObject::invokeMethod(this, [this, i, thumb, secs, path]() {
        if (i >= m_items.size() || m_items[i].toMap()["path"] != path) return;
        QVariantMap it = m_items[i].toMap(); it["thumb"] = thumb; it["duration"] = secs; m_items[i] = it;
        emit itemsChanged();
      }, Qt::QueuedConnection);
    }
  });
  connect(t, &QThread::finished, t, &QObject::deleteLater);
  t->start();
}
