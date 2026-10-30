#include "store.h"
#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QDateTime>
#include <QStandardPaths>
#include <QTimer>
#ifdef Q_OS_ANDROID
#include <QJniEnvironment>
#include <QJniObject>
#include <QtCore/qcoreapplication_platform.h>
#endif

Store *Store::instance = nullptr;

// next to the app's data: the trial's start (Pro itself: VelaStore's signed verdict, #53)
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
  m_pro = false;   // (only VelaStore's signed verdict says Pro; a plain file could be edited on a rooted phone)
#endif
  if (qEnvironmentVariable("VLCR_STORE") == "1") { m_inStore = true; m_pro = false; }   // (tests: the store's screens without a store)
  QFile t(cacheFile() + ".trial");
  if (t.open(QIODevice::ReadOnly)) m_trialStart = t.readAll().trimmed().toLongLong();
  auto *tick = new QTimer(this);   // the end of a trial while the app runs
  connect(tick, &QTimer::timeout, this, &Store::changed);
  tick->start(30 * 60 * 1000);
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

int Store::trialDays() const {
  if (m_trialStart == 0) return 0;
  const qint64 left = m_trialStart + 7LL * 24 * 3600 * 1000 - QDateTime::currentMSecsSinceEpoch();
  return left > 0 ? int((left + 24LL * 3600 * 1000 - 1) / (24LL * 3600 * 1000)) : 0;
}

void Store::startTrial() {
  if (!trialAvailable()) return;
  m_trialStart = QDateTime::currentMSecsSinceEpoch();
  QDir().mkpath(QFileInfo(cacheFile()).absolutePath());
  QFile t(cacheFile() + ".trial");
  if (t.open(QIODevice::WriteOnly | QIODevice::Truncate)) t.write(QByteArray::number(m_trialStart));
  emit changed();
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
  if (known) m_pro = pro;
  emit changed();
  if (m_pro && !was) emit bought();
}

