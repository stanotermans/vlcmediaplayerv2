// Settings: the same keys and defaults as v2.x (defaults.json is made from app/src/settings.js), stored as
// settings.json in the app's data folder. QML: Settings.get("vf.crop.t"), Settings.set(path, value), and bindings on
// Settings.values (which changes with every set).
#pragma once
#include <QObject>
#include <QTimer>
#include <QVariantMap>
#include <QtQml/qqmlregistration.h>

class Settings : public QObject {
  Q_OBJECT
  QML_ELEMENT
  QML_SINGLETON
  Q_PROPERTY(QVariantMap values READ values NOTIFY changed)
  Q_PROPERTY(QStringList accents READ accents CONSTANT)
public:
  explicit Settings(QObject *parent = nullptr);
  QVariantMap values() const { return m_values; }
  QStringList accents() const { return m_accents; }
  Q_INVOKABLE QVariant get(const QString &path) const;
  Q_INVOKABLE void set(const QString &path, const QVariant &value);
  Q_INVOKABLE void reset(const QString &path);
  Q_INVOKABLE QVariant defaultValue(const QString &path) const;
signals:
  void changed(const QString &path);
private:
  void save();
  QVariantMap m_values, m_defaults;
  QStringList m_accents;
  QString m_file;
  QTimer m_saveTimer;
};
