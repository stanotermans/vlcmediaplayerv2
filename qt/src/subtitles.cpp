#include "subtitles.h"
#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QFontDatabase>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocale>
#include <QNetworkReply>
#include <QProcess>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QUrlQuery>
#ifdef Q_OS_WIN
#include <windows.h>
#include <dpapi.h>
#endif

static const QRegularExpression SUB_EXT(R"(\.(srt|vtt|ass|ssa|sub|lrc)$)", QRegularExpression::CaseInsensitiveOption);
static const QRegularExpression URL_RE(R"(^[a-z][a-z0-9+.-]*://)", QRegularExpression::CaseInsensitiveOption);
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
static QString dataDir() {
  const QString d = qEnvironmentVariable("VLCR_USER_DATA", QStandardPaths::writableLocation(QStandardPaths::AppDataLocation));
  QDir().mkpath(d); return d;
}

// The session token is kept (never the password), encrypted for this Windows user with DPAPI when possible
static QByteArray protect(const QByteArray &b, bool encrypt) {
#ifdef Q_OS_WIN
  DATA_BLOB in{ DWORD(b.size()), (BYTE *)b.data() }, out{};
  const BOOL ok = encrypt ? CryptProtectData(&in, L"Vela Player", nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &out)
                          : CryptUnprotectData(&in, nullptr, nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &out);
  if (!ok) return {};
  QByteArray r((const char *)out.pbData, int(out.cbData)); LocalFree(out.pbData); return r;
#else
  Q_UNUSED(encrypt); return b;
#endif
}

Subs::Subs(QObject *parent) : QObject(parent) {
  m_pool.setMaxThreadCount(2);
  // the app's API key: written to keys.json next to the program by the release workflow (a GitHub secret, never
  // committed), or OPENSUBTITLES_API_KEY for development
  m_key = qEnvironmentVariable("OPENSUBTITLES_API_KEY").trimmed();
  if (m_key.isEmpty()) {
    QFile k(QCoreApplication::applicationDirPath() + "/keys.json");
    if (k.open(QIODevice::ReadOnly)) m_key = QJsonDocument::fromJson(k.readAll()).object()["opensubtitles"].toString().trimmed();
  }
  QFile f(dataDir() + "/opensubtitles.json");
  if (f.open(QIODevice::ReadOnly)) {
    const QJsonObject o = QJsonDocument::fromJson(f.readAll()).object();
    m_token = o.contains("enc") ? QString::fromUtf8(protect(QByteArray::fromBase64(o["enc"].toString().toLatin1()), false)) : o["token"].toString();
    m_user = m_token.isEmpty() ? QString() : o["user"].toObject()["name"].toString();
    if (o.contains("base")) m_base = o["base"].toString();
  }
}
Subs::~Subs() { m_pool.waitForDone(5000); }

QStringList Subs::siblings(const QString &src) const {
  QStringList out;
  if (URL_RE.match(src).hasMatch()) return out;
  const QFileInfo fi(src);
  const QString base = fi.completeBaseName().toLower();
  for (const QFileInfo &f : QDir(fi.absolutePath()).entryInfoList(QDir::Files, QDir::Name))
    if (SUB_EXT.match(f.fileName()).hasMatch() && f.fileName().toLower().startsWith(base)) out << QDir::toNativeSeparators(f.absoluteFilePath());
  return out;
}
QString Subs::readLyrics(const QString &file) const {
  QFile f(file);
  if (!file.endsWith(".lrc", Qt::CaseInsensitive) || f.size() > (1 << 20) || !f.open(QIODevice::ReadOnly)) return {};
  QString t = QString::fromUtf8(f.readAll()); if (t.startsWith(QChar(0xFEFF))) t.remove(0, 1);
  return t;
}
// Any text subtitle (srt/ass/vtt or a track inside the video) → WebVTT
void Subs::load(int req, const QString &src, int stream) {
  m_pool.start([=]() {
    QString text;
    if (stream < 0 && src.endsWith(".vtt", Qt::CaseInsensitive)) { QFile f(src); if (f.open(QIODevice::ReadOnly)) text = QString::fromUtf8(f.readAll()); }
    else {
      QStringList args{ "-hide_banner", "-loglevel", "error", "-nostdin" };
      if (src.startsWith("http", Qt::CaseInsensitive)) args << "-reconnect" << "1";
      args << "-i" << src;
      if (stream >= 0) args << "-map" << QString("0:s:%1").arg(stream);
      args << "-f" << "webvtt" << "pipe:1";
      QProcess p; p.start(ffmpeg(), args);
      if (p.waitForStarted(5000)) { if (!p.waitForFinished(60000)) p.kill(); text = QString::fromUtf8(p.readAllStandardOutput()); }
    }
    QMetaObject::invokeMethod(this, [=]() { emit loaded(req, text); }, Qt::QueuedConnection);
  });
}

