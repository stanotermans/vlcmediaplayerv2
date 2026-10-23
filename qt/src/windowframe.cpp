#include "windowframe.h"
#include <QCoreApplication>
#include <QPainterPath>
#include <QRegion>
#ifdef Q_OS_WIN
#include <windows.h>
#include <windowsx.h>
#include <dwmapi.h>
#include <commctrl.h>
#endif

#ifdef Q_OS_WIN
// #89: the shape follows the edge that is dragged; the corners take the larger size. (Qt keeps WM_SIZING from the
// native event filters: the window's own procedure is subclassed for it.)
static LRESULT CALLBACK sizingProc(HWND h, UINT m, WPARAM wp, LPARAM lp, UINT_PTR, DWORD_PTR self) {
  auto *f = reinterpret_cast<WindowFrame *>(self);
  if (m == WM_SIZING && f->aspect() > 0 && f->maximizeButton() && f->maximizeButton()->window()) {
    RECT *r = reinterpret_cast<RECT *>(lp);
    const qreal dpr = f->maximizeButton()->window()->devicePixelRatio();
    const double ex = f->extra().width() * dpr, ey = f->extra().height() * dpr, a = f->aspect();
    double w = r->right - r->left, ht = r->bottom - r->top;
    const double hFromW = ey + (w - ex) / a, wFromH = ex + (ht - ey) * a;
    const bool horiz = wp == WMSZ_LEFT || wp == WMSZ_RIGHT, vert = wp == WMSZ_TOP || wp == WMSZ_BOTTOM;
    if (horiz || (!vert && hFromW >= ht)) ht = hFromW; else w = wFromH;
    if (wp == WMSZ_LEFT || wp == WMSZ_TOPLEFT || wp == WMSZ_BOTTOMLEFT) r->left = r->right - LONG(qRound(w)); else r->right = r->left + LONG(qRound(w));
    if (wp == WMSZ_TOP || wp == WMSZ_TOPLEFT || wp == WMSZ_TOPRIGHT) r->top = r->bottom - LONG(qRound(ht)); else r->bottom = r->top + LONG(qRound(ht));
    return TRUE;
  }
  if (m == WM_NCDESTROY) RemoveWindowSubclass(h, sizingProc, 1);
  return DefSubclassProc(h, m, wp, lp);
}
#endif

WindowFrame::WindowFrame(QObject *parent) : QObject(parent) { QCoreApplication::instance()->installNativeEventFilter(this); }
WindowFrame::~WindowFrame() {
  if (auto *a = QCoreApplication::instance()) a->removeNativeEventFilter(this);
#ifdef Q_OS_WIN
  if (m_styled && m_max && m_max->window() && m_max->window()->handle())
    RemoveWindowSubclass(reinterpret_cast<HWND>(m_max->window()->winId()), sizingProc, 1);
#endif
}

void WindowFrame::setCorner(int r) {
  if (r == m_corner) return;
  m_corner = r; emit changed();
  applyMask();
}

// the window without its four corners (the X11 shape extension: no alpha channel needed); again with every size
void WindowFrame::applyMask() {
  QWindow *w = m_max ? m_max->window() : nullptr;
  if (!w) return;
  connect(w, &QWindow::widthChanged, this, &WindowFrame::applyMask, Qt::UniqueConnection);
  connect(w, &QWindow::heightChanged, this, &WindowFrame::applyMask, Qt::UniqueConnection);
  if (m_corner <= 0) { if (!w->mask().isEmpty()) w->setMask(QRegion()); return; }
  QPainterPath p; p.addRoundedRect(QRectF(0, 0, w->width(), w->height()), m_corner, m_corner);
  w->setMask(QRegion(p.toFillPolygon().toPolygon()));
}

bool WindowFrame::masked() const { return m_max && m_max->window() && !m_max->window()->mask().isEmpty(); }

