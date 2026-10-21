; The Windows installer of Vela Player (Qt). Build: makensis /DVERSION=3.0.0 /DSRC=<the deployed app folder>
; /DOUT=<installer.exe> installer.nsi
; For the current user, without administrator rights (#63: the updaters of v2.x and v3 start it directly, and Windows
; refuses that for an installer that asks for elevation); registers the file types and the app with
; Windows "Default apps" (Settings → Apps → Default apps), so it shows up there and "Set as default player" can open
; that page right on it. Windows does not let apps make themselves the default: the user picks it there.
; /S installs silently (updates); --force-run starts the app afterwards.
Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define NAME "Vela Player"
!define EXE "Vela Player.exe"
!define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\Vela Player"
!define CAPS "Software\Vela Player\Capabilities"

Name "${NAME}"
OutFile "${OUT}"
InstallDir "$PROGRAMFILES64\${NAME}"
RequestExecutionLevel user
BrandingText "${NAME} ${VERSION}"

!define MULTIUSER_EXECUTIONLEVEL Standard
!define MULTIUSER_INSTALLMODE_COMMANDLINE
!define MULTIUSER_INSTALLMODE_DEFAULT_CURRENTUSER
!define MULTIUSER_INSTALLMODE_INSTDIR "${NAME}"
!define MULTIUSER_USE_PROGRAMFILES64
; an update (also a silent one) goes where and how the app was installed before
!define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_KEY "${UNINST}"
!define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME "InstallLocation"
!define MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_KEY "${UNINST}"
!define MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_VALUENAME "InstallLocation"
!include "MultiUser.nsh"   ; after its settings: it reads them when included

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Dutch"
!insertmacro MUI_LANGUAGE "German"
!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "Spanish"
!insertmacro MUI_LANGUAGE "Italian"
!insertmacro MUI_LANGUAGE "Portuguese"
!insertmacro MUI_LANGUAGE "Polish"

Function .onInit
  !insertmacro MULTIUSER_INIT
  ; where an earlier install of this user is, else %LOCALAPPDATA%\Programs (like other per-user apps)
  ReadRegStr $0 HKCU "${UNINST}" "InstallLocation"
  StrCmp $0 "" 0 +2
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${NAME}"
FunctionEnd
Function un.onInit
  !insertmacro MULTIUSER_UNINIT
FunctionEnd

; one file type: its ProgID (name, icon, open command) and its entry in the Capabilities
!macro Type EXT PROGID DESC
  WriteRegStr SHCTX "Software\Classes\${PROGID}" "" "${DESC}"
  WriteRegStr SHCTX "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\${EXE},0"
  WriteRegStr SHCTX "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\${EXE}" "%1"'
  WriteRegStr SHCTX "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}" ""
  WriteRegStr SHCTX "${CAPS}\FileAssociations" "${EXT}" "${PROGID}"
!macroend
!macro Untype EXT PROGID DESC
  DeleteRegKey SHCTX "Software\Classes\${PROGID}"
  DeleteRegValue SHCTX "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}"
!macroend
!macro Types T
  !insertmacro ${T} ".mp4" "VelaPlayer.mp4" "MP4 video"
  !insertmacro ${T} ".mkv" "VelaPlayer.mkv" "MKV video"
  !insertmacro ${T} ".avi" "VelaPlayer.avi" "AVI video"
  !insertmacro ${T} ".mov" "VelaPlayer.mov" "MOV video"
  !insertmacro ${T} ".webm" "VelaPlayer.webm" "WEBM video"
  !insertmacro ${T} ".wmv" "VelaPlayer.wmv" "WMV video"
  !insertmacro ${T} ".flv" "VelaPlayer.flv" "FLV video"
  !insertmacro ${T} ".m4v" "VelaPlayer.m4v" "M4V video"
  !insertmacro ${T} ".mpg" "VelaPlayer.mpg" "MPG video"
  !insertmacro ${T} ".mpeg" "VelaPlayer.mpeg" "MPEG video"
  !insertmacro ${T} ".ts" "VelaPlayer.ts" "TS video"
  !insertmacro ${T} ".m2ts" "VelaPlayer.m2ts" "M2TS video"
  !insertmacro ${T} ".3gp" "VelaPlayer.3gp" "3GP video"
  !insertmacro ${T} ".ogv" "VelaPlayer.ogv" "OGV video"
  !insertmacro ${T} ".iso" "VelaPlayer.iso" "Disc image"
  !insertmacro ${T} ".mp3" "VelaPlayer.mp3" "MP3 audio"
  !insertmacro ${T} ".flac" "VelaPlayer.flac" "FLAC audio"
  !insertmacro ${T} ".wav" "VelaPlayer.wav" "WAV audio"
  !insertmacro ${T} ".m4a" "VelaPlayer.m4a" "M4A audio"
  !insertmacro ${T} ".aac" "VelaPlayer.aac" "AAC audio"
  !insertmacro ${T} ".ogg" "VelaPlayer.ogg" "OGG audio"
  !insertmacro ${T} ".opus" "VelaPlayer.opus" "OPUS audio"
  !insertmacro ${T} ".wma" "VelaPlayer.wma" "WMA audio"
  !insertmacro ${T} ".ac3" "VelaPlayer.ac3" "AC3 audio"
  !insertmacro ${T} ".mid" "VelaPlayer.midi" "MIDI audio"
  !insertmacro ${T} ".midi" "VelaPlayer.midi" "MIDI audio"
  !insertmacro ${T} ".kar" "VelaPlayer.midi" "MIDI audio"
  !insertmacro ${T} ".rmi" "VelaPlayer.midi" "MIDI audio"
  !insertmacro ${T} ".m3u" "VelaPlayer.m3u" "Playlist"
  !insertmacro ${T} ".m3u8" "VelaPlayer.m3u8" "Playlist"
  !insertmacro ${T} ".xspf" "VelaPlayer.xspf" "Playlist"
  !insertmacro ${T} ".pls" "VelaPlayer.pls" "Playlist"
