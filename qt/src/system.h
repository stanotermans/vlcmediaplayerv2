// System: what the app does with the operating system (v2.x main.js): one running app (files opened while it runs
// go to it), "Set as default player", updates from GitHub releases, and the media keys and media overlay
// (Windows: System Media Transport Controls; MPRIS on Linux and Now Playing on macOS come with their packages).
#pragma once
#include <QLocalServer>
#include <QNetworkAccessManager>
#include <QObject>
#include <QVariantMap>
#include <QtQml/qqmlregistration.h>

class QWindow;

class System : public QObject {
  Q_OBJECT
  // one object, made in main() before QML (the context property "System")
  Q_PROPERTY(QString version READ version CONSTANT)
  Q_PROPERTY(bool portable READ portable CONSTANT)
  Q_PROPERTY(QVariantMap update READ update NOTIFY updateChanged)   // { state, info, error, progress }
  // Android (#53): allowed to read the videos and music (elsewhere always); the folders the library starts with there
  Q_PROPERTY(bool mediaAccess READ mediaAccess NOTIFY mediaAccessChanged)
  Q_PROPERTY(QStringList mobileFolders READ mobileFolders CONSTANT)
  Q_PROPERTY(QVariantMap insets READ insets NOTIFY insetsChanged)   // the phone's status / navigation bars over the app (device-independent px)
public:
  explicit System(QObject *parent = nullptr);
  ~System() override;
  static System *instance;
  // at startup: true when another copy runs (the paths were handed to it and this one should quit)
  static bool forwardToRunning(const QStringList &paths);
  static QStringList pathsFromArgs(const QStringList &args);
  void listen();

  QString version() const;
  Q_INVOKABLE QString changelog() const;                 // CHANGELOG.md, built in (#71)
  bool portable() const;
  QVariantMap update() const { return m_update; }

  Q_INVOKABLE QStringList startPaths() const { return m_startPaths; }
  void setStartPaths(const QStringList &p) { m_startPaths = p; }
  Q_INVOKABLE QString setDefaultPlayer();                // what happened, for the user (already translated keys)
  Q_INVOKABLE void checkUpdates(bool manual);
  Q_INVOKABLE void installUpdate();

  // media keys and the system's media overlay
  Q_INVOKABLE void mediaAttach(QWindow *w);
  Q_INVOKABLE void mediaState(const QString &state);     // "playing", "paused", "stopped", "closed"
  Q_INVOKABLE void mediaInfo(const QString &title, const QString &artist, const QString &album, bool music);
  // #61: 0 nothing, 1 keep the computer awake (music), 2 also keep the screen on (video)
  Q_INVOKABLE void keepAwake(int level);
  // #60: the blank cursor at once (a cursor shape changes only when the mouse moves again)
  Q_INVOKABLE void hideCursor(bool on);
  // testing: a mouse move inside a window (Qt event only, the real cursor stays where it is)
  Q_INVOKABLE void testMouseMove(QWindow *w, qreal x, qreal y);
  Q_INVOKABLE void testClick(QWindow *w, qreal x, qreal y);   // testing: a left click at this window point
  bool mediaAccess() const;
  Q_INVOKABLE void askMediaAccess();                     // Android's question; mediaAccessChanged once answered
  Q_INVOKABLE bool allFilesAccess() const;               // Android 11+: also subtitles and lyrics next to the media
  Q_INVOKABLE void askAllFilesAccess();
  QStringList mobileFolders() const;
  QVariantMap insets() const { return m_insets; }
  Q_INVOKABLE void readInsets(qreal dpr);               // again after the window changed (rotation)
signals:
  void insetsChanged();
  void openPaths(const QStringList &paths);              // from "Open with" / a second start
  void mediaButton(const QString &button);               // "play", "pause", "next", "previous", "stop"
  void updateChanged();
  void mediaAccessChanged();
private:
  bool m_access = true;
  QVariantMap m_insets{ { "top", 0 }, { "bottom", 0 }, { "left", 0 }, { "right", 0 } };
  void setUpdate(const QString &state, const QString &error = {});
  QLocalServer m_server;
  QStringList m_startPaths;
  QNetworkAccessManager m_net;
  QVariantMap m_update{ { "state", "idle" } };
  void *m_smtc = nullptr;                                // ISystemMediaTransportControls
  qint64 m_token = 0;
  int m_awake = 0;
  quint32 m_awakeId = 0;                                 // macOS power assertion / Linux inhibit cookie
  bool m_cursorHidden = false;
};
