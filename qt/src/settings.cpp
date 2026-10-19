#include "settings.h"
#include <QDir>
#include <QFile>
#include <QJSValue>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSaveFile>
#include <QStandardPaths>

// a.b.c paths into nested maps
static QVariant getPath(const QVariantMap &m, const QStringList &keys) {
  QVariant v = m;
  for (const QString &k : keys) { if (v.typeId() != QMetaType::QVariantMap) return {}; v = v.toMap().value(k); }
  return v;
}
static void setPath(QVariantMap &m, const QStringList &keys, int i, const QVariant &value) {
  if (i == keys.size() - 1) { m[keys[i]] = value; return; }
  QVariantMap sub = m.value(keys[i]).toMap();
  setPath(sub, keys, i + 1, value);
  m[keys[i]] = sub;
}
// stored values on top of the defaults, nested maps merged (like v2.x: new defaults appear for older settings)
static QVariantMap merge(QVariantMap base, const QVariantMap &over) {
  for (auto it = over.begin(); it != over.end(); ++it) {
    if (it.value().typeId() == QMetaType::QVariantMap && base.value(it.key()).typeId() == QMetaType::QVariantMap)
      base[it.key()] = merge(base.value(it.key()).toMap(), it.value().toMap());
    else base[it.key()] = it.value();
  }
  return base;
}

Settings::Settings(QObject *parent) : QObject(parent) {
  QFile d(":/qt/qml/VLCR/src/defaults.json");
  if (d.open(QIODevice::ReadOnly)) {
    const QJsonObject o = QJsonDocument::fromJson(d.readAll()).object();
    m_defaults = o.value("defaults").toObject().toVariantMap();
    for (const auto &a : o.value("accents").toArray()) m_accents << a.toString();
  }
  const QString dir = qEnvironmentVariable("VLCR_USER_DATA", QStandardPaths::writableLocation(QStandardPaths::AppDataLocation));
  QDir().mkpath(dir);
  m_file = dir + "/settings.json";
  QFile f(m_file);
  QVariantMap stored;
  if (f.open(QIODevice::ReadOnly)) stored = QJsonDocument::fromJson(f.readAll()).object().toVariantMap();
  m_values = merge(m_defaults, stored);
  m_saveTimer.setSingleShot(true); m_saveTimer.setInterval(150);
  connect(&m_saveTimer, &QTimer::timeout, this, &Settings::save);
}

QVariant Settings::get(const QString &path) const { return getPath(m_values, path.split('.')); }
QVariant Settings::defaultValue(const QString &path) const { return getPath(m_defaults, path.split('.')); }
void Settings::set(const QString &path, const QVariant &value) {
  QVariant v = value;
  if (v.canConvert<QJSValue>()) v = v.value<QJSValue>().toVariant();   // arrays and objects from QML
  if (getPath(m_values, path.split('.')) == v) return;
  setPath(m_values, path.split('.'), 0, v);
  emit changed(path);
  m_saveTimer.start();
}
void Settings::reset(const QString &path) { set(path, defaultValue(path)); }
void Settings::save() {
  QSaveFile f(m_file);
  if (!f.open(QIODevice::WriteOnly)) return;
  f.write(QJsonDocument(QJsonObject::fromVariantMap(m_values)).toJson(QJsonDocument::Indented));
  f.commit();
}
