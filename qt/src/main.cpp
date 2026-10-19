// VLC Redesign 3 (Qt/QML + libVLC). The interface is QML (qml/), playback is libVLC (vlcplayer.cpp).
#include <QFont>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>

int main(int argc, char *argv[]) {
  QGuiApplication app(argc, argv);
  app.setApplicationName("VLC Redesign 3");
  app.setOrganizationName("VLC Redesign");
  QQuickStyle::setStyle("Basic");                      // popups and scrollbars only; everything is drawn by our components
#ifdef Q_OS_WIN
  QFont f("Segoe UI Variable Text"); f.setPixelSize(13); app.setFont(f);   // v2.x: 13px "Segoe UI Variable Text"
#endif
  QQmlApplicationEngine engine;
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
