// Vela Player (Qt/QML + libVLC). The interface is QML (qml/), playback is libVLC (vlcplayer.cpp).
#include <QFont>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include "vlcplayer.h"
#include <cstdio>
#ifdef _WIN32
#include <process.h>
#else
#include <unistd.h>
#endif
#include <QQmlContext>
#include <QQuickStyle>
#include <QQuickWindow>

#include <QFile>
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QStandardPaths>
#include <QQmlEngine>
#include "system.h"
#include "crashlog.h"
#ifdef Q_OS_ANDROID
#include "android.h"
#endif

// Vela Player was called VLC Redesign up to 3.0.7: on the first start under the new name its data folder (settings,
// library, playlists, positions, bookmarks) is copied over. Copied, not moved: an older version still finds its own.
static void copyDir(const QString &from, const QString &to) {
  QDir().mkpath(to);
  for (const QFileInfo &f : QDir(from).entryInfoList(QDir::Files | QDir::Dirs | QDir::NoDotAndDotDot | QDir::Hidden)) {
    if (f.isDir()) copyDir(f.absoluteFilePath(), to + "/" + f.fileName());
    else QFile::copy(f.absoluteFilePath(), to + "/" + f.fileName());
  }
}
static void takeOverOldName() {
  if (qEnvironmentVariableIsSet("VLCR_USER_DATA")) return;
  QCoreApplication::setApplicationName("VLC Redesign 3"); QCoreApplication::setOrganizationName("VLC Redesign");
  QString old = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
  // the Flatpak had another ID then: its data is in that app's own folder (reachable through --filesystem=host)
  if (qEnvironmentVariableIsSet("FLATPAK_ID") && !QFileInfo::exists(old + "/settings.json"))
    old = QDir::homePath() + "/.var/app/io.github.stanotermans.VLCRedesign/data/VLC Redesign/VLC Redesign 3";
  QCoreApplication::setApplicationName("Vela Player"); QCoreApplication::setOrganizationName("Vela Player");
  const QString now = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
  if (!QFileInfo::exists(now) && QFileInfo::exists(old + "/settings.json")) copyDir(old, now);
}

#if defined(Q_OS_LINUX) && !defined(Q_OS_ANDROID)
// #88: GNOME keeps the cursor theme in its own settings; X11 programs read XCURSOR_THEME / XCURSOR_SIZE
static QByteArray gsetting(const char *key) {
  QByteArray out;
  if (FILE *f = popen((QByteArray("gsettings get org.gnome.desktop.interface ") + key + " 2>/dev/null").constData(), "r")) {
    char buf[256]; while (fgets(buf, sizeof buf, f)) out += buf;
    pclose(f);
  }
  return out.trimmed().replace('\'', "");
}
static void gnomeCursor() {
  if (!qgetenv("XDG_CURRENT_DESKTOP").toLower().contains("gnome")) return;
  if (!qEnvironmentVariableIsSet("XCURSOR_THEME")) { const QByteArray t = gsetting("cursor-theme"); if (!t.isEmpty()) qputenv("XCURSOR_THEME", t); }
  if (!qEnvironmentVariableIsSet("XCURSOR_SIZE")) { const QByteArray s = gsetting("cursor-size"); if (s.toInt() > 0) qputenv("XCURSOR_SIZE", s); }
}
#endif

// Settings → General → Interface size: the whole interface is scaled by Qt, so it is read before the app starts
static void applyInterfaceSize() {
  QCoreApplication::setApplicationName("Vela Player"); QCoreApplication::setOrganizationName("Vela Player");
  const QString dir = qEnvironmentVariable("VLCR_USER_DATA", QStandardPaths::writableLocation(QStandardPaths::AppDataLocation));
  QFile f(dir + "/settings.json");
  if (!f.open(QIODevice::ReadOnly)) return;
  const double s = QJsonDocument::fromJson(f.readAll()).object()["uiScale"].toDouble(100);
  if (s >= 75 && s <= 150 && s != 100 && !qEnvironmentVariableIsSet("QT_SCALE_FACTOR")) qputenv("QT_SCALE_FACTOR", QByteArray::number(s / 100));
}

