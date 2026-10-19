#include "i18n.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocale>
#include <QQmlEngine>
#include <QRegularExpression>

static const QList<QPair<QString, QString>> LANGS = {
  { "en", "English" }, { "nl", "Nederlands" }, { "de", "Deutsch" }, { "fr", "Français" },
  { "es", "Español" }, { "it", "Italiano" }, { "pt", "Português" }, { "pl", "Polski" },
};

I18n::I18n(QObject *parent) : QObject(parent) {}
I18n::~I18n() { if (m_installed) QCoreApplication::removeTranslator(&m_tr); }

QVariantList I18n::languages() const {
  QVariantList out; for (const auto &l : LANGS) out << QVariant(QVariantList{ l.first, l.second }); return out;
}
QString I18n::detect() const {
  for (const QString &l : QLocale::system().uiLanguages()) {
    const QString c = l.left(2).toLower();
    for (const auto &x : LANGS) if (x.first == c) return c;
  }
  return "en";
}

void I18n::setLanguage(const QString &given) {
  QString code = given;
  bool known = false; for (const auto &x : LANGS) if (x.first == code) known = true;
  if (!known) code = detect();
  if (code == m_lang && (code == "en" || !m_tr.dict.isEmpty())) return;
  m_lang = code;
  m_tr.dict.clear();
  if (code != "en") {
    QFile f(":/qt/qml/VLCR/lang/" + code + ".json");
    if (f.open(QIODevice::ReadOnly)) {
      const QJsonObject o = QJsonDocument::fromJson(f.readAll()).object();
      static const QRegularExpression ph("\\{(\\w+)\\}");
      for (auto it = o.begin(); it != o.end(); ++it) {
        const QString k = it.key(), v = it.value().toString();
        m_tr.dict.insert(k, v);
        // "{n} items" → "%1 items" (numbered in the order the English text uses them)
        if (k.contains('{')) {
          QStringList names; auto m = ph.globalMatch(k);
          while (m.hasNext()) { const QString n = m.next().captured(1); if (!names.contains(n)) names << n; }
          QString k2 = k, v2 = v;
          for (int i = 0; i < names.size(); i++) { k2.replace("{" + names[i] + "}", "%" + QString::number(i + 1)); v2.replace("{" + names[i] + "}", "%" + QString::number(i + 1)); }
          m_tr.dict.insert(k2, v2);
        }
      }
    }
  }
  if (!m_installed) { QCoreApplication::installTranslator(&m_tr); m_installed = true; }
  QLocale::setDefault(QLocale(code));
  if (QQmlEngine *e = qmlEngine(this)) e->retranslate();
  emit languageChanged();
}

QString I18n::t(const QString &key, const QVariantMap &vars) const {
  QString s = m_tr.dict.value(key, key);
  for (auto it = vars.begin(); it != vars.end(); ++it) s.replace("{" + it.key() + "}", it.value().toString());
  return s;
}
