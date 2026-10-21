#include "store.h"
#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QStandardPaths>
#ifdef Q_OS_ANDROID
#include <QJniEnvironment>
#include <QJniObject>
#include <QtCore/qcoreapplication_platform.h>
#endif

Store *Store::instance = nullptr;

// the last answer of the store, so Pro also works offline (the store's answer replaces it once it comes)
static QString cacheFile() {
  return qEnvironmentVariable("VLCR_USER_DATA", QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)) + "/store";
}

#ifdef Q_OS_ANDROID
static QJniObject g_java;   // io.github.stanotermans.velaplayer.VelaStore
// VelaStore.onState(boolean known, boolean pro, String price, String error), on Google Play's threads
static void JNICALL onState(JNIEnv *env, jclass, jboolean known, jboolean pro, jstring price, jstring error) {
  auto str = [env](jstring s) { if (!s) return QString(); const char *c = env->GetStringUTFChars(s, nullptr); const QString r = QString::fromUtf8(c); env->ReleaseStringUTFChars(s, c); return r; };
  const QString p = str(price), e = str(error);
  if (Store::instance) QMetaObject::invokeMethod(Store::instance, [=]() { Store::instance->update(known, pro, p, e); }, Qt::QueuedConnection);
}
#endif

Store::Store(QObject *parent) : QObject(parent) {
  instance = this;
#ifdef Q_OS_ANDROID
  m_inStore = true;
  QFile f(cacheFile());
  m_pro = f.open(QIODevice::ReadOnly) && f.readAll().trimmed() == "pro";
#endif
  if (qEnvironmentVariableIsSet("VLCR_PRO")) { m_pro = qEnvironmentVariable("VLCR_PRO") == "1"; return; }   // (tests: no store)
#ifdef Q_OS_ANDROID
  QJniEnvironment env;
  const JNINativeMethod m[] = { { "onState", "(ZZLjava/lang/String;Ljava/lang/String;)V", reinterpret_cast<void *>(onState) } };
  if (env.registerNativeMethods("io/github/stanotermans/velaplayer/VelaStore", m, 1))
    g_java = QJniObject("io/github/stanotermans/velaplayer/VelaStore", "(Landroid/app/Activity;)V",
                        QJniObject(QNativeInterface::QAndroidApplication::context()).object());
  env.checkAndClearExceptions();
  if (!g_java.isValid()) m_error = tr("Google Play is not available");
#endif
}

void Store::buy() {
#ifdef Q_OS_ANDROID
  if (g_java.isValid()) { m_error.clear(); emit changed(); g_java.callMethod<void>("buy"); }
  else { m_error = tr("Google Play is not available"); emit changed(); }
#endif
}

void Store::restore() {
#ifdef Q_OS_ANDROID
  if (g_java.isValid()) g_java.callMethod<void>("restore");
#endif
}

void Store::update(bool known, bool pro, const QString &price, const QString &error) {
  const bool was = m_pro;
  if (!price.isEmpty()) m_price = price;
  m_error = error;
  if (known) { m_pro = pro; remember(); }
  emit changed();
  if (m_pro && !was) emit bought();
}

void Store::remember() {
  QDir().mkpath(QFileInfo(cacheFile()).absolutePath());
  QFile f(cacheFile());
  if (f.open(QIODevice::WriteOnly | QIODevice::Truncate)) f.write(m_pro ? "pro" : "free");
}
