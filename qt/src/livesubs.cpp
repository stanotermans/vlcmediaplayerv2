#include "livesubs.h"
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDateTime>
#include <QDebug>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QNetworkReply>
#include <QProcess>
#include <QRegularExpression>
#include <QSaveFile>
#include <QStandardPaths>
#include <QThread>
#include <algorithm>
#include <cstdio>
#include <chrono>
#include <thread>
#include <vector>
#ifdef VLCR_WHISPER
#include "whisper.h"
#endif
#if defined(__x86_64__) || defined(_M_X64)
#ifdef _MSC_VER
#include <intrin.h>
#include <immintrin.h>
#else
#include <cpuid.h>
#endif
#endif

namespace {
struct Model { const char *id, *label; int mb; const char *sha1; };
// whisper.cpp's models (models/README.md of whisper.cpp 1.9.5: sizes and SHA-1); all of them know ~100 languages
const Model kModels[] = {
  { "tiny", "Tiny (fastest)", 75, "bd577a113a864445d4c299885e0cb97d4ba92b5f" },
  { "base", "Base (recommended)", 142, "465707469ff3a37a2b9b8d8f89f2f99de7299dac" },
  { "small", "Small (better, slower)", 466, "55356645c2b361a969dfd0ef2c5a50d530afd8d5" },
  { "large-v3-turbo-q5_0", "Large v3 Turbo (best, needs a fast computer)", 547, "e050f7970618a659205450ad97eb95a18d69c9ee" },
};
const Model *findModel(const QString &id) { for (const Model &m : kModels) if (id == QLatin1String(m.id)) return &m; return nullptr; }

QString ffmpeg() {
  if (qEnvironmentVariableIsSet("VLCR_FFMPEG")) return qEnvironmentVariable("VLCR_FFMPEG");
#ifdef Q_OS_WIN
  const QString own = QCoreApplication::applicationDirPath() + "/ffmpeg.exe";
#else
  const QString own = QCoreApplication::applicationDirPath() + "/ffmpeg";
#endif
  return QFileInfo::exists(own) ? own : QStringLiteral("ffmpeg");
}
QString dataDir() { return qEnvironmentVariable("VLCR_USER_DATA", QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)); }

// Whisper is built for processors with AVX2 (most PCs since 2013); without it, it would crash, so it is not offered
bool cpuOk() {
#if defined(__x86_64__) || defined(_M_X64)
  unsigned a = 0, b = 0, c = 0, d = 0;
  auto cpuid = [&](unsigned leaf, unsigned sub) {
#ifdef _MSC_VER
    int r[4]; __cpuidex(r, int(leaf), int(sub)); a = unsigned(r[0]); b = unsigned(r[1]); c = unsigned(r[2]); d = unsigned(r[3]);
#else
    __cpuid_count(leaf, sub, a, b, c, d);
#endif
  };
  cpuid(1, 0);
  const bool fma = c & (1u << 12), osxsave = c & (1u << 27), avx = c & (1u << 28), f16c = c & (1u << 29);
  if (!(fma && osxsave && avx && f16c)) return false;
#ifdef _MSC_VER
  const unsigned long long xcr = _xgetbv(0);
#else
  unsigned lo, hi; __asm__("xgetbv" : "=a"(lo), "=d"(hi) : "c"(0)); const unsigned long long xcr = (unsigned long long)hi << 32 | lo;
#endif
  if ((xcr & 6) != 6) return false;   // the system saves the AVX registers
  cpuid(7, 0);
  return b & (1u << 5);               // AVX2
#else
  return true;                        // Apple Silicon and other ARM: NEON
#endif
}

#ifdef VLCR_WHISPER
void quiet(enum ggml_log_level, const char *text, void *) { if (qEnvironmentVariableIsSet("VLCR_WHISPER_LOG")) fputs(text, stderr); }   // (testing: Whisper's own messages)
#endif
}