!macroend

; v2.x installed elsewhere (electron-builder, its key is a UUIDv5 of the appId): removed quietly first, before the
; shortcuts (same names) are made, but only once it has written its data for v3 (v2.2 and later). Its uninstaller
; keeps %APPDATA%\VLC Redesign, so the app takes the settings and library over on its first start.
!define V2KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\{913a180f-8dd3-525b-971c-da381db998ef}"
!macro RemoveV2 ROOT
  ReadRegStr $0 ${ROOT} "${V2KEY}" "QuietUninstallString"
  StrCmp $0 "" v2done_${ROOT}
  IfFileExists "$APPDATA\VLC Redesign\export-for-v3.json" 0 v2done_${ROOT}
  ReadRegStr $1 ${ROOT} "${V2KEY}" "DisplayVersion"
  DetailPrint "Removing VLC Redesign $1"
  ExecWait $0
  v2done_${ROOT}:
!macroend

; Vela Player was called VLC Redesign up to 3.0.7 (same installer, other name): that install is removed quietly first
; (its program files, shortcuts and file types; its data stays and the app copies it over on its first start)
!define OLDKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\VLC Redesign"
!macro RemoveOldName ROOT
  ReadRegStr $0 ${ROOT} "${OLDKEY}" "QuietUninstallString"
  StrCmp $0 "" oldname_${ROOT}
  DetailPrint "Removing VLC Redesign (now Vela Player)"
  ExecWait $0
  oldname_${ROOT}:
!macroend

Section "Install"
  !insertmacro RemoveV2 HKCU
  !insertmacro RemoveV2 HKLM
  !insertmacro RemoveOldName HKCU
  !insertmacro RemoveOldName HKLM
  ; v2.x (Electron) installed here too: its files go, its settings stay (the app takes them over on first start)
  IfFileExists "$INSTDIR\resources\app.asar" 0 +3
    RMDir /r "$INSTDIR\resources"
    RMDir /r "$INSTDIR\locales"
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall ${NAME}.exe"

  CreateShortCut "$SMPROGRAMS\${NAME}.lnk" "$INSTDIR\${EXE}"
  IfSilent +2
    CreateShortCut "$DESKTOP\${NAME}.lnk" "$INSTDIR\${EXE}"

  WriteRegStr SHCTX "${CAPS}" "ApplicationName" "${NAME}"
  WriteRegStr SHCTX "${CAPS}" "ApplicationDescription" "Media player for video, music and streams"
  WriteRegStr SHCTX "${CAPS}" "ApplicationIcon" "$INSTDIR\${EXE},0"
  !insertmacro Types Type
  WriteRegStr SHCTX "Software\RegisteredApplications" "${NAME}" "${CAPS}"
  WriteRegStr SHCTX "Software\Classes\Applications\${EXE}\shell\open\command" "" '"$INSTDIR\${EXE}" "%1"'

  WriteRegStr SHCTX "${UNINST}" "DisplayName" "${NAME}"
  WriteRegStr SHCTX "${UNINST}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINST}" "Publisher" "Stan Otermans"
  WriteRegStr SHCTX "${UNINST}" "DisplayIcon" "$INSTDIR\${EXE},0"
  WriteRegStr SHCTX "${UNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr SHCTX "${UNINST}" "UninstallString" '"$INSTDIR\Uninstall ${NAME}.exe" /$MultiUser.InstallMode'
  WriteRegStr SHCTX "${UNINST}" "QuietUninstallString" '"$INSTDIR\Uninstall ${NAME}.exe" /$MultiUser.InstallMode /S'
  WriteRegDWORD SHCTX "${UNINST}" "NoModify" 1
  WriteRegDWORD SHCTX "${UNINST}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD SHCTX "${UNINST}" "EstimatedSize" $0
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'   ; file types changed

  ; an update (/S --force-run): start the new version
  ${GetParameters} $0
  ${GetOptions} $0 "--force-run" $1
  IfErrors +2
    Exec '"$INSTDIR\${EXE}"'
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${NAME}.lnk"
  Delete "$DESKTOP\${NAME}.lnk"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "${NAME}"
  DeleteRegKey SHCTX "Software\Vela Player\Capabilities"
  DeleteRegKey /ifempty SHCTX "Software\Vela Player"
  DeleteRegKey SHCTX "Software\Classes\Applications\${EXE}"
  !insertmacro Types Untype
  DeleteRegKey SHCTX "${UNINST}"
  RMDir /r "$INSTDIR"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd
