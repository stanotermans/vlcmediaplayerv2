#pragma once
#include <QString>

// Windows: on a crash, append the call stack to file (elsewhere: nothing)
void installCrashLog(const QString &file);
