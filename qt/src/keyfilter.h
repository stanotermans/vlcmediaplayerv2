// KeyFilter: every key press of the application, named like v2.x names them (KeyboardEvent.key with modifier prefixes:
// "k", "S" (Shift+s), "Ctrl+b", "Space", "Shift+Space", "ArrowRight", "Shift+ArrowLeft", "MediaPlayPause", "F11"),
// handed to a QML function that returns true when it used the key. Keys typed into a text field are left alone
// (except Escape, which leaves the field). Releases are reported too (hold Shift+Space for 2×).
#pragma once
#include <QJSValue>
#include <QObject>
#include <QtQml/qqmlregistration.h>

class KeyFilter : public QObject {
  Q_OBJECT
  QML_ELEMENT
  Q_PROPERTY(QJSValue handler READ handler WRITE setHandler)   // (name, repeat, code) => bool
  Q_PROPERTY(bool enabled MEMBER m_enabled)
public:
  explicit KeyFilter(QObject *parent = nullptr);
  ~KeyFilter() override;
  QJSValue handler() const { return m_handler; }
  void setHandler(const QJSValue &h) { m_handler = h; }
  static QString name(int key, Qt::KeyboardModifiers mods, const QString &text);
  Q_INVOKABLE QString nameOf(int key, int mods, const QString &text) const { return name(key, Qt::KeyboardModifiers(mods), text); }
signals:
  void released(int code);
protected:
  bool eventFilter(QObject *o, QEvent *e) override;
private:
  QJSValue m_handler;
  bool m_enabled = true;
};
