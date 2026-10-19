#include "system.h"
#include <QCoreApplication>
#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QLocalSocket>
#include <QNetworkReply>
#include <QProcess>
#include <QRegularExpression>
#include <QSettings>
#include <QStandardPaths>
#include <QSysInfo>
#include <QTimer>
#include <QUrl>
#include <QWindow>
#ifdef Q_OS_WIN
#include <windows.h>
#include <wrl.h>
#include <wrl/wrappers/corewrappers.h>
#include <roapi.h>
#include <windows.media.h>
#include <systemmediatransportcontrolsinterop.h>
using namespace Microsoft::WRL;
using namespace Microsoft::WRL::Wrappers;
using namespace ABI::Windows::Media;
using namespace ABI::Windows::Foundation;
#endif

static const char *REPO = "stanotermans/vlcmediaplayerv2";
System *System::instance = nullptr;
static QString serverName() { return "vlc-redesign-3-" + QString::fromLocal8Bit(qgetenv("USERNAME").isEmpty() ? qgetenv("USER") : qgetenv("USERNAME")); }

System::System(QObject *parent) : QObject(parent) { instance = this; }
System::~System() {
#ifdef Q_OS_WIN
  if (m_smtc) static_cast<ISystemMediaTransportControls *>(m_smtc)->Release();
#endif
  if (instance == this) instance = nullptr;
}

// ---------- one running app ----------
QStringList System::pathsFromArgs(const QStringList &args) {
  QStringList out;
  for (int i = 1; i < args.size(); i++) {
    const QString a = args[i];
    if (a.startsWith("--") || a.startsWith("-psn_")) continue;
    if (QRegularExpression("^[a-z][a-z0-9+.-]*://", QRegularExpression::CaseInsensitiveOption).match(a).hasMatch()) out << a;
    else if (QFileInfo::exists(a)) out << QDir::toNativeSeparators(QFileInfo(a).absoluteFilePath());
  }
  return out;
}
bool System::forwardToRunning(const QStringList &paths) {
  QLocalSocket s;
  s.connectToServer(serverName());
  if (!s.waitForConnected(500)) return false;
  s.write(QJsonDocument(QJsonArray::fromStringList(paths)).toJson(QJsonDocument::Compact) + "\n");
  s.waitForBytesWritten(1000);
  s.disconnectFromServer();
  return true;
}
void System::listen() {
  QLocalServer::removeServer(serverName());   // a crashed run may have left it
  connect(&m_server, &QLocalServer::newConnection, this, [this]() {
    while (QLocalSocket *c = m_server.nextPendingConnection()) {
      // read the whole message once it is complete
      connect(c, &QLocalSocket::disconnected, this, [this, c]() {
        const QByteArray data = c->readAll();
        c->deleteLater();
        const QJsonArray a = QJsonDocument::fromJson(data).array();
        QStringList paths; for (const auto &v : a) paths << v.toString();
        emit openPaths(paths);
      });
    }
  });
  m_server.listen(serverName());
}

QString System::version() const { return QCoreApplication::applicationVersion(); }
// the portable Windows version has a file "portable" next to the program (and keeps its data there)
bool System::portable() const { return QFile::exists(QCoreApplication::applicationDirPath() + "/portable"); }

