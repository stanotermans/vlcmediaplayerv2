// macOS (#108): what makes Vela Player behave like a Mac app and needs AppKit / MediaPlayer:
//   - the window keeps the system's title bar with its three round buttons (close, minimise, full screen) top left;
//     the bar is see-through and the app draws under it (our own title bar's content sits next to the buttons)
//   - Now Playing: the ⏯ ⏭ ⏮ keys, Control Center and the lock screen (MPNowPlayingInfoCenter, MPRemoteCommandCenter)
//   - the picture-in-picture window floats over full-screen apps and shows on every Space
#include "mac.h"
#include <QWindow>
#import <AppKit/AppKit.h>
#import <MediaPlayer/MediaPlayer.h>

static NSWindow *nsWindow(QWindow *w) {
  if (!w || !w->handle()) return nil;
  NSView *v = reinterpret_cast<NSView *>(w->winId());
  return v ? v.window : nil;
}

void Mac::styleWindow(QWindow *w) {
  NSWindow *n = nsWindow(w);
  if (!n) return;
  n.styleMask |= NSWindowStyleMaskFullSizeContentView;   // (Qt sets the mask again when the window's state changes: call again then)
  n.titlebarAppearsTransparent = YES;
  n.titleVisibility = NSWindowTitleHidden;
}

void Mac::pipWindow(QWindow *w) {
  NSWindow *n = nsWindow(w);
  if (!n) return;
  n.level = NSFloatingWindowLevel;
  n.collectionBehavior |= NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;
}

// ---------- Now Playing ----------
static std::function<void(const QString &)> g_button;
static NSMutableDictionary *g_info;

void Mac::mediaAttach(std::function<void(const QString &)> button) {
  if (g_button) { g_button = button; return; }
  g_button = button;
  g_info = [[NSMutableDictionary alloc] init];
  MPRemoteCommandCenter *c = [MPRemoteCommandCenter sharedCommandCenter];
  auto add = [](MPRemoteCommand *cmd, const char *name) {
    const QString n = QString::fromLatin1(name);
    cmd.enabled = YES;
    [cmd addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *) {
      if (g_button) g_button(n);
      return MPRemoteCommandHandlerStatusSuccess;
    }];
  };
  add(c.playCommand, "play"); add(c.pauseCommand, "pause"); add(c.togglePlayPauseCommand, "play");
  add(c.nextTrackCommand, "next"); add(c.previousTrackCommand, "previous"); add(c.stopCommand, "stop");
}

void Mac::mediaState(const QString &state, double position, double duration) {
  if (!g_info) return;
  MPNowPlayingInfoCenter *c = [MPNowPlayingInfoCenter defaultCenter];
  if (state == "closed") { [g_info removeAllObjects]; c.nowPlayingInfo = nil; c.playbackState = MPNowPlayingPlaybackStateStopped; return; }
  const bool playing = state == "playing";
  g_info[MPNowPlayingInfoPropertyPlaybackRate] = @(playing ? 1.0 : 0.0);
  g_info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = @(position > 0 ? position : 0);
  if (duration > 0) g_info[MPMediaItemPropertyPlaybackDuration] = @(duration);
  c.nowPlayingInfo = g_info;
  c.playbackState = playing ? MPNowPlayingPlaybackStatePlaying : state == "paused" ? MPNowPlayingPlaybackStatePaused : MPNowPlayingPlaybackStateStopped;
}

void Mac::mediaInfo(const QString &title, const QString &artist, const QString &album, bool music) {
  if (!g_info) return;
  [g_info removeAllObjects];
  g_info[MPMediaItemPropertyTitle] = title.toNSString();
  if (!artist.isEmpty()) g_info[MPMediaItemPropertyArtist] = artist.toNSString();
  if (!album.isEmpty()) g_info[MPMediaItemPropertyAlbumTitle] = album.toNSString();
  g_info[MPNowPlayingInfoPropertyMediaType] = @(music ? MPNowPlayingInfoMediaTypeAudio : MPNowPlayingInfoMediaTypeVideo);
  [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = g_info;
}
