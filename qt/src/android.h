// Android (#53): what needs Android's Java side: the folder with the app's native files (libVLC and FFmpeg, which
// ships as lib/<abi>/libffmpeg.so so that Android unpacks it as a program), access to the media, keeping the screen
// on, and the test settings (no environment variables on Android: <app files>/env.txt holds them).
#pragma once
#include <QString>

namespace Android {
void loadTestEnv();               // <external app files>/env.txt: KEY=VALUE lines → the environment (tests)
QString nativeLibraryDir();       // where libvlc.so and libffmpeg.so are
QString storage();                // the shared storage, /storage/emulated/0
bool mediaAccess();               // allowed to read videos and music
void askMediaAccess();            // Android's own question (READ_MEDIA_VIDEO/AUDIO, before Android 13 READ_EXTERNAL_STORAGE)
bool allFilesAccess();            // Android 11+: "all files" (subtitles and lyrics next to the videos)
void askAllFilesAccess();         // opens Android's settings page for it
void keepScreenOn(bool on);
}
