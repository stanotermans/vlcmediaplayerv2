#include "android.h"
#ifdef Q_OS_ANDROID
#include <QCoreApplication>
#include <QtCore/qcoreapplication_platform.h>
#include <QFile>
#include <QJniEnvironment>
#include <QJniObject>

using QNativeInterface::QAndroidApplication;

static QJniObject context() { return QAndroidApplication::context(); }
static int sdk() { return QJniObject::getStaticField<jint>("android/os/Build$VERSION", "SDK_INT"); }
static QStringList mediaPermissions() {
  return sdk() >= 33 ? QStringList{ "android.permission.READ_MEDIA_VIDEO", "android.permission.READ_MEDIA_AUDIO" }
                     : QStringList{ "android.permission.READ_EXTERNAL_STORAGE" };
}

void Android::loadTestEnv() {
  const QJniObject dir = context().callObjectMethod("getExternalFilesDir", "(Ljava/lang/String;)Ljava/io/File;", nullptr);
  if (!dir.isValid()) return;
  QFile f(dir.callObjectMethod<jstring>("getAbsolutePath").toString() + "/env.txt");
  if (!f.open(QIODevice::ReadOnly)) return;
  for (const QByteArray &line : f.readAll().split('\n')) {
    const int eq = line.indexOf('=');
    if (eq > 0) qputenv(line.left(eq).trimmed().constData(), line.mid(eq + 1).trimmed());
  }
}

QString Android::nativeLibraryDir() {
  const QJniObject info = context().callObjectMethod("getApplicationInfo", "()Landroid/content/pm/ApplicationInfo;");
  return info.getObjectField<jstring>("nativeLibraryDir").toString();
}

QString Android::storage() {
  return QJniObject::callStaticObjectMethod("android/os/Environment", "getExternalStorageDirectory", "()Ljava/io/File;")
      .callObjectMethod<jstring>("getAbsolutePath").toString();
}

bool Android::mediaAccess() {
  if (allFilesAccess()) return true;
  for (const QString &p : mediaPermissions())
    if (context().callMethod<jint>("checkSelfPermission", "(Ljava/lang/String;)I", QJniObject::fromString(p).object<jstring>()) != 0) return false;
  return true;
}

void Android::askMediaAccess() {
  if (mediaAccess()) return;
  const QStringList perms = mediaPermissions();
  QJniEnvironment env;
  jobjectArray a = env->NewObjectArray(perms.size(), env.findClass("java/lang/String"), nullptr);
  for (int i = 0; i < perms.size(); i++) env->SetObjectArrayElement(a, i, QJniObject::fromString(perms[i]).object<jstring>());
  context().callMethod<void>("requestPermissions", "([Ljava/lang/String;I)V", a, 1);
  env->DeleteLocalRef(a);
}

bool Android::allFilesAccess() {
  return sdk() >= 30 && QJniObject::callStaticMethod<jboolean>("android/os/Environment", "isExternalStorageManager");
}

void Android::askAllFilesAccess() {
  if (sdk() < 30) return askMediaAccess();
  const QJniObject uri = QJniObject::callStaticObjectMethod("android/net/Uri", "parse", "(Ljava/lang/String;)Landroid/net/Uri;",
      QJniObject::fromString("package:" + context().callObjectMethod<jstring>("getPackageName").toString()).object<jstring>());
  QJniObject intent("android/content/Intent", "(Ljava/lang/String;Landroid/net/Uri;)V",
      QJniObject::fromString("android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION").object<jstring>(), uri.object());
  context().callMethod<void>("startActivity", "(Landroid/content/Intent;)V", intent.object());
}

QVariantMap Android::insets() {
  QVariantMap m;
  QAndroidApplication::runOnAndroidMainThread([&m]() {
    const QJniObject w = context().callObjectMethod("getWindow", "()Landroid/view/Window;");
    const QJniObject in = w.isValid() ? w.callObjectMethod("getDecorView", "()Landroid/view/View;")
                                         .callObjectMethod("getRootWindowInsets", "()Landroid/view/WindowInsets;") : QJniObject();
    if (!in.isValid()) return;
    if (sdk() >= 30) {   // WindowInsets.Type.systemBars() | displayCutout()
      const jint types = QJniObject::callStaticMethod<jint>("android/view/WindowInsets$Type", "systemBars")
                       | QJniObject::callStaticMethod<jint>("android/view/WindowInsets$Type", "displayCutout");
      const QJniObject i = in.callObjectMethod("getInsets", "(I)Landroid/graphics/Insets;", types);
      for (const char *k : { "top", "bottom", "left", "right" }) m[k] = i.getField<jint>(k);
    } else {
      m["top"] = in.callMethod<jint>("getSystemWindowInsetTop"); m["bottom"] = in.callMethod<jint>("getSystemWindowInsetBottom");
      m["left"] = in.callMethod<jint>("getSystemWindowInsetLeft"); m["right"] = in.callMethod<jint>("getSystemWindowInsetRight");
    }
  }).waitForFinished();
  return m;
}

void Android::keepScreenOn(bool on) {
  QAndroidApplication::runOnAndroidMainThread([on]() {
    const QJniObject w = context().callObjectMethod("getWindow", "()Landroid/view/Window;");
    if (w.isValid()) w.callMethod<void>(on ? "addFlags" : "clearFlags", "(I)V", 128);   // FLAG_KEEP_SCREEN_ON
  });
}
#endif