// Subtitle languages as two-letter codes. Accepts codes, 3-letter codes (eng, dut/nld, ger/deu …) and language names
// in English or in the language itself.
QStringList Subs::langCodes(const QString &text) const {
  static const QStringList SUB_LANGS = { "en", "nl", "de", "fr", "es", "it", "pt", "pt-BR", "pt-PT", "ar", "bg", "ca", "cs", "da", "el", "et", "fa", "fi", "he", "hi", "hr",
    "hu", "id", "is", "ja", "ko", "lt", "lv", "ms", "no", "pl", "ro", "ru", "sk", "sl", "sr", "sv", "th", "tr", "uk", "vi", "zh-CN", "zh-TW" };
  static const QHash<QString, QString> ISO3 = { { "eng", "en" }, { "dut", "nl" }, { "nld", "nl" }, { "ger", "de" }, { "deu", "de" }, { "fre", "fr" }, { "fra", "fr" },
    { "spa", "es" }, { "ita", "it" }, { "por", "pt" }, { "ara", "ar" }, { "chi", "zh-CN" }, { "zho", "zh-CN" }, { "jpn", "ja" }, { "kor", "ko" }, { "rus", "ru" },
    { "pol", "pl" }, { "tur", "tr" }, { "swe", "sv" }, { "dan", "da" }, { "nor", "no" }, { "fin", "fi" }, { "gre", "el" }, { "ell", "el" }, { "heb", "he" },
    { "hin", "hi" }, { "cze", "cs" }, { "ces", "cs" }, { "hun", "hu" }, { "rum", "ro" }, { "ron", "ro" }, { "ukr", "uk" }, { "vie", "vi" }, { "tha", "th" },
    { "ind", "id" }, { "may", "ms" }, { "msa", "ms" }, { "bul", "bg" }, { "hrv", "hr" }, { "srp", "sr" }, { "slo", "sk" }, { "slk", "sk" } };
  static QHash<QString, QString> names;
  if (names.isEmpty()) {
    for (const QString &c : SUB_LANGS) {
      const QLocale l(QString(c).replace('-', '_'));
      const QString en = QLocale::languageToString(l.language()).toLower(), own = l.nativeLanguageName().toLower();
      if (!names.contains(en)) names[en] = c;
      if (!own.isEmpty() && !names.contains(own)) names[own] = c;
    }
    names.insert("dutch", "nl"); names.insert("flemish", "nl"); names.insert("vlaams", "nl"); names.insert("brazilian", "pt-BR");
    names.insert("brazilian portuguese", "pt-BR"); names.insert("chinese", "zh-CN"); names.insert("farsi", "fa"); names.insert("persian", "fa");
    names.insert("engels", "en"); names.insert("nederlands", "nl"); names.insert("duits", "de"); names.insert("frans", "fr"); names.insert("spaans", "es");
    names.insert("italiaans", "it"); names.insert("portugees", "pt"); names.insert("pools", "pl");
  }
  QStringList out;
  for (const QString &raw : text.split(QRegularExpression("[,;/]+"))) {
    const QString w = raw.trimmed().toLower(); if (w.isEmpty()) continue;
    QString code;
    if (QRegularExpression("^[a-z]{2}(-[a-z]{2})?$").match(w).hasMatch()) code = w.size() > 2 ? w.left(2) + "-" + w.mid(3).toUpper() : w;
    else code = ISO3.value(w, names.value(w));
    if (!code.isEmpty() && !out.contains(code)) out << code;
  }
  return out;
}
QString Subs::query(const QString &name) const {
  QString q = name;
  q.remove(QRegularExpression(R"(\.[a-z0-9]{2,4}$)", QRegularExpression::CaseInsensitiveOption));
  q.replace(QRegularExpression(R"([\[(][^\])]*[\])])"), " ").replace(QRegularExpression("[._]+"), " ");
  const auto cut = QRegularExpression(R"(\b(2160p|1080p|720p|480p|4k|uhd|web[ -]?dl|webrip|blu[ -]?ray|bdrip|brrip|hdtv|dvdrip|x26[45]|h ?26[45]|hevc|aac|ac3|ddp?5 ?1|proper|repack)\b)",
                                      QRegularExpression::CaseInsensitiveOption).match(q);
  if (cut.hasMatch() && cut.capturedStart() > 0) q = q.left(cut.capturedStart());
  return q.simplified();
}

