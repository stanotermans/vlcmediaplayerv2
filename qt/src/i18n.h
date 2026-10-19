// I18n: the interface language. The translations are v2.x's (qt/lang/<code>.json, made from app/src/lang by
// tools/sync-lang.py): English text is the key, so every qsTr("…") finds its translation through one translator,
// whatever file it is in. v2.x writes placeholders as {name}; QML uses %1, %2 …, so both forms are looked up.
#pragma once
#include <QHash>
#include <QObject>
#include <QTranslator>
#include <QVariantList>
#include <QtQml/qqmlregistration.h>

class DictTranslator : public QTranslator {
public:
  QHash<QString, QString> dict;
  bool isEmpty() const override { return dict.isEmpty(); }
  QString translate(const char *, const char *source, const char * = nullptr, int = -1) const override {
    return dict.value(QString::fromUtf8(source));
  }
};

class I18n : public QObject {
  Q_OBJECT
  QML_ELEMENT
  QML_SINGLETON
  Q_PROPERTY(QString language READ language NOTIFY languageChanged)
  Q_PROPERTY(QVariantList languages READ languages CONSTANT)     // [[code, name], …]
public:
  explicit I18n(QObject *parent = nullptr);
  ~I18n() override;
  QString language() const { return m_lang; }
  QVariantList languages() const;
  Q_INVOKABLE QString detect() const;                           // the system's language, if the app has it
  Q_INVOKABLE void setLanguage(const QString &code);            // "" = the system's
  Q_INVOKABLE QString t(const QString &key, const QVariantMap &vars = {}) const;   // v2.x style: t("{n} items", { n: 3 })
signals:
  void languageChanged();
private:
  DictTranslator m_tr;
  QString m_lang = "en";
  bool m_installed = false;
};