LiveSubs::LiveSubs(QObject *parent) : QObject(parent) {
#ifdef VLCR_WHISPER
  whisper_log_set(quiet, nullptr);
#endif
}
LiveSubs::~LiveSubs() { stop(); cancelDownload(); }

bool LiveSubs::available() const {
#ifdef VLCR_WHISPER
  return cpuOk();
#else
  return false;
#endif
}
QString LiveSubs::unavailableReason() const {
#ifdef VLCR_WHISPER
  return cpuOk() ? QString() : tr("This processor is too old for live subtitles (it needs AVX2).");
#else
  return tr("Live subtitles are not available in this version.");
#endif
}

QString LiveSubs::modelPath(const QString &id) const {
  if (qEnvironmentVariableIsSet("VLCR_WHISPER_MODELS")) return qEnvironmentVariable("VLCR_WHISPER_MODELS") + "/ggml-" + id + ".bin";   // (testing)
  return dataDir() + "/whisper/ggml-" + id + ".bin";
}
bool LiveSubs::hasModel(const QString &id) const { return findModel(id) && QFileInfo::exists(modelPath(id)); }
QVariantList LiveSubs::models() const {
  QVariantList out;
  for (const Model &m : kModels)
    out << QVariantMap{ { "id", QString::fromLatin1(m.id) }, { "label", tr(m.label) }, { "size", m.mb }, { "have", hasModel(QString::fromLatin1(m.id)) } };
  return out;
}

void LiveSubs::download(const QString &id) {
  const Model *m = findModel(id);
  if (!m || !m_downloading.isEmpty()) return;
  QDir().mkpath(QFileInfo(modelPath(id)).absolutePath());
  m_file = std::make_unique<QFile>(modelPath(id) + ".part");
  if (!m_file->open(QIODevice::WriteOnly)) { emit error(tr("Cannot write to %1").arg(m_file->fileName())); m_file.reset(); return; }
  auto hash = std::make_shared<QCryptographicHash>(QCryptographicHash::Sha1);
  QNetworkRequest req(QUrl("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-" + id + ".bin"));
  req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::NoLessSafeRedirectPolicy);
  req.setHeader(QNetworkRequest::UserAgentHeader, "Vela Player");
  m_reply = m_net.get(req);
  m_downloading = id; m_progress = 0; emit downloadChanged();
  const qint64 expected = qint64(m->mb) * 1024 * 1024;
  connect(m_reply, &QNetworkReply::readyRead, this, [this, hash]() {
    if (!m_reply || !m_file) return;
    const QByteArray b = m_reply->readAll(); hash->addData(b); m_file->write(b);
  });
  connect(m_reply, &QNetworkReply::downloadProgress, this, [this, expected](qint64 got, qint64 total) {
    m_progress = double(got) / double(total > 0 ? total : expected); emit downloadChanged();
  });
  connect(m_reply, &QNetworkReply::finished, this, [this, id, hash, m]() {
    QNetworkReply *r = m_reply; if (!r) return;
    r->deleteLater(); m_reply = nullptr;
    QString err;
    if (r->error() != QNetworkReply::NoError) err = r->error() == QNetworkReply::OperationCanceledError ? QString() : r->errorString();
    else { const QByteArray b = r->readAll(); hash->addData(b); m_file->write(b); }
    const QString part = m_file->fileName(); m_file->close(); m_file.reset();
    if (err.isEmpty() && r->error() == QNetworkReply::NoError && hash->result().toHex() != QByteArray(m->sha1)) err = tr("The download was damaged (checksum)");
    if (r->error() == QNetworkReply::NoError && err.isEmpty()) { QFile::remove(modelPath(id)); QFile::rename(part, modelPath(id)); }
    else QFile::remove(part);
    m_downloading.clear(); m_progress = 0; emit downloadChanged();
    m_modelsVersion++; emit modelsChanged();
    if (!err.isEmpty()) emit error(tr("Download failed: %1").arg(err));
  });
}
void LiveSubs::cancelDownload() { if (m_reply) m_reply->abort(); }
void LiveSubs::removeModel(const QString &id) { if (findModel(id)) { QFile::remove(modelPath(id)); m_modelsVersion++; emit modelsChanged(); } }