void WindowFrame::setMaximizeButton(QQuickItem *i) {
  m_max = i; emit changed();
  applyMask();
  // the native window may not exist yet (asking for it now would create it in the middle of QML's setup)
  if (i && i->window()) connect(i->window(), &QWindow::visibleChanged, this, &WindowFrame::style, Qt::UniqueConnection);
  style();   // (and from the first message of the window below, if it did not exist yet)
}
void WindowFrame::setFullscreen(bool on) {
#ifdef Q_OS_WIN
  if (!m_max || !m_max->window() || !m_max->window()->handle()) return;
  HWND h = reinterpret_cast<HWND>(m_max->window()->winId());
  const COLORREF border = on ? 0xFFFFFFFE /* DWMWA_COLOR_NONE */ : 0xFFFFFFFF /* DWMWA_COLOR_DEFAULT */;
  DwmSetWindowAttribute(h, 34 /* DWMWA_BORDER_COLOR */, &border, sizeof border);
  const DWORD corners = on ? 1 /* DWMWCP_DONOTROUND */ : 2 /* DWMWCP_ROUND */;
  DwmSetWindowAttribute(h, 33 /* DWMWA_WINDOW_CORNER_PREFERENCE */, &corners, sizeof corners);
#else
  Q_UNUSED(on);
#endif
}

void WindowFrame::style() {
#ifdef Q_OS_WIN
  m_styleQueued = false;
  if (m_styled || !m_max || !m_max->window() || !m_max->window()->handle()) return;
  HWND h = reinterpret_cast<HWND>(m_max->window()->winId());
  // a real frame (WM_NCCALCSIZE below keeps the content over all of it): rounded corners and shadow on Windows 11
  LONG_PTR s = GetWindowLongPtrW(h, GWL_STYLE);
  m_styled = true;   // before SetWindowPos: its WM_NCCALCSIZE must already cover the frame
  SetWindowSubclass(h, sizingProc, 1, reinterpret_cast<DWORD_PTR>(this));
  SetWindowLongPtrW(h, GWL_STYLE, s | WS_MAXIMIZEBOX | WS_MINIMIZEBOX | WS_SYSMENU | WS_THICKFRAME | WS_CAPTION);
  SetWindowPos(h, nullptr, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
  // #65: and ask for round corners (Windows 11 keeps popup-style windows square otherwise; Windows 10 ignores it)
  const DWORD round = 2;   // DWMWCP_ROUND
  DwmSetWindowAttribute(h, 33 /* DWMWA_WINDOW_CORNER_PREFERENCE */, &round, sizeof round);
#endif
}

// x, y: client coordinates in device pixels
bool WindowFrame::overMaximize(int x, int y) const {
  if (!m_max || !m_max->window() || !m_max->isVisible()) return false;
  const qreal dpr = m_max->window()->devicePixelRatio();
  const QRectF r = m_max->mapRectToScene(QRectF(0, 0, m_max->width(), m_max->height()));
  return r.contains(QPointF(x / dpr, y / dpr));
}

QSize WindowFrame::sizingAt(int edge, int w, int h) {
#ifdef Q_OS_WIN
  if (!m_max || !m_max->window() || !m_max->window()->handle()) return {};
  RECT r { 0, 0, w, h };
  SendMessageW(reinterpret_cast<HWND>(m_max->window()->winId()), WM_SIZING, WPARAM(edge), LPARAM(&r));
  return QSize(r.right - r.left, r.bottom - r.top);
#else
  Q_UNUSED(edge) Q_UNUSED(w) Q_UNUSED(h) return {};
#endif
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
  if (!m_styled && !m_styleQueued) { m_styleQueued = true; QMetaObject::invokeMethod(this, &WindowFrame::style, Qt::QueuedConnection); }
  switch (msg->message) {
  case WM_NCCALCSIZE:
    if (!m_styled || !msg->wParam) return false;
    if (IsZoomed(h)) {   // maximised, Windows puts the frame outside the screen: keep the content on it
      auto *p = reinterpret_cast<NCCALCSIZE_PARAMS *>(msg->lParam);
      const UINT dpi = GetDpiForWindow(h);
      const int fx = GetSystemMetricsForDpi(SM_CXFRAME, dpi) + GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi);
      const int fy = GetSystemMetricsForDpi(SM_CYFRAME, dpi) + GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi);
      p->rgrc[0].left += fx; p->rgrc[0].right -= fx; p->rgrc[0].top += fy; p->rgrc[0].bottom -= fy;
    }
    if (result) *result = 0;   // the content covers the whole window (no frame drawn)
    return true;
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