// ---------- OpenSubtitles.com REST API ----------
void Subs::api(const QByteArray &method, const QString &route, const QVariantMap &body, Done done) {
  if (m_key.isEmpty()) { done(-1, {}, "nokey"); return; }
  QNetworkRequest r(QUrl(m_base + route));
  r.setRawHeader("Api-Key", m_key.toUtf8());
  r.setRawHeader("User-Agent", "Vela Player v" + QCoreApplication::applicationVersion().toUtf8());
  r.setRawHeader("Accept", "application/json");
  if (!m_token.isEmpty() && route != "/login") r.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
  QByteArray data;
  if (!body.isEmpty()) { r.setHeader(QNetworkRequest::ContentTypeHeader, "application/json"); data = QJsonDocument(QJsonObject::fromVariantMap(body)).toJson(QJsonDocument::Compact); }
  r.setTransferTimeout(20000);
  QNetworkReply *rep = m_net.sendCustomRequest(r, method, data);
  connect(rep, &QNetworkReply::finished, this, [rep, done]() {
    rep->deleteLater();
    const int status = rep->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    const QVariant j = QJsonDocument::fromJson(rep->readAll()).toVariant();
    QString msg = j.toMap().value("message").toString();
    if (msg.isEmpty() && j.toMap().contains("errors")) msg = j.toMap()["errors"].toStringList().join(", ");
    if (msg.isEmpty() && rep->error() != QNetworkReply::NoError) msg = rep->errorString();
    done(status ? status : -2, j, msg);
  });
}
QVariantMap Subs::error(int status, const QString &message, const QVariant &json) const {
  const QString e = message == "nokey" ? "nokey" : status == 401 ? (message.contains("token", Qt::CaseInsensitive) ? "login" : "auth")
                  : status == 406 ? "limit" : status == 429 ? "busy" : "network";
  const QVariantMap j = json.toMap();
  return { { "error", e }, { "message", message }, { "reset", j.value("reset_time_utc", j.value("reset_time")) } };
}
static bool ok(int status) { return status >= 200 && status < 300; }

void Subs::search(const QString &query, const QString &langs, const QString &src) {
  QUrlQuery p;
  // OpenSubtitles file hash: size + the 64-bit sums of the first and last 64 KB (subtitles synced to this exact file)
  if (!src.isEmpty() && !URL_RE.match(src).hasMatch()) {
    QFile f(src); const qint64 size = f.size(), chunk = 65536;
    if (size >= chunk && f.open(QIODevice::ReadOnly)) {
      QByteArray buf = f.read(chunk); f.seek(size - chunk); buf += f.read(chunk);
      quint64 h = quint64(size);
      for (int i = 0; i + 8 <= buf.size(); i += 8) { quint64 v; memcpy(&v, buf.constData() + i, 8); h += v; }
      p.addQueryItem("moviehash", QString("%1").arg(h, 16, 16, QChar('0')));
    }
  }
  if (!query.isEmpty()) p.addQueryItem("query", query.left(200));
  if (!langs.isEmpty()) { QStringList l = langs.toLower().split(QRegularExpression("[,\\s]+"), Qt::SkipEmptyParts); l.sort(); p.addQueryItem("languages", l.join(",")); }
  p.addQueryItem("order_by", "download_count");
  api("GET", "/subtitles?" + p.query(QUrl::FullyEncoded), {}, [this](int status, const QVariant &j, const QString &msg) {
    if (!ok(status)) return emit searched(error(status, msg, j));
    QVariantList out;
    for (const QVariant &d : j.toMap()["data"].toList()) {
      const QVariantMap a = d.toMap()["attributes"].toMap();
      const QVariantList files = a["files"].toList(); if (files.isEmpty()) continue;
      const QVariantMap f = files[0].toMap(), fd = a["feature_details"].toMap();
      out << QVariantMap{ { "fileId", f["file_id"] }, { "name", a["release"].toString().isEmpty() ? f["file_name"] : a["release"] }, { "file", f["file_name"] },
                          { "lang", a["language"] }, { "downloads", a["download_count"] }, { "hi", a["hearing_impaired"].toBool() },
                          { "match", a["moviehash_match"].toBool() }, { "title", fd["title"].toString().isEmpty() ? fd["movie_name"] : fd["title"] }, { "year", fd["year"] } };
      if (out.size() >= 60) break;
    }
    emit searched({ { "results", out } });
  });
}

