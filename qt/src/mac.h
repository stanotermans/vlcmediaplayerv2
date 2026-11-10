// macOS (#108): the system's window buttons, Now Playing (media keys, Control Center) and the PiP window (mac.mm)
#pragma once
#include <QString>
#include <functional>
class QWindow;

namespace Mac {
void styleWindow(QWindow *w);     // the system title bar, see-through, the app's content under it
void pipWindow(QWindow *w);       // floats over full-screen apps, on every Space
void mediaAttach(std::function<void(const QString &)> button);   // "play", "pause", "next", "previous", "stop" (main thread)
void mediaState(const QString &state, double position, double duration);   // "playing", "paused", "stopped", "closed"; seconds
void mediaInfo(const QString &title, const QString &artist, const QString &album, bool music);
}
