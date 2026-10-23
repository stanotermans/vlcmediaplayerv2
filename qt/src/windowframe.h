// WindowFrame: Windows details for our own title bar. The window keeps a real frame (resize border, caption,
// minimise/maximise), but its content covers the whole window (WM_NCCALCSIZE): Windows 11 then rounds the corners and
// draws the shadow like for other windows (#65), and Win+arrows and Aero snap work. Over the maximise button the window
// tells Windows it is the maximise button (HTMAXBUTTON), so Windows 11 shows its snap layouts there.
#pragma once
#include <QAbstractNativeEventFilter>
#include <QObject>
#include <QPointer>
#include <QSizeF>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtQml/qqmlregistration.h>

class WindowFrame : public QObject, public QAbstractNativeEventFilter {
  Q_OBJECT
  QML_ELEMENT
  Q_PROPERTY(QQuickItem *maximizeButton READ maximizeButton WRITE setMaximizeButton NOTIFY changed)
  Q_PROPERTY(bool maximizeHovered READ maximizeHovered NOTIFY hoverChanged)
  // #89: while the window is resized it keeps this shape (width / height of the video, 0: free) for the window
  // minus extra (the bars round the video)
  Q_PROPERTY(double aspect MEMBER m_aspect NOTIFY changed)
  Q_PROPERTY(QSizeF extra MEMBER m_extra NOTIFY changed)
public:
  explicit WindowFrame(QObject *parent = nullptr);
  ~WindowFrame() override;
  QQuickItem *maximizeButton() const { return m_max; }
  void setMaximizeButton(QQuickItem *i);
  bool maximizeHovered() const { return m_hover; }
  double aspect() const { return m_aspect; }
  QSizeF extra() const { return m_extra; }
  bool nativeEventFilter(const QByteArray &type, void *message, qintptr *result) override;
  Q_INVOKABLE int hitTestAt(int x, int y);   // testing: what Windows is told at this window point (device pixels)
  Q_INVOKABLE bool grab(const QString &file);  // testing: saves the whole window (dialogs and menus included)
  Q_INVOKABLE QSize sizingAt(int edge, int w, int h);   // testing: the size Windows gets while edge (WMSZ_*) is dragged
  // #80: in fullscreen no window border (Windows 11 draws a thin light line round the window) and square corners
  Q_INVOKABLE void setFullscreen(bool on);
signals:
  void changed();
  void hoverChanged();
private:
  void setHover(bool h) { if (h != m_hover) { m_hover = h; emit hoverChanged(); } }
  bool overMaximize(int x, int y) const;
  void style();
  QPointer<QQuickItem> m_max;
  bool m_hover = false, m_styled = false, m_styleQueued = false;
  double m_aspect = 0;
  QSizeF m_extra;
};
