#include "library.h"
#include <QCollator>
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMimeDatabase>
#include <QProcess>
#include <QRegularExpression>
#include <QRunnable>
#include <QSaveFile>
#include <QStandardPaths>
#include <QUrl>

// the same lists as v2.x (main.js MEDIA_EXT / NOT_MEDIA, app.js AUDIO_RE / SUB_RE / PLAYLIST_RE / DVD_RE)
static const QRegularExpression MEDIA_EXT(R"(\.(mp4|m4v|mkv|webm|mov|qt|avi|wmv|asf|flv|f4v|mpg|mpeg|m2v|m2p|ts|m2ts|mts|tod|mod|3gp|3g2|ogv|ogm|vob|divx|xvid|mxf|nut|rm|rmvb|dv|amv|y4m|ivf|evo|wtv|tgv|bik|bk2|smk|roq|vqa|thp|mve|xmv|iso|mp3|mp2|mpa|m4a|m4b|aac|flac|wav|w64|ogg|oga|opus|spx|wma|ac3|dts|mka|ape|aiff?|wv|tta|mpc|tak|shn|amr|au|snd|caf|dsf|dff|ra|voc|mid|midi|kar|rmi)$)", QRegularExpression::CaseInsensitiveOption);
static const QRegularExpression NOT_MEDIA(R"(\.d\.[cm]?ts$|[\\/]node_modules[\\/]|\.(spec|test|config|module|service|component|types?)\.ts$)", QRegularExpression::CaseInsensitiveOption);
static const QRegularExpression AUDIO_RE(R"(\.(mp3|mp2|mpa|m4a|m4b|aac|flac|wav|w64|ogg|oga|opus|spx|wma|ac3|dts|mka|ape|aiff?|wv|tta|mpc|tak|shn|amr|au|snd|caf|dsf|dff|ra|voc|mid|midi|kar|rmi|smf)$)", QRegularExpression::CaseInsensitiveOption);
static const QRegularExpression SUB_RE(R"(\.(srt|vtt|ass|ssa|sub|lrc)$)", QRegularExpression::CaseInsensitiveOption);
static const QRegularExpression PLAYLIST_RE(R"(\.(m3u8?|xspf|pls)$)", QRegularExpression::CaseInsensitiveOption);
static const QRegularExpression MIDI_RE(R"(\.(mid|midi|kar|rmi|smf)$)", QRegularExpression::CaseInsensitiveOption);
static const QRegularExpression URL_RE(R"(^[a-z][a-z0-9+.-]*://)", QRegularExpression::CaseInsensitiveOption);

static QString ffmpeg() {
  if (qEnvironmentVariableIsSet("VLCR_FFMPEG")) return qEnvironmentVariable("VLCR_FFMPEG");
#ifdef Q_OS_WIN
  const QString own = QCoreApplication::applicationDirPath() + "/ffmpeg.exe";
#else
  const QString own = QCoreApplication::applicationDirPath() + "/ffmpeg";
#endif
  return QFileInfo::exists(own) ? own : QStringLiteral("ffmpeg");
}
static bool isRemote(const QString &s) { return URL_RE.match(s).hasMatch(); }
static QString baseName(const QString &s) {
  QString b = s.section(QRegularExpression("[\\\\/]"), -1).section('?', 0, 0);
  if (isRemote(s)) b = QUrl::fromPercentEncoding(b.toUtf8());
  return b.isEmpty() ? s : b;
}

// "My DVD" for …/My DVD/VIDEO_TS/VIDEO_TS.IFO, the file name for everything else
QString Library::itemName(const QString &src) {
  static const QRegularExpression ifo(R"([\\/]VIDEO_TS[\\/]VIDEO_TS\.IFO$)", QRegularExpression::CaseInsensitiveOption);
  if (ifo.match(src).hasMatch()) { const QStringList p = src.split(QRegularExpression("[\\\\/]")); return p.size() >= 3 ? p[p.size() - 3] : QStringLiteral("DVD"); }
  return baseName(src);
}

