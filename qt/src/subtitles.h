// Subtitles and lyrics (v2.x main.js subtitles / siblingSubs / readLyrics, i18n.js langCodes, and the OpenSubtitles.com
// client). Text subtitles (a file, or a text track inside the video) become WebVTT through the slim FFmpeg and are
// drawn by the interface, so their font, size, colours, delay and speed are ours; image subtitles (PGS, DVD, DVB) are
// drawn by libVLC (VlcPlayer.setSpu).
#pragma once
#include <QNetworkAccessManager>
#include <QObject>
#include <QThreadPool>
#include <QVariantMap>
#include <QtQml/qqmlregistration.h>

class Subs : public QObject {
  Q_OBJECT
  QML_ELEMENT
  Q_PROPERTY(bool online READ online CONSTANT)                    // an OpenSubtitles API key is built in
  Q_PROPERTY(QString user READ user NOTIFY userChanged)           // logged in to OpenSubtitles as …
public:
  explicit Subs(QObject *parent = nullptr);
  ~Subs() override;
  Q_INVOKABLE QStringList siblings(const QString &src) const;     // subtitle and .lrc files next to a video, same name
  Q_INVOKABLE QString readLyrics(const QString &file) const;      // a .lrc file (at most 1 MB) as text
  Q_INVOKABLE void load(int req, const QString &src, int stream); // → loaded(req, webvtt); stream -1: src is a subtitle file
  Q_INVOKABLE QStringList langCodes(const QString &text) const;   // "English, Nederlands, ger" → ["en", "nl", "de"]
  Q_INVOKABLE QString query(const QString &name) const;           // a search title from a file name

  bool online() const { return !m_key.isEmpty(); }
  QString user() const { return m_user; }
  Q_INVOKABLE void search(const QString &query, const QString &langs, const QString &src);   // → searched(result)
  Q_INVOKABLE void download(int fileId, const QString &src, const QString &lang);            // → downloaded(result)
  Q_INVOKABLE void login(const QString &username, const QString &password);                  // → loggedIn(result)
  Q_INVOKABLE void logout();
signals:
  void loaded(int req, const QString &text);
  void searched(const QVariantMap &result);      // { results: [{ fileId, name, file, lang, downloads, hi, match, title, year }] } or { error }
  void downloaded(const QVariantMap &result);    // { file, remaining } or { error }
  void loggedIn(const QVariantMap &result);      // { user } or { error }
  void userChanged();
private:
  using Done = std::function<void(int status, const QVariant &json, const QString &message)>;
  void api(const QByteArray &method, const QString &route, const QVariantMap &body, Done done);
  QVariantMap error(int status, const QString &message, const QVariant &json) const;
  void saveSession() const;
  QString m_key, m_token, m_user, m_base = "https://api.opensubtitles.com/api/v1";
  QNetworkAccessManager m_net;
  QThreadPool m_pool;
};
