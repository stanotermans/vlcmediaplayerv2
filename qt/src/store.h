// Vela Player Pro (#53): the one-time purchase in the app stores (Android: Google Play Billing, product "vela_pro").
// It unlocks the equalizer and audio effects, the video filters and 360°, the themes and accent colours, and
// OpenSubtitles, recording and snapshots. The desktop version has everything (pro is always true there).
// A trial: 7 days of Pro from startTrial(), once per install (kept next to the store's last answer).
// Testing: VLCR_PRO=0 / 1 sets it anywhere, without a store.
#pragma once
#include <QObject>
#include <QtQml/qqmlregistration.h>

class Store : public QObject {
  Q_OBJECT
  QML_ELEMENT
  QML_SINGLETON
  Q_PROPERTY(bool pro READ pro NOTIFY changed)
  Q_PROPERTY(bool inStore READ inStore CONSTANT)          // this build sells Pro (Android)
  Q_PROPERTY(QString price READ price NOTIFY changed)     // "€3,99" in the shop's currency, "" until the store answered
  Q_PROPERTY(QString error READ error NOTIFY changed)
  Q_PROPERTY(bool owned READ owned NOTIFY changed)              // bought (not only the trial)
  Q_PROPERTY(int trialDays READ trialDays NOTIFY changed)       // days of the trial left (0: none running)
  Q_PROPERTY(bool trialAvailable READ trialAvailable NOTIFY changed)
public:
  explicit Store(QObject *parent = nullptr);
  static Store *instance;
  bool pro() const { return m_pro || trialDays() > 0; }
  bool owned() const { return m_pro; }
  int trialDays() const;
  bool trialAvailable() const { return m_inStore && !m_pro && m_trialStart == 0; }
  Q_INVOKABLE void startTrial();
  bool inStore() const { return m_inStore; }
  QString price() const { return m_price; }
  QString error() const { return m_error; }
  Q_INVOKABLE void buy();
  Q_INVOKABLE void restore();
  void update(bool known, bool pro, const QString &price, const QString &error);   // from the store (any thread)
signals:
  void changed();
  void bought();                                          // just bought or restored
private:
  bool m_pro = true, m_inStore = false;
  qint64 m_trialStart = 0;   // ms since 1970, 0: never
  QString m_price, m_error;
};