void Subs::download(int fileId, const QString &src, const QString &lang) {
  if (m_token.isEmpty()) return emit downloaded({ { "error", "login" } });   // OpenSubtitles only allows downloads with a (free) account
  api("POST", "/download", { { "file_id", fileId } }, [=](int status, const QVariant &j, const QString &msg) {
    if (!ok(status)) return emit downloaded(error(status, msg, j));
    const QVariantMap r = j.toMap();
    if (r["link"].toString().isEmpty()) return emit downloaded({ { "error", "network" }, { "message", msg } });
    QNetworkRequest req{ QUrl(r["link"].toString()) }; req.setTransferTimeout(30000);
    QNetworkReply *rep = m_net.get(req);
    connect(rep, &QNetworkReply::finished, this, [=]() {
      rep->deleteLater();
      if (rep->error() != QNetworkReply::NoError) return emit downloaded({ { "error", "network" }, { "message", rep->errorString() } });
      const QByteArray data = rep->readAll();
      const auto em = QRegularExpression(R"(\.(srt|vtt|ass|ssa|sub)$)", QRegularExpression::CaseInsensitiveOption).match(r["file_name"].toString());
      const QString ext = em.hasMatch() ? em.captured(1).toLower() : "srt";
      const bool local = !src.isEmpty() && !URL_RE.match(src).hasMatch();
      const QString name = (local ? QFileInfo(src).completeBaseName() : QString("subtitle")) + "." + (lang.isEmpty() ? "xx" : lang.toLower()) + "." + ext;
      // next to the video when possible (picked up automatically next time), otherwise in the app's data folder
      QStringList dirs; if (local) dirs << QFileInfo(src).absolutePath(); dirs << dataDir() + "/subtitles";
      for (const QString &dir : dirs) {
        QDir().mkpath(dir);
        QString out = dir + "/" + name; int n = 1;
        while (QFileInfo::exists(out)) out = dir + "/" + QString(name).replace(QRegularExpression("(\\.[^.]+)$"), QString("-%1\\1").arg(n++));
        QFile f(out);
        if (f.open(QIODevice::WriteOnly) && f.write(data) == data.size()) return emit downloaded({ { "file", QDir::toNativeSeparators(out) }, { "remaining", r["remaining"] } });
      }
      emit downloaded({ { "error", "write" } });
    });
  });
}

void Subs::saveSession() const {
  QJsonObject o{ { "base", m_base } };
  if (!m_user.isEmpty()) o["user"] = QJsonObject{ { "name", m_user } };
  if (!m_token.isEmpty()) {
    const QByteArray enc = protect(m_token.toUtf8(), true);
#ifdef Q_OS_WIN
    if (!enc.isEmpty()) o["enc"] = QString::fromLatin1(enc.toBase64()); else o["token"] = m_token;
#else
    o["token"] = m_token;
#endif
  }
  QFile f(dataDir() + "/opensubtitles.json");
  if (f.open(QIODevice::WriteOnly)) f.write(QJsonDocument(o).toJson(QJsonDocument::Compact));
}
void Subs::login(const QString &username, const QString &password) {
  api("POST", "/login", { { "username", username }, { "password", password } }, [=](int status, const QVariant &j, const QString &msg) {
    if (!ok(status)) return emit loggedIn(error(status, msg, j));
    const QVariantMap r = j.toMap();
    m_token = r["token"].toString();
    m_user = r["user"].toMap().value("username", username).toString();
    if (!r["base_url"].toString().isEmpty()) m_base = "https://" + r["base_url"].toString().remove(QRegularExpression("^https?://")).remove(QRegularExpression("/+$")) + "/api/v1";
    saveSession(); emit userChanged();
    emit loggedIn({ { "user", m_user } });
  });
}
void Subs::logout() {
  if (!m_token.isEmpty()) api("DELETE", "/logout", {}, [](int, const QVariant &, const QString &) {});
  m_token.clear(); m_user.clear(); m_base = "https://api.opensubtitles.com/api/v1";
  QFile::remove(dataDir() + "/opensubtitles.json");
  emit userChanged();
}

// ---------- subtitle fonts ----------
QVariantList Subs::addFonts(const QVariantList &files) {
  QVariantList out;
  const QString dir = dataDir() + "/fonts"; QDir().mkpath(dir);
  for (const QVariant &v : files) {
    QString src = v.toString(); if (src.startsWith("file:")) src = QUrl(src).toLocalFile();
    QString dst = dir + "/" + QFileInfo(src).fileName(); int n = 1;
    while (QFileInfo::exists(dst)) dst = dir + "/" + QFileInfo(src).completeBaseName() + QString("-%1.").arg(n++) + QFileInfo(src).suffix();
    if (!QFile::copy(src, dst)) continue;
    const int id = QFontDatabase::addApplicationFont(dst);
    const QStringList fam = id < 0 ? QStringList() : QFontDatabase::applicationFontFamilies(id);
    if (fam.isEmpty()) { QFile::remove(dst); continue; }
    out << QVariantMap{ { "name", fam.first() }, { "file", QDir::toNativeSeparators(dst) } };
  }
  return out;
}
void Subs::loadFonts(const QVariantList &fonts) { for (const QVariant &f : fonts) QFontDatabase::addApplicationFont(f.toMap()["file"].toString()); }
void Subs::removeFont(const QString &file) { QFile::remove(file); }
QStringList Subs::systemFonts() const { return QFontDatabase::families(); }
