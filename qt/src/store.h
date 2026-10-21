// Vela Player Pro (#53): the one-time purchase in the app stores (Android: Google Play Billing, product "vela_pro").
// It unlocks the equalizer and audio effects, the video filters and 360°, the themes and accent colours, and
// OpenSubtitles, recording and snapshots. The desktop version has everything (pro is always true there).
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
public:
  explicit Store(QObject *parent = nullptr);
  static Store *instance;
  bool pro() const { return m_pro; }
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
  void remember();
  bool m_pro = true, m_inStore = false;
  QString m_price, m_error;
};
