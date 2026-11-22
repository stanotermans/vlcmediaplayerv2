// #132: live subtitles. Whisper (whisper.cpp, on this computer: nothing leaves it) listens to what is playing and
// writes what is said as subtitles. FFmpeg reads the sound from where playback is (16 kHz mono), a worker thread
// transcribes it a little ahead of playback, piece by piece; a seek outside what is done starts it there. The models
// are downloaded once, from whisper.cpp's page on Hugging Face (checked against their SHA-1), into the data folder.
#pragma once
#include <QNetworkAccessManager>
#include <QObject>
#include <QPointer>
#include <QVariantList>
#include <QtQml/qqmlregistration.h>
#include <atomic>
#include <memory>
#include <mutex>

class QNetworkReply;
class QThread;
class QFile;

class LiveSubs : public QObject {
  Q_OBJECT
  QML_ELEMENT
  Q_PROPERTY(bool available READ available CONSTANT)                      // built with Whisper, and the processor can run it
  Q_PROPERTY(QString unavailableReason READ unavailableReason CONSTANT)
  Q_PROPERTY(QString downloading READ downloading NOTIFY downloadChanged) // the model being downloaded ("" none)
  Q_PROPERTY(double progress READ progress NOTIFY downloadChanged)        // 0…1
  Q_PROPERTY(bool running READ running NOTIFY runningChanged)
  Q_PROPERTY(double doneUntil READ doneUntil NOTIFY progressChanged)      // seconds of the file transcribed (from where it started)
  Q_PROPERTY(int modelsVersion READ modelsVersion NOTIFY modelsChanged)   // changes when a model was added or removed
public:
  explicit LiveSubs(QObject *parent = nullptr);
  ~LiveSubs() override;
  bool available() const;
  QString unavailableReason() const;
  QString downloading() const { return m_downloading; }
  double progress() const { return m_progress; }
  bool running() const { return m_running; }
  double doneUntil() const { return m_doneUntil.load(); }
  int modelsVersion() const { return m_modelsVersion; }

  Q_INVOKABLE QVariantList models() const;               // [{ id, label, size (MB), have }]
  Q_INVOKABLE bool hasModel(const QString &id) const;
  Q_INVOKABLE void download(const QString &id);          // → downloadChanged, modelsChanged; error(text) if it fails
  Q_INVOKABLE void cancelDownload();
  Q_INVOKABLE void removeModel(const QString &id);
  // start transcribing src from `from` seconds; lang: "auto" or a code ("en", "nl"…); translate: into English
  Q_INVOKABLE void start(const QString &src, double from, const QString &model, const QString &lang, bool translate);
  Q_INVOKABLE void stop();
  Q_INVOKABLE void setPosition(double sec);              // where playback is: keeps the work a little ahead; a jump far away starts there
  Q_INVOKABLE bool saveSrt(const QString &file, const QVariantList &cues) const;   // [{ s, e, h }] → .srt
signals:
  void segments(const QVariantList &list);               // [{ s, e, text }] seconds in the file
  void downloadChanged();
  void modelsChanged();
  void runningChanged();
  void progressChanged();
  void error(const QString &text);
  void cleared();                                        // started again somewhere else: earlier text stays valid, this only tells the interface
private:
  void worker(QString src, double from, QString modelPath, QString lang, bool translate);
  void setRunning(bool on);
  QString modelPath(const QString &id) const;
  QNetworkAccessManager m_net;
  QPointer<QNetworkReply> m_reply;
  std::unique_ptr<QFile> m_file;
  QString m_downloading;
  double m_progress = 0;
  int m_modelsVersion = 0;
  bool m_running = false;
  std::atomic<double> m_doneUntil{ 0 };  // (written by the worker)
  std::atomic<double> m_runStart{ 0 };   // where this run began
  QThread *m_thread = nullptr;          // (a QThread: QProcess needs Qt's own thread there, on macOS it hung in a bare std::thread)
  std::atomic<bool> m_stop{ false };
  std::atomic<double> m_position{ 0 };   // playback, seconds
  std::atomic<double> m_jump{ -1 };      // a seek outside what is done: start again here
};