// ---------- reading a file: `ffmpeg -i` (main.js probe) and a 320px JPEG (main.js thumbnail) ----------
class ProbeJob : public QRunnable {
public:
  ProbeJob(Library *lib, QString src, bool thumbs, QString thumbDir) : lib(lib), src(std::move(src)), thumbs(thumbs), thumbDir(std::move(thumbDir)) {}
  Library *lib; QString src; bool thumbs; QString thumbDir;
  static QByteArray run(const QStringList &args, int ms, QByteArray *err = nullptr) {
    QProcess p; p.start(ffmpeg(), args);
    if (!p.waitForStarted(5000)) return {};
    if (!p.waitForFinished(ms)) { p.kill(); p.waitForFinished(1000); }
    if (err) *err = p.readAllStandardError();
    return p.readAllStandardOutput();
  }
  static QVariantMap parse(const QString &txt) {
    static const QRegularExpression head(R"(Input #0, (.+?), from )");
    const auto h = head.match(txt);
    if (!h.hasMatch()) return {};
    QVariantMap info; info["format"] = h.captured(1);
    static const QRegularExpression dur(R"(Duration: (\d+):(\d+):([\d.]+))");
    const auto d = dur.match(txt);
    info["duration"] = d.hasMatch() ? d.captured(1).toInt() * 3600 + d.captured(2).toInt() * 60 + d.captured(3).toDouble() : 0.0;
    static const QRegularExpression stream(R"(^\s*Stream #(\d+):\d+(?:\[[^\]]*\])?(?:\(([^)]*)\))?: (Video|Audio|Subtitle|Data|Attachment): ([^\s,]+)(.*)$)");
    static const QRegularExpression tag(R"(^\s{4}(album|artist|album_artist)\s*:\s*(.+)$)", QRegularExpression::CaseInsensitiveOption);
    static const QRegularExpression title(R"(^\s+title\s*:\s*(.+)$)");
    static const QRegularExpression chap(R"(^\s*Chapter #\d+:\d+: start (-?[\d.]+), end (-?[\d.]+))");
    QVariantList audio, subs, chapters; QVariantMap tags; bool inStreams = false, cover = false; QVariantMap *cur = nullptr;
    QList<QVariantMap> streams;
    for (const QString &line : txt.split(QRegularExpression("\r?\n"))) {
      const auto t = tag.match(line);
      if (!inStreams && t.hasMatch() && !tags.contains(t.captured(1).toLower())) tags[t.captured(1).toLower()] = t.captured(2).trimmed();
      const auto m = stream.match(line);
      if (m.hasMatch()) {
        inStreams = true;
        if (m.captured(1) != "0") { cur = nullptr; continue; }
        const QString lang = m.captured(2) == "und" ? QString() : m.captured(2);
        streams.append({ { "type", m.captured(3).toLower() }, { "codec", m.captured(4).toLower() }, { "rest", m.captured(5) }, { "lang", lang }, { "title", QString() } });
        cur = &streams.last(); continue;
      }
      const auto c = chap.match(line);
      if (c.hasMatch()) { chapters.append(QVariantMap{ { "start", qMax(0.0, c.captured(1).toDouble()) }, { "end", c.captured(2).toDouble() }, { "title", QString() } }); cur = nullptr; continue; }
      if (QRegularExpression(R"(^\s*(Input|Output) #)").match(line).hasMatch()) { cur = nullptr; continue; }
      const auto ti = title.match(line);
      if (ti.hasMatch() && cur && cur->value("title").toString().isEmpty()) (*cur)["title"] = ti.captured(1).trimmed();
    }
    QVariantMap video;
    for (const QVariantMap &s : streams) {
      const QString type = s["type"].toString(), rest = s["rest"].toString();
      const bool pic = rest.contains("attached pic");
      if (type == "video" && pic) cover = true;
      if (type == "video" && !pic && video.isEmpty()) video = s;
      const QString label = !s["title"].toString().isEmpty() ? s["title"].toString() : s["lang"].toString();
      if (type == "audio") {
        static const QRegularExpression ch(R"(Hz, ([^,]+))");
        static const QHash<QString, int> CH = { { "mono", 1 }, { "stereo", 2 }, { "2.1", 3 }, { "3.0", 3 }, { "quad", 4 }, { "4.0", 4 }, { "4.1", 5 }, { "5.0", 5 }, { "5.1", 6 }, { "6.0", 6 }, { "6.1", 7 }, { "7.0", 7 }, { "7.1", 8 } };
        const auto cm = ch.match(rest); const QString k = cm.hasMatch() ? cm.captured(1).remove(QRegularExpression(R"(\(.*\))")).trimmed() : QString();
        audio.append(QVariantMap{ { "i", audio.size() }, { "codec", s["codec"] }, { "label", label.isEmpty() ? QString("Track %1").arg(audio.size() + 1) : label }, { "lang", s["lang"] }, { "ch", CH.value(k, k.toInt()) } });
      } else if (type == "subtitle")
        subs.append(QVariantMap{ { "i", subs.size() }, { "codec", s["codec"] }, { "label", label.isEmpty() ? QString("Subtitle %1").arg(subs.size() + 1) : label }, { "lang", s["lang"] } });
    }
    info["vcodec"] = video.isEmpty() ? QVariant() : video["codec"];
    static const QRegularExpression size(R"((\d{2,5})x(\d{2,5}))");
    const auto sz = size.match(video.value("rest").toString());
    info["width"] = sz.hasMatch() ? sz.captured(1).toInt() : 0; info["height"] = sz.hasMatch() ? sz.captured(2).toInt() : 0;
    info["audio"] = audio; info["subs"] = subs; info["cover"] = cover;
    info["album"] = tags.value("album"); info["artist"] = tags.contains("artist") ? tags["artist"] : tags.value("album_artist");
    if (chapters.size() > 1) info["chapters"] = chapters;
    return info;
  }
  void run() override {
    QVariantMap info;
    if (MIDI_RE.match(src).hasMatch()) info = { { "format", "midi" }, { "duration", 0.0 }, { "audio", QVariantList{ QVariantMap{ { "label", "MIDI" }, { "codec", "midi" } } } } };
    else {
      QByteArray err;
      const QStringList net = isRemote(src) ? QStringList{ "-rw_timeout", "15000000" } : QStringList();
      run(QStringList{ "-hide_banner", "-nostdin" } + net + QStringList{ "-i", src }, isRemote(src) ? 20000 : 15000, &err);
      info = parse(QString::fromUtf8(err));
    }
    if (!info.isEmpty() && thumbs && (!info["vcodec"].isNull() || info["cover"].toBool())) {
      // cached per file and modification time, like v2.x
      QString key = src; const QFileInfo fi(src); if (fi.exists()) key += QString::number(fi.lastModified().toMSecsSinceEpoch());
      const QString file = thumbDir + "/" + QCryptographicHash::hash(key.toUtf8(), QCryptographicHash::Md5).toHex() + ".jpg";
      if (!QFileInfo::exists(file)) {
        // at <= 0: the cover art of a music file (seeking drops the attached picture)
        const double dur = info["duration"].toDouble(), at = info["vcodec"].isNull() ? 0 : qMin(dur * 0.2, 120.0);
        QStringList in = at > 0 ? QStringList{ "-ss", QString::number(at, 'f', 2), "-i", src } : QStringList{ "-i", src, "-map", "0:v:0" };
        const QByteArray jpg = run(QStringList{ "-hide_banner", "-loglevel", "error", "-nostdin" } + in +
          QStringList{ "-frames:v", "1", "-vf", "scale='min(320,iw)':-2", "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "5", "pipe:1" }, 20000);
        if (!jpg.isEmpty()) { QFile f(file); if (f.open(QIODevice::WriteOnly)) f.write(jpg); }
      }
      if (QFileInfo(file).size() > 0) info["thumb"] = QUrl::fromLocalFile(file).toString();
    }
    QMetaObject::invokeMethod(lib, [lib = lib, src = src, info]() { lib->probed(src, info); }, Qt::QueuedConnection);
  }
};

Library::Library(QObject *parent) : QObject(parent) {
  m_pool.setMaxThreadCount(2);                     // two files at a time, like v2.x
  m_notify.setSingleShot(true); m_notify.setInterval(250);
  connect(&m_notify, &QTimer::timeout, this, &Library::itemsChanged);
  m_saveTimer.setSingleShot(true); m_saveTimer.setInterval(400);
  connect(&m_saveTimer, &QTimer::timeout, this, &Library::save);
}
Library::~Library() { m_pool.clear(); m_pool.waitForDone(20000); if (m_saveTimer.isActive()) save(); }

QString Library::dataDir() const {
  const QString d = qEnvironmentVariable("VLCR_USER_DATA", QStandardPaths::writableLocation(QStandardPaths::AppDataLocation));
  QDir().mkpath(d); return d;
}
void Library::changed() { if (!m_notify.isActive()) m_notify.start(); if (!m_loading) m_saveTimer.start(); }

// ---------- persistence: library.json ----------
void Library::load() {
  QFile f(dataDir() + "/library.json");
  if (!f.open(QIODevice::ReadOnly)) {   // first start: v2.x's two example playlists
    m_playlists = { QVariantMap{ { "name", "Cool Songs" }, { "srcs", QStringList() }, { "cover", QString() } },
                    QVariantMap{ { "name", "Anime to Watch" }, { "srcs", QStringList() }, { "cover", QString() } } };
    emit playlistsChanged(); return;
  }
  const QJsonObject o = QJsonDocument::fromJson(f.readAll()).object();
  m_playlists = o["playlists"].toArray().toVariantList();
  m_recent = o["recent"].toVariant().toStringList();
  for (const auto &w : o["watched"].toArray()) m_watched[w.toString()] = true;
  m_positions = o["positions"].toObject().toVariantMap();
  m_bookmarks = o["bookmarks"].toObject().toVariantMap();
  m_loading = true;
  for (const auto &e : o["library"].toArray()) { const QJsonObject it = e.toObject(); bool n; addOne(it["src"].toString(), true, (qint64)it["added"].toDouble(), &n); }
  m_loading = false;
  emit playlistsChanged(); emit recentChanged(); emit watchedChanged(); emit positionsChanged(); emit bookmarksChanged(); changed();
}
void Library::save() {
  QJsonArray lib;
  if (m_remember) for (const QVariant &v : m_items) { const QVariantMap it = v.toMap(); if (it["manual"].toBool()) lib.append(QJsonObject{ { "src", it["src"].toString() }, { "added", it["added"].toDouble() } }); }
  QJsonObject o;
  o["library"] = lib;
  o["playlists"] = QJsonArray::fromVariantList(m_playlists);
  o["recent"] = m_remember ? QJsonArray::fromStringList(m_recent.mid(0, 50)) : QJsonArray();
  o["watched"] = m_remember ? QJsonArray::fromStringList(m_watched.keys()) : QJsonArray();
  o["positions"] = QJsonObject::fromVariantMap(m_positions);
  o["bookmarks"] = QJsonObject::fromVariantMap(m_bookmarks);
  QSaveFile f(dataDir() + "/library.json");
  if (f.open(QIODevice::WriteOnly)) { f.write(QJsonDocument(o).toJson(QJsonDocument::Compact)); f.commit(); }
}

// ---------- adding media ----------
QStringList Library::expand(const QStringList &paths, int depth) const {
  QStringList out;
  QCollator col; col.setNumericMode(true); col.setCaseSensitivity(Qt::CaseInsensitive);
  for (const QString &p : paths) {
    const QFileInfo fi(p);
    if (!fi.exists()) continue;
    if (fi.isDir()) {
      // a DVD folder: one item instead of loose VOB files
      const bool isTs = fi.fileName().compare("VIDEO_TS", Qt::CaseInsensitive) == 0;
      for (const QString &n : { QStringLiteral("VIDEO_TS.IFO"), QStringLiteral("video_ts.ifo") }) {
        const QString ifo = isTs ? QDir(p).filePath(n) : QDir(p).filePath("VIDEO_TS/" + n);
        if (QFileInfo::exists(ifo)) { out << QDir::toNativeSeparators(ifo); goto next; }
      }
      if (depth < 6) {
        QStringList entries = QDir(p).entryList(QDir::AllEntries | QDir::NoDotAndDotDot | QDir::Hidden);
        std::sort(entries.begin(), entries.end(), [&](const QString &a, const QString &b) { return col.compare(a, b) < 0; });
        for (QString &e : entries) e = QDir::toNativeSeparators(QDir(p).filePath(e));
        out << expand(entries, depth + 1);
      }
    } else if (fi.isFile() && !NOT_MEDIA.match(p).hasMatch() && (MEDIA_EXT.match(p).hasMatch() || depth == 0)) out << QDir::toNativeSeparators(fi.absoluteFilePath());   // depth 0 = opened/dropped by you
    next:;
  }
  return out;
}

// .m3u/.m3u8 (one entry per line), .pls (FileN=…) and .xspf (<location>…</location>); relative entries against the
// playlist's folder, missing local files skipped. A .m3u8 with #EXT-X-… tags is an HLS stream: { hls: true }.
QVariantMap Library::readPlaylist(const QString &file) const {
  QFile f(file);
  if (f.size() > (5 << 20) || !f.open(QIODevice::ReadOnly)) return {};
  QString text = QString::fromUtf8(f.readAll()); if (text.startsWith(QChar(0xFEFF))) text.remove(0, 1);
  const QFileInfo fi(file); const QString ext = fi.suffix().toLower();
  if (ext.startsWith("m3u") && QRegularExpression("#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)").match(text).hasMatch()) return { { "hls", true } };
  auto xml = [](QString s) { return s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&"); };
  QStringList entries; QString name;
  if (ext == "xspf") {
    const auto t = QRegularExpression(R"(<playlist[\s\S]*?<title>([\s\S]*?)</title>[\s\S]*?<trackList)", QRegularExpression::CaseInsensitiveOption).match(text);
    if (t.hasMatch()) name = xml(t.captured(1)).trimmed();
    auto it = QRegularExpression(R"(<location>([\s\S]*?)</location>)", QRegularExpression::CaseInsensitiveOption).globalMatch(text);
    while (it.hasNext()) entries << xml(it.next().captured(1)).trimmed();
  } else if (ext == "pls") {
    auto it = QRegularExpression(R"(^\s*File\d+\s*=\s*(.+?)\s*$)", QRegularExpression::CaseInsensitiveOption | QRegularExpression::MultilineOption).globalMatch(text);
    while (it.hasNext()) entries << it.next().captured(1);
  } else {
    const auto pl = QRegularExpression(R"(^#PLAYLIST:\s*(.+)$)", QRegularExpression::MultilineOption).match(text);
    if (pl.hasMatch()) name = pl.captured(1).trimmed();
    for (const QString &l : text.split(QRegularExpression("\r?\n"))) if (!l.trimmed().isEmpty() && !l.trimmed().startsWith('#')) entries << l.trimmed();
  }
  QStringList srcs;
  for (const QString &e : entries) {
    QString p = e;
    if (p.startsWith("file:", Qt::CaseInsensitive)) p = QUrl(p).toLocalFile();
    else if (isRemote(p)) { if (!srcs.contains(p)) srcs << p; continue; }
    else p = QDir(fi.absolutePath()).absoluteFilePath(QString(p).replace('\\', '/'));
    if (QFileInfo::exists(p)) for (const QString &x : expand({ p })) if (MEDIA_EXT.match(x).hasMatch() && !srcs.contains(x)) srcs << x;
  }
  return { { "name", name.isEmpty() ? fi.completeBaseName() : name }, { "srcs", srcs } };
}

void Library::addOne(const QString &src, bool manual, qint64 added, bool *isNew) {
  *isNew = false;
  const int i = indexOf(src);
  if (i >= 0) {
    // opened yourself while it was found in a media folder: kept when the folder goes
    if (manual) { QVariantMap it = m_items[i].toMap(); if (!it["manual"].toBool()) {
      bool inFolder = false; for (const QString &f : m_folders) if (src.startsWith(QDir::toNativeSeparators(QDir::cleanPath(f)) + QDir::separator(), Qt::CaseInsensitive)) inFolder = true;
      if (!inFolder) { it["manual"] = true; m_items[i] = it; } } }
    return;
  }
  const bool remote = isRemote(src);
  m_items << QVariantMap{ { "src", src }, { "name", itemName(src) }, { "remote", remote }, { "type", AUDIO_RE.match(src).hasMatch() ? "audio" : "video" },
                          { "thumb", QString() }, { "duration", 0.0 }, { "added", (double)(added ? added : QDateTime::currentMSecsSinceEpoch()) }, { "manual", manual }, { "ready", false } };
  m_index[src] = m_items.size() - 1;
  *isNew = true;
  probe(src);
}

QStringList Library::addSources(const QStringList &given, bool manual, bool keepLists) {
  QStringList srcs, out;
  bool lists = false;
  for (QString s : given) {
    if (s.startsWith("file:", Qt::CaseInsensitive)) s = QUrl(s).toLocalFile();
    if (NOT_MEDIA.match(s).hasMatch()) continue;
    if (isRemote(s)) { srcs << s; continue; }
    if (PLAYLIST_RE.match(s).hasMatch() && QFileInfo(s).isFile()) {
      const QVariantMap pl = readPlaylist(s);
      if (pl.isEmpty()) { emit message(tr("Could not read playlist: %1").arg(baseName(s))); continue; }
      if (pl["hls"].toBool()) { srcs << QDir::toNativeSeparators(s); continue; }
      const QStringList entries = pl["srcs"].toStringList();
      if (entries.isEmpty()) { emit message(tr("No playable files in %1").arg(baseName(s))); continue; }
      if (keepLists) {
        bool have = false;
        for (const QVariant &p : m_playlists) if (p.toMap()["name"] == pl["name"] && p.toMap()["srcs"].toStringList() == entries) have = true;
        if (!have) { m_playlists << QVariantMap{ { "name", pl["name"] }, { "srcs", entries }, { "cover", QString() } }; lists = true;
                     emit message(tr("Playlist \"%1\" imported").arg(pl["name"].toString())); }
      }
      srcs << entries; continue;
    }
    srcs << expand({ s });
  }
  int fresh = 0;
  for (const QString &s : srcs) {
    if (SUB_RE.match(s).hasMatch()) continue;   // subtitles: phase 4
    bool n; addOne(s, manual, 0, &n); if (n) fresh++;
    if (!out.contains(s)) out << s;
  }
  if (lists) { emit playlistsChanged(); m_saveTimer.start(); }
  if (fresh || manual) changed();
  return out;
}

void Library::scanFolders(const QStringList &folders) {
  m_folders = folders;
  QSet<QString> found;
  for (const QString &f : folders) {
    const QStringList paths = expand({ QDir::toNativeSeparators(f) });
    for (const QString &p : paths) if (!SUB_RE.match(p).hasMatch()) { found.insert(p); bool n; addOne(p, false, 0, &n); }
  }
  // drop folder items whose folder was removed or whose file is gone
  QStringList gone;
  for (const QVariant &v : m_items) { const QVariantMap it = v.toMap(); const QString s = it["src"].toString();
    if (!it["manual"].toBool() && !it["remote"].toBool() && s != m_playing && !found.contains(s)) gone << s; }
  if (!gone.isEmpty()) remove(gone); else changed();
}

void Library::remove(const QStringList &srcs) {
  const QSet<QString> drop(srcs.begin(), srcs.end());
  QVariantList keep;
  for (const QVariant &v : m_items) if (!drop.contains(v.toMap()["src"].toString())) keep << v;
  m_items = keep; m_index.clear();
  for (int i = 0; i < m_items.size(); i++) m_index[m_items[i].toMap()["src"].toString()] = i;
  changed();
}

void Library::probe(const QString &src) {
  auto *job = new ProbeJob(this, src, m_thumbs, dataDir() + "/thumbs");
  QDir().mkpath(job->thumbDir);
  m_waiting[src] = job;
  m_busy++; emit busyChanged();
  m_pool.start(job);
}
// The file you want to play now skips the line (#36: a file opened from Explorer at startup would otherwise wait
// until the whole library has been read).
void Library::hurry(const QString &src) {
  ProbeJob *job = m_waiting.value(src);
  if (job && m_pool.tryTake(job)) m_pool.start(job, 10);
}
void Library::probed(const QString &src, const QVariantMap &info) {
  m_waiting.remove(src);
  m_busy--; emit busyChanged();
  const int i = indexOf(src);
  if (i < 0) return;
  QVariantMap it = m_items[i].toMap();
  if (info.isEmpty()) {
    // FFmpeg could not open it (not media, or an unsupported/encrypted format): out of the library again. Files you
    // opened yourself get a message; files found while scanning a folder disappear quietly.
    if (!it["remote"].toBool()) {
      if (it["manual"].toBool()) emit message(tr("Cannot play this file: %1").arg(it["name"].toString()));
      if (src != m_playing) { remove({ src }); return; }
    }
    it["ready"] = true; m_items[i] = it; changed(); return;
  }
  for (auto k = info.cbegin(); k != info.cend(); ++k) it[k.key()] = k.value();
  it["type"] = info["vcodec"].isNull() ? "audio" : "video";
  it["ready"] = true;
  m_items[i] = it;
  changed();
}

// ---------- watched, positions, recent ----------
void Library::setWatched(const QStringList &srcs, bool on) {
  for (const QString &s : srcs) { if (on) m_watched[s] = true; else m_watched.remove(s); }
  emit watchedChanged(); m_saveTimer.start();
}
void Library::setPosition(const QString &src, double secs) {
  if (secs > 0) m_positions[src] = secs; else m_positions.remove(src);
  emit positionsChanged(); m_saveTimer.start();
}
// sorted by time, rounded to milliseconds; an empty list removes the file's bookmarks
void Library::setBookmarks(const QString &src, const QVariantList &given) {
  QVariantList list;
  for (const QVariant &v : given) { const QVariantMap b = v.toMap(); const double t = b["t"].toDouble();
    if (t >= 0) list << QVariantMap{ { "t", qRound64(t * 1000) / 1000.0 }, { "name", b["name"].toString().trimmed() } }; }
  std::sort(list.begin(), list.end(), [](const QVariant &a, const QVariant &b) { return a.toMap()["t"].toDouble() < b.toMap()["t"].toDouble(); });
  if (list.isEmpty()) m_bookmarks.remove(src); else m_bookmarks[src] = list;
  emit bookmarksChanged(); m_saveTimer.start();
}
void Library::addRecent(const QString &src) {
  m_recent.removeAll(src); m_recent.prepend(src);
  while (m_recent.size() > 50) m_recent.removeLast();
  emit recentChanged(); m_saveTimer.start();
}

// ---------- playlists ----------
static QVariantMap pl(const QVariantList &l, int i) { return i >= 0 && i < l.size() ? l[i].toMap() : QVariantMap(); }
int Library::createPlaylist(const QString &name, const QStringList &srcs, const QString &cover) {
  QStringList unique; for (const QString &s : srcs) if (!unique.contains(s)) unique << s;
  m_playlists << QVariantMap{ { "name", name }, { "srcs", unique }, { "cover", cover } };
  if (!unique.isEmpty()) addSources(unique, true);
  emit playlistsChanged(); m_saveTimer.start();
  emit message(tr("Playlist \"%1\" created").arg(name));
  return m_playlists.size() - 1;
}
void Library::renamePlaylist(int i, const QString &name) { QVariantMap p = pl(m_playlists, i); if (p.isEmpty()) return; p["name"] = name; m_playlists[i] = p; emit playlistsChanged(); m_saveTimer.start(); }
void Library::setPlaylistCover(int i, const QString &cover) { QVariantMap p = pl(m_playlists, i); if (p.isEmpty()) return; p["cover"] = cover; m_playlists[i] = p; emit playlistsChanged(); m_saveTimer.start(); }
void Library::deletePlaylist(int i) { if (i < 0 || i >= m_playlists.size()) return; m_playlists.removeAt(i); emit playlistsChanged(); m_saveTimer.start(); }
void Library::addToPlaylist(int i, const QStringList &srcs) {
  QVariantMap p = pl(m_playlists, i); if (p.isEmpty()) return;
  QStringList l = p["srcs"].toStringList(); for (const QString &s : srcs) if (!l.contains(s)) l << s;
  p["srcs"] = l; m_playlists[i] = p; emit playlistsChanged(); m_saveTimer.start();
  emit message(tr("Added to %1").arg(p["name"].toString()));
}
void Library::removeFromPlaylist(int i, const QStringList &srcs) {
  QVariantMap p = pl(m_playlists, i); if (p.isEmpty()) return;
  QStringList l = p["srcs"].toStringList(); for (const QString &s : srcs) l.removeAll(s);
  p["srcs"] = l; m_playlists[i] = p; emit playlistsChanged(); m_saveTimer.start();
}
// your own playlists: change the order (#50); target "" = to the end
void Library::movePlaylistItem(int i, const QString &src, const QString &target, bool after) {
  QVariantMap p = pl(m_playlists, i); if (p.isEmpty() || src == target) return;
  QStringList l = p["srcs"].toStringList();
  if (!l.removeOne(src)) return;
  int to = target.isEmpty() ? l.size() : l.indexOf(target) + (after ? 1 : 0);
  if (to < 0 || to > l.size()) to = l.size();
  l.insert(to, src);
  p["srcs"] = l; m_playlists[i] = p; emit playlistsChanged(); m_saveTimer.start();
}
// .xspf or .m3u8 for other players (main.js exportPlaylist)
bool Library::exportPlaylist(const QString &name, const QStringList &srcs, const QString &file) {
  const QString path = toLocal(file);
  QString out;
  auto esc = [](QString s) { return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); };
  auto loc = [](const QString &s) { return isRemote(s) ? s : QUrl::fromLocalFile(s).toString(QUrl::FullyEncoded); };
  if (path.endsWith(".xspf", Qt::CaseInsensitive)) {
    out = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<playlist version=\"1\" xmlns=\"http://xspf.org/ns/0/\">\n  <title>" + esc(name) + "</title>\n  <trackList>\n";
    for (const QString &s : srcs) { const QVariantMap it = item(s);
      out += "    <track><location>" + esc(loc(s)) + "</location><title>" + esc(it.value("name", itemName(s)).toString()) + "</title>" +
             (it.value("duration").toDouble() > 0 ? "<duration>" + QString::number(qRound64(it["duration"].toDouble() * 1000)) + "</duration>" : QString()) + "</track>\n"; }
    out += "  </trackList>\n</playlist>\n";
  } else {
    out = "#EXTM3U\n#PLAYLIST:" + name + "\n";
    for (const QString &s : srcs) { const QVariantMap it = item(s);
      out += "#EXTINF:" + QString::number(it.value("duration").toDouble() > 0 ? qRound(it["duration"].toDouble()) : -1) + "," + it.value("name", itemName(s)).toString() + "\n" + s + "\n"; }
  }
  QSaveFile f(path);
  if (!f.open(QIODevice::WriteOnly)) return false;
  f.write(out.toUtf8());
  return f.commit();
}

// ---------- files ----------
QString Library::readImage(const QString &file) const {
  QFile f(toLocal(file));
  if (f.size() > (8 << 20) || !f.open(QIODevice::ReadOnly)) return {};
  return "data:" + QMimeDatabase().mimeTypeForFile(f.fileName()).name() + ";base64," + QString::fromLatin1(f.readAll().toBase64());
}
void Library::reveal(const QString &path) const {
#if defined(Q_OS_WIN)
  QProcess::startDetached("explorer.exe", { "/select,", QDir::toNativeSeparators(path) });
#elif defined(Q_OS_MACOS)
  QProcess::startDetached("open", { "-R", path });
#else
  QDesktopServices::openUrl(QUrl::fromLocalFile(QFileInfo(path).absolutePath()));
#endif
}
QString Library::videosDir() const { return QDir::toNativeSeparators(QStandardPaths::writableLocation(QStandardPaths::MoviesLocation)); }
void Library::clearRecent() { m_recent.clear(); emit recentChanged(); m_saveTimer.start(); }
void Library::clearPositions() { m_positions.clear(); m_watched.clear(); emit positionsChanged(); emit watchedChanged(); m_saveTimer.start(); }
void Library::clearThumbs() {
  QDir(dataDir() + "/thumbs").removeRecursively(); QDir(dataDir() + "/frames").removeRecursively();
  for (int i = 0; i < m_items.size(); i++) { QVariantMap it = m_items[i].toMap(); it["thumb"] = QString(); m_items[i] = it; }
  changed();
}
QString Library::picturesDir() const { return QStandardPaths::writableLocation(QStandardPaths::PicturesLocation); }
void Library::openPath(const QString &path) const { QDesktopServices::openUrl(QUrl::fromLocalFile(path)); }
QString Library::toLocal(const QVariant &url) const {
  const QString s = url.toString();
  if (s.startsWith("file:", Qt::CaseInsensitive)) return QDir::toNativeSeparators(QUrl(s).toLocalFile());
  return s;
}
