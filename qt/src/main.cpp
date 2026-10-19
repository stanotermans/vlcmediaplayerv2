// VLC Redesign 3 (Qt/QML + libVLC). The interface is QML (qml/), playback is libVLC (vlcplayer.cpp).
#include <QFont>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>

#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QStandardPaths>
#include <QQmlEngine>
#include "system.h"

// Settings → General → Interface size: the whole interface is scaled by Qt, so it is read before the app starts
static void applyInterfaceSize() {
  QCoreApplication::setApplicationName("VLC Redesign 3"); QCoreApplication::setOrganizationName("VLC Redesign");
  const QString dir = qEnvironmentVariable("VLCR_USER_DATA", QStandardPaths::writableLocation(QStandardPaths::AppDataLocation));
  QFile f(dir + "/settings.json");
  if (!f.open(QIODevice::ReadOnly)) return;
  const double s = QJsonDocument::fromJson(f.readAll()).object()["uiScale"].toDouble(100);
  if (s >= 75 && s <= 150 && s != 100 && !qEnvironmentVariableIsSet("QT_SCALE_FACTOR")) qputenv("QT_SCALE_FACTOR", QByteArray::number(s / 100));
}

int main(int argc, char *argv[]) {
  applyInterfaceSize();
  QGuiApplication app(argc, argv);
  app.setApplicationVersion("3.0.0");
  app.setApplicationName("VLC Redesign 3");
  app.setOrganizationName("VLC Redesign");
  QQuickStyle::setStyle("Basic");                      // popups and scrollbars only; everything is drawn by our components
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


  QQmlApplicationEngine engine;
  engine.rootContext()->setContextProperty("qtVersion", QString(qVersion()));
  engine.rootContext()->setContextProperty("System", &sys);
  auto *ctx = engine.rootContext();
  ctx->setContextProperty("startFolder", qEnvironmentVariable("VLCR_FOLDER"));
  ctx->setContextProperty("autoPlay", qEnvironmentVariable("VLCR_PLAY"));
  // testing: VLCR_OPEN=settings[:<page>] opens a window at start; VLCR_SHOT=<file.png> saves the window after
  // VLCR_SHOT_MS (default 6000) and quits; VLCR_LOG=<file> receives measurements
  ctx->setContextProperty("openAtStart", qEnvironmentVariable("VLCR_OPEN"));
  ctx->setContextProperty("shotPath", qEnvironmentVariable("VLCR_SHOT"));
  ctx->setContextProperty("shotMs", qEnvironmentVariableIsSet("VLCR_SHOT_MS") ? qEnvironmentVariableIntValue("VLCR_SHOT_MS") : 6000);
  QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app, []() { QCoreApplication::exit(1); }, Qt::QueuedConnection);
  engine.loadFromModule("VLCR", "Main");
  return app.exec();
}
