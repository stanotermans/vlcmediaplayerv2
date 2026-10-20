// A crash on Windows leaves its call stack in crash.log in the app's data folder (with the module, offset and, where
// symbols are known, the function), so a bug report can say where it happened.
#include "crashlog.h"
#ifdef _WIN32
#include <windows.h>
#include <dbghelp.h>
#include <cstdio>
#include <string>

static std::wstring g_file;

static LONG WINAPI onCrash(EXCEPTION_POINTERS *ep) {
  FILE *f = _wfopen(g_file.c_str(), L"a");
  if (!f) return EXCEPTION_CONTINUE_SEARCH;
  SYSTEMTIME t; GetLocalTime(&t);
  fprintf(f, "%04d-%02d-%02d %02d:%02d:%02d crash: exception 0x%08lx at %p\n", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond,
          ep->ExceptionRecord->ExceptionCode, ep->ExceptionRecord->ExceptionAddress);
  HANDLE proc = GetCurrentProcess(), thread = GetCurrentThread();
  SymSetOptions(SYMOPT_UNDNAME | SYMOPT_DEFERRED_LOADS);
  SymInitialize(proc, nullptr, TRUE);
  CONTEXT ctx = *ep->ContextRecord;
  STACKFRAME64 sf = {};
  sf.AddrPC.Offset = ctx.Rip; sf.AddrPC.Mode = AddrModeFlat;
  sf.AddrFrame.Offset = ctx.Rbp; sf.AddrFrame.Mode = AddrModeFlat;
  sf.AddrStack.Offset = ctx.Rsp; sf.AddrStack.Mode = AddrModeFlat;
  alignas(SYMBOL_INFO) char buf[sizeof(SYMBOL_INFO) + 256];
  for (int i = 0; i < 40 && StackWalk64(IMAGE_FILE_MACHINE_AMD64, proc, thread, &sf, &ctx, nullptr, SymFunctionTableAccess64, SymGetModuleBase64, nullptr); i++) {
    const DWORD64 pc = sf.AddrPC.Offset;
    if (!pc) break;
    char mod[MAX_PATH] = "?";
    const DWORD64 base = SymGetModuleBase64(proc, pc);
    if (base) { GetModuleFileNameA(reinterpret_cast<HMODULE>(base), mod, MAX_PATH); }
    const char *name = strrchr(mod, '\\'); name = name ? name + 1 : mod;
    auto *sym = reinterpret_cast<SYMBOL_INFO *>(buf); sym->SizeOfStruct = sizeof(SYMBOL_INFO); sym->MaxNameLen = 255;
    DWORD64 disp = 0;
    if (SymFromAddr(proc, pc, &disp, sym)) fprintf(f, "  #%02d %s!%s+0x%llx\n", i, name, sym->Name, disp);
    else fprintf(f, "  #%02d %s+0x%llx\n", i, name, base ? pc - base : pc);
  }
  fprintf(f, "\n");
  fclose(f);
  return EXCEPTION_CONTINUE_SEARCH;   // Windows then ends the app as before
}

void installCrashLog(const QString &file) {
  g_file = file.toStdWString();
  SetUnhandledExceptionFilter(onCrash);
}
#else
void installCrashLog(const QString &) {}
#endif