// ---------- "Set as default player" ----------
// Windows: apps may not make themselves the default, so open Settings → Default apps, right on VLC Redesign when the
// installer registered it. Linux: set it with xdg-mime for every type the app's menu entry lists. macOS: no API.
QString System::setDefaultPlayer() {
#ifdef Q_OS_WIN
  auto has = [](const char *root) { return QSettings(QString(root) + "\\Software\\RegisteredApplications", QSettings::NativeFormat).contains("VLC Redesign"); };
  const QString where = has("HKEY_CURRENT_USER") ? "registeredAppUser" : has("HKEY_LOCAL_MACHINE") ? "registeredAppMachine" : "";
  QDesktopServices::openUrl(QUrl("ms-settings:defaultapps" + (where.isEmpty() ? QString() : "?" + where + "=VLC%20Redesign")));
  return where.isEmpty()
    ? tr("Windows Settings is open on Default apps. Search for a file type such as .mp4 and choose VLC Redesign. (The portable version does not appear there; use the installer for that.)")
    : tr("Windows Settings is open. Choose “Set default” at the top (Windows 11), or pick VLC Redesign for each file type you want.");
#elif defined(Q_OS_MACOS)
  return tr("In Finder, select a video or song, press ⌘I (Get Info), choose VLC Redesign under “Open with” and click “Change All…”. Do this once for each file type, for example .mp4, .mkv and .mp3.");
#else
  QString desktop;
  for (const QString &d : { QDir::homePath() + "/.local/share/applications", QString("/usr/local/share/applications"), QString("/usr/share/applications") }) {
    const QStringList names = QDir(d).entryList({ "*.desktop" });
    for (const QString &n : names) if (n.contains("vlc-redesign", Qt::CaseInsensitive)) { desktop = d + "/" + n; break; }
    if (!desktop.isEmpty()) break;
  }
  if (desktop.isEmpty()) return tr("VLC Redesign is not in your app menu yet. Install the .deb, .rpm or Arch package, or add the AppImage to your app menu first (for example with Gear Lever or AppImageLauncher).");
  QFile f(desktop); f.open(QIODevice::ReadOnly);
  const auto m = QRegularExpression("^MimeType=(.*)$", QRegularExpression::MultilineOption).match(QString::fromUtf8(f.readAll()));
  const QStringList types = m.hasMatch() ? m.captured(1).split(';', Qt::SkipEmptyParts) : QStringList();
  if (types.isEmpty()) return tr("VLC Redesign is not in your app menu yet. Install the .deb, .rpm or Arch package, or add the AppImage to your app menu first (for example with Gear Lever or AppImageLauncher).");
  const int r = QProcess::execute("xdg-mime", QStringList{ "default", QFileInfo(desktop).fileName() } + types);
  return r == 0 ? tr("Done: VLC Redesign now opens %1 kinds of video and audio files.").arg(types.size())
                : tr("That did not work here (xdg-mime is missing). Choose VLC Redesign under Default applications in your system settings.");
#endif
}

