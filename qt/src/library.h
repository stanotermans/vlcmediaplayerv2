// Library: everything v2.x keeps about your media (app.js "state" and main.js expand/probe/thumbnail). The media
// list, playlists, recently played, watched marks and positions, saved as library.json in the app's data folder.
// Files are read with `ffmpeg -i` (duration, video or audio, artist/album) and get a thumbnail from the slim FFmpeg,
// two at a time in the background; the file you are about to play skips the line (hurry).
#pragma once
#include <QHash>
#include <QObject>
#include <QSet>
#include <QThreadPool>
#include <QTimer>
#include <QVariantList>
#include <QtQml/qqmlregistration.h>

class ProbeJob;

class Library : public QObject {
  Q_OBJECT
  QML_ELEMENT
  // items: [{ src, name, remote, type ("video"/"audio"), thumb, duration, added, manual, ready, album, artist,
  //           format, vcodec, width, height, audio: [..], subs: [..] }]
  Q_PROPERTY(QVariantList items READ items NOTIFY itemsChanged)
  Q_PROPERTY(QVariantList playlists READ playlists NOTIFY playlistsChanged)   // [{ name, srcs, cover }]
  Q_PROPERTY(QStringList recent READ recent NOTIFY recentChanged)
  Q_PROPERTY(QVariantMap watched READ watched NOTIFY watchedChanged)          // { src: true }
  Q_PROPERTY(QVariantMap positions READ positions NOTIFY positionsChanged)    // { src: seconds }
  Q_PROPERTY(int busy READ busy NOTIFY busyChanged)                           // files still being read
  // from the settings: thumbnails on/off, "Remember recently played" (off: nothing about what you watched is kept)
  Q_PROPERTY(bool thumbs MEMBER m_thumbs NOTIFY optionsChanged)
  Q_PROPERTY(bool remember MEMBER m_remember NOTIFY optionsChanged)
  Q_PROPERTY(QString playing MEMBER m_playing NOTIFY optionsChanged)          // never dropped by a folder scan
public:
  explicit Library(QObject *parent = nullptr);
  ~Library() override;
  QVariantList items() const { return m_items; }
  QVariantList playlists() const { return m_playlists; }
  QStringList recent() const { return m_recent; }
  QVariantMap watched() const { return m_watched; }
  QVariantMap positions() const { return m_positions; }
  int busy() const { return m_busy; }

  Q_INVOKABLE void load();
  // files, folders (read up to 6 levels deep) and playlist files; returns the paths of all media that were given
  // (new or already there) in order. keepLists: save opened playlist files under Playlists (Import playlist…).
  Q_INVOKABLE QStringList addSources(const QStringList &srcs, bool manual = true, bool keepLists = false);
  Q_INVOKABLE void scanFolders(const QStringList &folders);   // the media folders of the settings
  Q_INVOKABLE void remove(const QStringList &srcs);
  Q_INVOKABLE void hurry(const QString &src);
  Q_INVOKABLE int indexOf(const QString &src) const { return m_index.value(src, -1); }
  Q_INVOKABLE QVariantMap item(const QString &src) const { const int i = indexOf(src); return i < 0 ? QVariantMap() : m_items[i].toMap(); }

  Q_INVOKABLE void setWatched(const QStringList &srcs, bool on);
  Q_INVOKABLE void setPosition(const QString &src, double secs);
  Q_INVOKABLE void addRecent(const QString &src);

  Q_INVOKABLE int createPlaylist(const QString &name, const QStringList &srcs, const QString &cover);
  Q_INVOKABLE void renamePlaylist(int i, const QString &name);
  Q_INVOKABLE void setPlaylistCover(int i, const QString &cover);
  Q_INVOKABLE void deletePlaylist(int i);
  Q_INVOKABLE void addToPlaylist(int i, const QStringList &srcs);
  Q_INVOKABLE void removeFromPlaylist(int i, const QStringList &srcs);
  Q_INVOKABLE void movePlaylistItem(int i, const QString &src, const QString &target, bool after);
  Q_INVOKABLE bool exportPlaylist(const QString &name, const QStringList &srcs, const QString &file);

  Q_INVOKABLE QString readImage(const QString &file) const;   // a cover as a data: URL (kept in library.json, like v2.x)
  Q_INVOKABLE void reveal(const QString &path) const;         // "Show in folder"
  Q_INVOKABLE void openPath(const QString &path) const;
  Q_INVOKABLE QString toLocal(const QVariant &url) const;     // file:///… (drops, file dialogs) → a path
  Q_INVOKABLE QStringList expandMedia(const QStringList &paths) const { QStringList l; for (const QString &p : paths) l << toLocal(p); return expand(l); }

  static QString itemName(const QString &src);
signals:
  void itemsChanged();
  void playlistsChanged();
  void recentChanged();
  void watchedChanged();
  void positionsChanged();
  void busyChanged();
  void optionsChanged();
  void message(const QString &text);          // shown by the interface (osd)
private:
  friend class ProbeJob;
  void probe(const QString &src);
  void probed(const QString &src, const QVariantMap &info);
  QStringList expand(const QStringList &paths, int depth = 0) const;
  QVariantMap readPlaylist(const QString &file) const;
  void changed();                              // items changed: tell QML (at most every 250 ms) and save
  void save();
  QString dataDir() const;

  QVariantList m_items, m_playlists;
  QHash<QString, int> m_index;
  QStringList m_recent;
  QVariantMap m_watched, m_positions;
  void addOne(const QString &src, bool manual, qint64 added, bool *isNew);
  QStringList m_folders;                       // the media folders of the last scan
  QString m_playing;
  bool m_thumbs = true, m_remember = true, m_loading = false;
  int m_busy = 0;
  QThreadPool m_pool;
  QHash<QString, ProbeJob *> m_waiting;
  QTimer m_notify, m_saveTimer;
};
