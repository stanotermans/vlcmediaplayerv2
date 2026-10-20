#include "windowframe.h"
#include <QCoreApplication>
#ifdef Q_OS_WIN
#include <windows.h>
#include <windowsx.h>
#endif

WindowFrame::WindowFrame(QObject *parent) : QObject(parent) { QCoreApplication::instance()->installNativeEventFilter(this); }
WindowFrame::~WindowFrame() { if (auto *a = QCoreApplication::instance()) a->removeNativeEventFilter(this); }

void WindowFrame::setMaximizeButton(QQuickItem *i) {
  m_max = i; emit changed();
  // the native window may not exist yet (asking for it now would create it in the middle of QML's setup)
  if (i && i->window()) connect(i->window(), &QWindow::visibleChanged, this, &WindowFrame::style, Qt::UniqueConnection);
  style();
}
void WindowFrame::style() {
#ifdef Q_OS_WIN
  if (m_styled || !m_max || !m_max->window() || !m_max->window()->handle()) return;
  HWND h = reinterpret_cast<HWND>(m_max->window()->winId());
  LONG_PTR s = GetWindowLongPtrW(h, GWL_STYLE);
  SetWindowLongPtrW(h, GWL_STYLE, s | WS_MAXIMIZEBOX | WS_MINIMIZEBOX | WS_SYSMENU);   // no frame styles: the client area stays the whole window
  m_styled = true;
#endif
}

// x, y: client coordinates in device pixels
bool WindowFrame::overMaximize(int x, int y) const {
  if (!m_max || !m_max->window() || !m_max->isVisible()) return false;
  const qreal dpr = m_max->window()->devicePixelRatio();
  const QRectF r = m_max->mapRectToScene(QRectF(0, 0, m_max->width(), m_max->height()));
  return r.contains(QPointF(x / dpr, y / dpr));
}

bool WindowFrame::grab(const QString &file) {
  return m_max && m_max->window() && m_max->window()->grabWindow().save(file);
}

int WindowFrame::hitTestAt(int x, int y) {
#ifdef Q_OS_WIN
  if (!m_max || !m_max->window() || !m_max->window()->handle()) return -1;
  HWND h = reinterpret_cast<HWND>(m_max->window()->winId());
  POINT p { x, y }; ClientToScreen(h, &p);
  return int(SendMessageW(h, WM_NCHITTEST, 0, MAKELPARAM(p.x, p.y)));
#else
  Q_UNUSED(x) Q_UNUSED(y) return -1;
#endif
}

// result is null for messages Qt takes from the queue (mouse clicks among them): only write it when it is there (#64)
bool WindowFrame::nativeEventFilter(const QByteArray &type, void *message, qintptr *result) {
#ifdef Q_OS_WIN
  if (type != "windows_generic_MSG" || !m_max || !m_max->window() || !m_max->window()->handle()) return false;
  MSG *msg = static_cast<MSG *>(message);
  HWND h = reinterpret_cast<HWND>(m_max->window()->winId());
  if (msg->hwnd != h) return false;
  switch (msg->message) {
  case WM_NCHITTEST: {
    POINT p { GET_X_LPARAM(msg->lParam), GET_Y_LPARAM(msg->lParam) }; ScreenToClient(h, &p);
    if (overMaximize(p.x, p.y)) { if (result) *result = HTMAXBUTTON; return true; }
    return false;
  }
  case WM_NCMOUSEMOVE:
    if (msg->wParam == HTMAXBUTTON) {
      setHover(true);
      TRACKMOUSEEVENT t { sizeof t, TME_LEAVE | TME_NONCLIENT, h, 0 }; TrackMouseEvent(&t);
    } else setHover(false);
    return false;
  case WM_NCMOUSELEAVE: case WM_MOUSEMOVE: setHover(false); return false;
  case WM_NCLBUTTONDOWN: case WM_NCLBUTTONDBLCLK:
    if (msg->wParam == HTMAXBUTTON) { if (result) *result = 0; return true; }   // only the release counts, like a button
    return false;
  case WM_NCLBUTTONUP:
    if (msg->wParam == HTMAXBUTTON) {
      // #64: Windows' own command, after this message (changing Qt's window state from inside a native message made
      // Qt's state and the real one differ, and the next maximize crashed)
      PostMessageW(h, WM_SYSCOMMAND, IsZoomed(h) ? SC_RESTORE : SC_MAXIMIZE, 0);
      if (result) *result = 0;
      return true;
    }
    return false;
  }
#else
  Q_UNUSED(type) Q_UNUSED(message) Q_UNUSED(result)
#endif
  return false;
}