void LiveSubs::setRunning(bool on) { if (m_running != on) { m_running = on; emit runningChanged(); } }

void LiveSubs::start(const QString &src, double from, const QString &model, const QString &lang, bool translate) {
  stop();
  if (!available()) { emit error(unavailableReason()); return; }
  if (!hasModel(model)) { emit error(tr("Download a model first (Settings → Subtitles → Live subtitles)")); return; }
  m_stop = false; m_jump = -1; m_position = from; m_doneUntil = from; emit progressChanged();
  setRunning(true);
  const QString mp = modelPath(model), lg = lang.isEmpty() ? QStringLiteral("auto") : lang; const double at = std::max(0.0, from);
  m_thread = QThread::create([this, src, at, mp, lg, translate]() { worker(src, at, mp, lg, translate); });
  m_thread->start();
}
void LiveSubs::stop() {
  m_stop = true;
  if (m_thread) { m_thread->wait(); delete m_thread; m_thread = nullptr; }
  setRunning(false);
}
void LiveSubs::setPosition(double sec) {
  m_position = sec;
  // a jump backwards before where this run began, or forwards past what is done (with some room): start there
  const double done = m_doneUntil;
  if (m_running && (sec < m_runStart - 1 || sec > done + 8)) { m_jump = sec; }
}

bool LiveSubs::saveSrt(const QString &file, const QVariantList &cues) const {
  auto ts = [](double s) { const qint64 ms = qRound64(std::max(0.0, s) * 1000);
    return QString::asprintf("%02lld:%02lld:%02lld,%03lld", ms / 3600000, ms / 60000 % 60, ms / 1000 % 60, ms % 1000); };
  static const QRegularExpression tags("<[^>]*>");
  QString out; int n = 0;
  for (const QVariant &v : cues) {
    const QVariantMap c = v.toMap();
    QString text = c["h"].toString(); text.remove(tags);
    text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
    if (text.trimmed().isEmpty()) continue;
    out += QString::number(++n) + "\n" + ts(c["s"].toDouble()) + " --> " + ts(c["e"].toDouble()) + "\n" + text.trimmed() + "\n\n";
  }
  QSaveFile f(file);
  if (!f.open(QIODevice::WriteOnly)) return false;
  f.write(out.toUtf8());
  return f.commit();
}

