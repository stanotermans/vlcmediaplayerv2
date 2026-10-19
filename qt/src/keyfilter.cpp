#include "keyfilter.h"
#include <QGuiApplication>
#include <QKeyEvent>
#include <QQuickItem>
#include <QWindow>

KeyFilter::KeyFilter(QObject *parent) : QObject(parent) { qApp->installEventFilter(this); }
KeyFilter::~KeyFilter() { qApp->removeEventFilter(this); }

QString KeyFilter::name(int key, Qt::KeyboardModifiers mods, const QString &text) {
  static const QHash<int, QString> NAMES = {
    { Qt::Key_Left, "ArrowLeft" }, { Qt::Key_Right, "ArrowRight" }, { Qt::Key_Up, "ArrowUp" }, { Qt::Key_Down, "ArrowDown" },
    { Qt::Key_Escape, "Escape" }, { Qt::Key_Return, "Enter" }, { Qt::Key_Enter, "Enter" }, { Qt::Key_Tab, "Tab" },
    { Qt::Key_Backspace, "Backspace" }, { Qt::Key_Delete, "Delete" }, { Qt::Key_Home, "Home" }, { Qt::Key_End, "End" },
    { Qt::Key_PageUp, "PageUp" }, { Qt::Key_PageDown, "PageDown" }, { Qt::Key_Insert, "Insert" },
    { Qt::Key_MediaPlay, "MediaPlayPause" }, { Qt::Key_MediaPause, "MediaPlayPause" }, { Qt::Key_MediaTogglePlayPause, "MediaPlayPause" },
    { Qt::Key_MediaNext, "MediaTrackNext" }, { Qt::Key_MediaPrevious, "MediaTrackPrevious" }, { Qt::Key_MediaStop, "MediaStop" },
  };
  const QString pre = QString(mods & Qt::ControlModifier ? "Ctrl+" : "") + (mods & Qt::AltModifier ? "Alt+" : "");
  const bool shift = mods & Qt::ShiftModifier;
  if (key == Qt::Key_Space) return pre + (shift ? "Shift+" : "") + "Space";
  if (key >= Qt::Key_F1 && key <= Qt::Key_F24) return pre + (shift ? "Shift+" : "") + "F" + QString::number(key - Qt::Key_F1 + 1);
  if (NAMES.contains(key)) return pre + (shift ? "Shift+" : "") + NAMES[key];
  // a printable key: the character itself (its case says Shift); with Ctrl the text is a control code, so the key
  if (key >= Qt::Key_A && key <= Qt::Key_Z && (mods & (Qt::ControlModifier | Qt::AltModifier))) {
    const QChar c = QChar('a' + (key - Qt::Key_A));
    return pre + (shift ? c.toUpper() : c);
  }
  if (text.size() == 1 && text[0].isPrint()) return pre + text;
  if (key >= 0x20 && key < 0x7f) return pre + QChar(key).toLower();
  return {};
}

bool KeyFilter::eventFilter(QObject *o, QEvent *e) {
  if (e->type() != QEvent::KeyPress && e->type() != QEvent::KeyRelease) return false;
  if (!m_enabled || !qobject_cast<QWindow *>(o)) return false;          // once per key: at the window
  auto *k = static_cast<QKeyEvent *>(e);
  if (e->type() == QEvent::KeyRelease) { if (!k->isAutoRepeat()) emit released(k->key()); return false; }
  // typing into a text field: only Escape (leave the field) passes
  QObject *f = QGuiApplication::focusObject();
  const bool typing = f && (f->inherits("QQuickTextInput") || f->inherits("QQuickTextEdit"));
  if (typing) {
    if (k->key() == Qt::Key_Escape) { if (auto *it = qobject_cast<QQuickItem *>(f)) it->setFocus(false); }
    return false;
  }
  if (!m_handler.isCallable()) return false;
  const QString n = name(k->key(), k->modifiers(), k->text());
  if (n.isEmpty()) return false;
  const QJSValue r = m_handler.call({ n, k->isAutoRepeat(), k->key() });
  return r.toBool();
}