// ---------- updates (GitHub releases) ----------
static int cmpVer(const QString &a, const QString &b) {
  const QStringList x = QString(a).remove(QRegularExpression("^v")).split('.'), y = QString(b).remove(QRegularExpression("^v")).split('.');
  for (int i = 0; i < 3; i++) { const int p = x.value(i).toInt(), q = y.value(i).toInt(); if (p != q) return p > q ? 1 : -1; }
  return 0;
}
void System::setUpdate(const QString &state, const QString &error) { m_update["state"] = state; m_update["error"] = error; emit updateChanged(); }
void System::checkUpdates(bool manual) {
  const QString st = m_update["state"].toString();
  if (st == "checking" || st == "downloading") return;
  m_update["manual"] = manual;
  setUpdate("checking");
  QNetworkRequest r(QUrl(QString("https://api.github.com/repos/%1/releases/latest").arg(REPO)));
  r.setRawHeader("User-Agent", "vlc-redesign"); r.setRawHeader("Accept", "application/vnd.github+json"); r.setTransferTimeout(20000);
  QNetworkReply *rep = m_net.get(r);
  connect(rep, &QNetworkReply::finished, this, [this, rep]() {
    rep->deleteLater();
    if (rep->error() != QNetworkReply::NoError) return setUpdate("error", rep->errorString());
    const QJsonObject j = QJsonDocument::fromJson(rep->readAll()).object();
    const QString latest = j["tag_name"].toString().remove(QRegularExpression("^v"));
    // the download for this system (the update replaces itself where it can)
    auto find = [&](const QRegularExpression &re) { for (const auto &a : j["assets"].toArray()) if (re.match(a.toObject()["name"].toString()).hasMatch()) return a.toObject(); return QJsonObject(); };
    QJsonObject asset; QString mode = "page";
#ifdef Q_OS_WIN
    asset = portable() ? find(QRegularExpression("Portable-.*\\.exe$")) : find(QRegularExpression("Setup-.*x64\\.exe$")); mode = portable() ? "download" : "install";
#elif defined(Q_OS_MACOS)
    asset = find(QRegularExpression(QString("mac-%1\\.dmg$").arg(QSysInfo::currentCpuArchitecture() == "arm64" ? "arm64" : "x64"))); mode = "download";
#else
    if (qEnvironmentVariableIsSet("APPIMAGE")) { asset = find(QRegularExpression("\\.AppImage$")); mode = "install"; }
#endif
    if (asset.isEmpty()) mode = "page";
    QVariantMap info{ { "current", version() }, { "latest", latest }, { "newer", cmpVer(latest, version()) > 0 }, { "url", j["html_url"].toString() }, { "mode", mode } };
    if (!asset.isEmpty()) info["asset"] = QVariantMap{ { "name", asset["name"].toString() }, { "url", asset["browser_download_url"].toString() }, { "size", asset["size"].toDouble() } };
    m_update["info"] = info;
    setUpdate(info["newer"].toBool() ? "available" : "latest");
  });
}
void System::installUpdate() {
  const QVariantMap info = m_update["info"].toMap();
  const QVariantMap asset = info["asset"].toMap();
  if (asset.isEmpty()) { QDesktopServices::openUrl(QUrl(info["url"].toString())); setUpdate("page"); return; }
  const QUrl u(asset["url"].toString());
  if (u.scheme() != "https" || u.host() != "github.com" || !u.path().startsWith(QString("/%1/releases/download/").arg(REPO))) { setUpdate("error", "Unexpected download URL"); return; }
  const QString mode = info["mode"].toString();
  const QString dir = mode == "install" ?
#ifdef Q_OS_WIN
    QStandardPaths::writableLocation(QStandardPaths::TempLocation)
#else
    QFileInfo(qEnvironmentVariable("APPIMAGE")).absolutePath()
#endif
    : QStandardPaths::writableLocation(QStandardPaths::DownloadLocation);
  const QString file = dir + "/" + QFileInfo(u.path()).fileName();
  auto *out = new QFile(file + ".part");
  if (!out->open(QIODevice::WriteOnly)) { delete out; setUpdate("error", "Cannot write " + file); return; }
  m_update["progress"] = 0.0; setUpdate("downloading");
  QNetworkRequest r(u); r.setRawHeader("User-Agent", "vlc-redesign");
  r.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::NoLessSafeRedirectPolicy);
  QNetworkReply *rep = m_net.get(r);
  connect(rep, &QNetworkReply::readyRead, this, [rep, out]() { out->write(rep->readAll()); });
  connect(rep, &QNetworkReply::downloadProgress, this, [this, asset](qint64 got, qint64 total) {
    if (total <= 0) total = qint64(asset["size"].toDouble());
    m_update["progress"] = total > 0 ? double(got) / total : 0.0; emit updateChanged();
  });
  connect(rep, &QNetworkReply::finished, this, [this, rep, out, file, mode]() {
    rep->deleteLater(); out->write(rep->readAll()); out->close();
    if (rep->error() != QNetworkReply::NoError) { out->remove(); delete out; return setUpdate("error", rep->errorString()); }
    QFile::remove(file); out->rename(file); delete out;
    m_update["progress"] = 1.0;
#ifdef Q_OS_WIN
    if (mode == "install") {   // the installer, silent; it starts the new version when it is done
      QProcess::startDetached(file, { "/S", "--force-run" });
      setUpdate("installing"); QTimer::singleShot(400, qApp, &QCoreApplication::quit); return;
    }
#else
    if (mode == "install" && qEnvironmentVariableIsSet("APPIMAGE")) {
      QFile(file).setPermissions(QFile(file).permissions() | QFileDevice::ExeOwner | QFileDevice::ExeUser);
      const QString old = qEnvironmentVariable("APPIMAGE"); if (QFileInfo(old).absoluteFilePath() != QFileInfo(file).absoluteFilePath()) QFile::remove(old);
      QProcess::startDetached(file, {}); setUpdate("installing"); QTimer::singleShot(400, qApp, &QCoreApplication::quit); return;
    }
#endif
    QDesktopServices::openUrl(QUrl::fromLocalFile(QFileInfo(file).absolutePath()));
    setUpdate("downloaded");
  });
}

