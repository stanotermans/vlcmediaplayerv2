// WindowFrame: Windows details for our own title bar. Over the maximise button the window tells Windows it is the
// maximise button (HTMAXBUTTON), so Windows 11 shows its snap layouts there; clicks on it maximise / restore. The
// window keeps the minimise/maximise styles, so Win+arrows and Aero snap work. Elsewhere it does nothing.
#pragma once
#include <QAbstractNativeEventFilter>
#include <QObject>
#include <QPointer>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtQml/qqmlregistration.h>

class WindowFrame : public QObject, public QAbstractNativeEventFilter {
  Q_OBJECT
  QML_ELEMENT
  Q_PROPERTY(QQuickItem *maximizeButton READ maximizeButton WRITE setMaximizeButton NOTIFY changed)
  Q_PROPERTY(bool maximizeHovered READ maximizeHovered NOTIFY hoverChanged)
public:
  explicit WindowFrame(QObject *parent = nullptr);
  ~WindowFrame() override;
  QQuickItem *maximizeButton() const { return m_max; }
  void setMaximizeButton(QQuickItem *i);
  bool maximizeHovered() const { return m_hover; }
  bool nativeEventFilter(const QByteArray &type, void *message, qintptr *result) override;
  Q_INVOKABLE int hitTestAt(int x, int y);   // testing: what Windows is told at this window point (device pixels)
  Q_INVOKABLE bool grab(const QString &file);  // testing: saves the whole window (dialogs and menus included)
signals:
  void changed();
  void hoverChanged();
private:
  void setHover(bool h) { if (h != m_hover) { m_hover = h; emit hoverChanged(); } }
  bool overMaximize(int x, int y) const;
  void style();
  QPointer<QQuickItem> m_max;
  bool m_hover = false, m_styled = false;
};