int main(int argc, char *argv[]) {
  // the portable Windows version (a file "portable" next to the program) keeps its data in "data" next to it
  {
    const QString exe = QString::fromLocal8Bit(argv[0]);
    const QString dir = exe.contains('\\') || exe.contains('/') ? QFileInfo(exe).absolutePath() : QDir::currentPath();
    if (QFile::exists(dir + "/portable") && !qEnvironmentVariableIsSet("VLCR_USER_DATA")) qputenv("VLCR_USER_DATA", QString(dir + "/data").toUtf8());
  }
  takeOverOldName();
  applyInterfaceSize();
#if defined(Q_OS_LINUX) && !defined(Q_OS_ANDROID)
  gnomeCursor();
#endif
  QGuiApplication app(argc, argv);
#ifdef Q_OS_ANDROID
  Android::loadTestEnv();
#endif
  app.setApplicationVersion(VLCR_VERSION);
  app.setApplicationName("Vela Player");
  app.setOrganizationName("Vela Player");
  installCrashLog(qEnvironmentVariable("VLCR_USER_DATA", QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)) + "/crash.log");
  QQuickStyle::setStyle("Basic");
#if defined(Q_OS_LINUX) && !defined(Q_OS_ANDROID)
  QQuickWindow::setDefaultAlphaBuffer(true);   // #85: a see-through window for the rounded corners
#endif                      // popups and scrollbars only; everything is drawn by our components
#ifdef Q_OS_WIN
  QFont f("Segoe UI Variable Text"); f.setPixelSize(13); app.setFont(f);   // v2.x: 13px "Segoe UI Variable Text"
#endif
  // one running app: files opened while it runs ("Open with", a double-click) go to it
  System sys;
  const QStringList paths = System::pathsFromArgs(app.arguments());
  const bool testing = qEnvironmentVariableIsSet("VLCR_SHOT");
  if (!testing && System::forwardToRunning(paths)) return 0;
  if (!testing) sys.listen();
  sys.setStartPaths(paths);


  auto *engine = new QQmlApplicationEngine;
  engine->rootContext()->setContextProperty("qtVersion", QString(qVersion()));
  engine->rootContext()->setContextProperty("System", &sys);
  auto *ctx = engine->rootContext();
  ctx->setContextProperty("startFolder", qEnvironmentVariable("VLCR_FOLDER"));
  ctx->setContextProperty("autoPlay", qEnvironmentVariable("VLCR_PLAY"));
  // testing: VLCR_OPEN=settings[:<page>] opens a window at start; VLCR_SHOT=<file.png> saves the window after
  // VLCR_SHOT_MS (default 6000) and quits; VLCR_LOG=<file> receives measurements
  ctx->setContextProperty("openAtStart", qEnvironmentVariable("VLCR_OPEN"));
  ctx->setContextProperty("shotPath", qEnvironmentVariable("VLCR_SHOT"));
  ctx->setContextProperty("shotMs", qEnvironmentVariableIsSet("VLCR_SHOT_MS") ? qEnvironmentVariableIntValue("VLCR_SHOT_MS") : 6000);
  // testing: VLCR_SCREEN=<name, e.g. \.\DISPLAY3> opens the window on that screen (tests away from the main screen)
  ctx->setContextProperty("testScreen", qEnvironmentVariable("VLCR_SCREEN"));
  QObject::connect(engine, &QQmlApplicationEngine::objectCreationFailed, &app, []() { QCoreApplication::exit(1); }, Qt::QueuedConnection);
  engine->loadFromModule("VLCR", "Main");
  const int code = app.exec();
  delete engine;   // the library and the settings are saved here
  // a network stream that stalls can keep libVLC's stop busy: end now instead of unloading libVLC under it
  if (VlcPlayer::stopsPending()) { fflush(nullptr); _exit(code); }
  return code;
}