// ---------- the worker thread ----------
void LiveSubs::worker(QString src, double from, QString modelPath, QString lang, bool translate) {
#ifdef VLCR_WHISPER
  auto post = [this](auto fn) { QMetaObject::invokeMethod(this, fn, Qt::QueuedConnection); };
  whisper_context_params cp = whisper_context_default_params();
  cp.use_gpu = !qEnvironmentVariableIsSet("VLCR_WHISPER_CPU");   // (Metal on a Mac; elsewhere this build has only the processor. Testing: the CI's Macs have a virtual GPU)
  whisper_context *ctx = whisper_init_from_file_with_params(modelPath.toUtf8().constData(), cp);
  if (!ctx) { cp.use_gpu = false; ctx = whisper_init_from_file_with_params(modelPath.toUtf8().constData(), cp); }   // (no usable GPU: the processor)
  if (!ctx) { post([this]() { emit error(tr("The model could not be loaded")); setRunning(false); }); return; }

  constexpr int RATE = 16000;
  const bool trace = qEnvironmentVariableIsSet("VLCR_WHISPER_LOG");   // (testing)
  qint64 readTotal = 0;
  const double first = 8, chunk = 15, longest = 28, ahead = 75;   // seconds
  QProcess proc;
  std::vector<float> buf;
  double bufStart = from;
  bool eof = false;
  auto open = [&](double at) {
    if (proc.state() != QProcess::NotRunning) { proc.kill(); proc.waitForFinished(2000); }
    buf.clear(); bufStart = at; eof = false;
    m_runStart = at; m_doneUntil = at;
    proc.start(ffmpeg(), { "-hide_banner", "-loglevel", "error", "-nostdin", "-ss", QString::number(at, 'f', 3), "-i", src,
                           "-vn", "-sn", "-dn", "-ac", "1", "-ar", QString::number(RATE), "-f", "s16le", "-" });
    if (!proc.waitForStarted(5000)) qWarning().noquote() << "Vela Player: live subtitles: FFmpeg did not start:" << proc.errorString();
    else if (trace) qInfo().noquote() << "Vela Player: live subtitles: FFmpeg" << ffmpeg() << "from" << at << "s";
  };
  open(from);
  QByteArray pending;   // half a sample left over
  double want = first;

  whisper_full_params p = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
  const QByteArray langUtf8 = lang.toUtf8();
  p.language = langUtf8.constData();
  p.translate = translate;
  p.n_threads = std::max(2, std::min(6, QThread::idealThreadCount() / 2));
  p.no_context = true;
  p.print_progress = p.print_realtime = p.print_timestamps = p.print_special = false;
  p.suppress_blank = true;
  p.token_timestamps = true;   // (the time of each word: long sentences become lines of subtitle length, below)
  p.abort_callback = [](void *data) { auto *self = static_cast<LiveSubs *>(data); return self->m_stop.load() || self->m_jump.load() >= 0; };
  p.abort_callback_user_data = this;

  while (!m_stop) {
    const double j = m_jump.exchange(-1);
    if (j >= 0) { open(j); pending.clear(); want = first; post([this]() { emit progressChanged(); }); continue; }
    // read what FFmpeg has
    if (!eof) {
      if (proc.bytesAvailable() == 0 && !proc.waitForReadyRead(100)) {
        if (proc.state() == QProcess::NotRunning && proc.bytesAvailable() == 0) {
          eof = true;
          if (trace) qInfo().noquote() << "Vela Player: live subtitles: FFmpeg ended after" << readTotal << "bytes, exit" << proc.exitCode() << proc.readAllStandardError().left(400);
        }
      }
      const QByteArray got = proc.readAll(); readTotal += got.size();
      if (trace) { static thread_local qint64 last = 0; const qint64 now = QDateTime::currentMSecsSinceEpoch();
        if (now - last > 1000) { last = now; qInfo().noquote() << "Vela Player: live subtitles: read" << readTotal << "bytes, FFmpeg state" << proc.state() << "error" << proc.error() << "stderr" << proc.readAllStandardError().left(300); } }
      QByteArray b = pending + got;
      const int n = int(b.size() / 2);
      buf.reserve(buf.size() + size_t(n));
      const qint16 *s = reinterpret_cast<const qint16 *>(b.constData());
      for (int i = 0; i < n; i++) buf.push_back(float(s[i]) / 32768.0f);
      pending = b.mid(n * 2);
    }
    const double len = double(buf.size()) / RATE;
    if (len < want && !(eof && len > 0.5)) {
      if (eof) std::this_thread::sleep_for(std::chrono::milliseconds(150));   // the end: wait for a seek or a stop
      continue;
    }
    // far enough ahead of playback: wait (FFmpeg pauses itself once its pipe is full)
    if (bufStart > m_position.load() + ahead) { std::this_thread::sleep_for(std::chrono::milliseconds(200)); continue; }

    if (trace) qInfo().noquote() << "Vela Player: live subtitles: Whisper on" << len << "s";
    if (whisper_full(ctx, p, buf.data(), int(buf.size())) != 0) continue;   // (aborted: a seek or a stop)
    const int ns = whisper_full_n_segments(ctx);
    if (qEnvironmentVariableIsSet("VLCR_WHISPER_LOG")) qInfo().noquote() << "Vela Player: live subtitles:" << len << "s of sound from" << bufStart << "s:" << ns << "segments";
    struct Seg { double s, e; QString text; };
    std::vector<Seg> segs;
    for (int i = 0; i < ns; i++) {
      const QString t = QString::fromUtf8(whisper_full_get_segment_text(ctx, i)).trimmed();
      if (t.isEmpty() || whisper_full_get_segment_no_speech_prob(ctx, i) > 0.6f) continue;   // (music, silence: Whisper imagines words)
      if (t.startsWith('[') || t.startsWith('(')) continue;                                   // "[Music]", "(applause)"
      const double s0 = whisper_full_get_segment_t0(ctx, i) / 100.0, e0 = whisper_full_get_segment_t1(ctx, i) / 100.0;
      if (t.size() <= 42) { segs.push_back({ s0, e0, t }); continue; }
      // a long sentence: lines of at most ~42 characters, split between words, each timed by its words. (Whisper's own
      // max_len splitting lost and repeated words.) The bytes are joined before they become text: a character can
      // span two tokens.
      const whisper_token eot = whisper_token_eot(ctx);
      QByteArray line; double ls = -1, le = s0;
      auto flush = [&]() {
        const QString txt = QString::fromUtf8(line).trimmed();
        if (!txt.isEmpty()) segs.push_back({ std::clamp(ls < 0 ? le : ls, s0, e0), std::clamp(le, s0, e0), txt });
        line.clear(); ls = -1;
      };
      const int nt = whisper_full_n_tokens(ctx, i);
      for (int k = 0; k < nt; k++) {
        if (whisper_full_get_token_id(ctx, i, k) >= eot) continue;   // (timestamps and other special tokens)
        const QByteArray tok = whisper_full_get_token_text(ctx, i, k);
        const whisper_token_data td = whisper_full_get_token_data(ctx, i, k);
        if (tok.startsWith(' ') && QString::fromUtf8(line + tok).trimmed().size() > 42) flush();
        if (ls < 0) ls = std::max(td.t0 / 100.0, segs.empty() ? s0 : segs.back().e);
        line += tok; le = std::max(le, td.t1 / 100.0);
      }
      flush();
      if (!segs.empty()) segs.back().e = std::max(segs.back().e, e0);
    }
    // keep what ends a second before the end of the piece; the rest (a sentence cut off) is done again with what follows
    double cut = len;
    size_t keep = segs.size();
    if (!eof && len < longest) {
      keep = 0;
      for (size_t i = 0; i < segs.size(); i++) if (segs[i].e <= len - 1.0) keep = i + 1;
      if (keep < segs.size()) {
        if (keep == 0) { want = len + 5; continue; }   // one long sentence so far: read more first
        cut = segs[keep - 1].e;
      }
    }
    QVariantList out;
    for (size_t i = 0; i < keep; i++)
      out << QVariantMap{ { "s", bufStart + segs[i].s }, { "e", bufStart + std::min(segs[i].e, cut) }, { "text", segs[i].text } };
    const size_t drop = std::min(buf.size(), size_t(cut * RATE));
    buf.erase(buf.begin(), buf.begin() + std::ptrdiff_t(drop));
    bufStart += double(drop) / RATE;
    m_doneUntil = bufStart;
    want = chunk;
    post([this, out]() { if (!out.isEmpty()) emit segments(out); emit progressChanged(); });
  }
  if (proc.state() != QProcess::NotRunning) { proc.kill(); proc.waitForFinished(2000); }
  whisper_free(ctx);
#else
  Q_UNUSED(src) Q_UNUSED(from) Q_UNUSED(modelPath) Q_UNUSED(lang) Q_UNUSED(translate)
#endif
}