// ---------- media keys and the media overlay ----------
void System::mediaAttach(QWindow *w) {
#ifdef Q_OS_WIN
  if (m_smtc || !w) return;
  ComPtr<ISystemMediaTransportControlsInterop> interop;
  if (FAILED(RoGetActivationFactory(HStringReference(RuntimeClass_Windows_Media_SystemMediaTransportControls).Get(), IID_PPV_ARGS(&interop)))) return;
  ISystemMediaTransportControls *smtc = nullptr;
  if (FAILED(interop->GetForWindow(reinterpret_cast<HWND>(w->winId()), IID_PPV_ARGS(&smtc))) || !smtc) return;
  m_smtc = smtc;
  smtc->put_IsEnabled(true); smtc->put_IsPlayEnabled(true); smtc->put_IsPauseEnabled(true);
  smtc->put_IsNextEnabled(true); smtc->put_IsPreviousEnabled(true); smtc->put_IsStopEnabled(true);
  EventRegistrationToken token;
  auto handler = Callback<ITypedEventHandler<SystemMediaTransportControls *, SystemMediaTransportControlsButtonPressedEventArgs *>>(
    [this](ISystemMediaTransportControls *, ISystemMediaTransportControlsButtonPressedEventArgs *args) -> HRESULT {
      SystemMediaTransportControlsButton b;
      if (FAILED(args->get_Button(&b))) return S_OK;
      const char *n = b == SystemMediaTransportControlsButton_Play ? "play" : b == SystemMediaTransportControlsButton_Pause ? "pause"
                    : b == SystemMediaTransportControlsButton_Next ? "next" : b == SystemMediaTransportControlsButton_Previous ? "previous"
                    : b == SystemMediaTransportControlsButton_Stop ? "stop" : nullptr;
      if (n) { const QString s = n; QMetaObject::invokeMethod(this, [this, s]() { emit mediaButton(s); }, Qt::QueuedConnection); }
      return S_OK;
    });
  smtc->add_ButtonPressed(handler.Get(), &token);
  m_token = token.value;
  mediaState("closed");
#else
  Q_UNUSED(w);
#endif
}
void System::mediaState(const QString &state) {
#ifdef Q_OS_WIN
  if (!m_smtc) return;
  auto *smtc = static_cast<ISystemMediaTransportControls *>(m_smtc);
  smtc->put_PlaybackStatus(state == "playing" ? MediaPlaybackStatus_Playing : state == "paused" ? MediaPlaybackStatus_Paused
                         : state == "stopped" ? MediaPlaybackStatus_Stopped : MediaPlaybackStatus_Closed);
#else
  Q_UNUSED(state);
#endif
}
void System::mediaInfo(const QString &title, const QString &artist, const QString &album, bool music) {
#ifdef Q_OS_WIN
  if (!m_smtc) return;
  ComPtr<ISystemMediaTransportControlsDisplayUpdater> du;
  if (FAILED(static_cast<ISystemMediaTransportControls *>(m_smtc)->get_DisplayUpdater(&du))) return;
  du->ClearAll();
  if (music) {
    du->put_Type(MediaPlaybackType_Music);
    ComPtr<IMusicDisplayProperties> mp;
    if (SUCCEEDED(du->get_MusicProperties(&mp))) {
      mp->put_Title(HStringReference(reinterpret_cast<const wchar_t *>(title.utf16())).Get());
      mp->put_Artist(HStringReference(reinterpret_cast<const wchar_t *>(artist.utf16())).Get());
      ComPtr<IMusicDisplayProperties2> mp2;
      if (SUCCEEDED(mp.As(&mp2))) mp2->put_AlbumTitle(HStringReference(reinterpret_cast<const wchar_t *>(album.utf16())).Get());
    }
  } else {
    du->put_Type(MediaPlaybackType_Video);
    ComPtr<IVideoDisplayProperties> vp;
    if (SUCCEEDED(du->get_VideoProperties(&vp))) vp->put_Title(HStringReference(reinterpret_cast<const wchar_t *>(title.utf16())).Get());
  }
  du->Update();
#else
  Q_UNUSED(title); Q_UNUSED(artist); Q_UNUSED(album); Q_UNUSED(music);
#endif
}
