; Registers VLC Redesign with Windows "Default apps" (Settings → Apps → Default apps), so it shows up there with all
; its file types and the app can open that page right on itself. Windows does not let apps make themselves the default;
; the user picks it there. electron-builder only writes the file types (ProgIDs); this adds the Capabilities.
; The list follows "fileAssociations" in package.json (ProgID = its "name"); keep them in sync.
!define CAPS "Software\VLC Redesign\Capabilities"

!macro customInstall
  WriteRegStr SHCTX "${CAPS}" "ApplicationName" "VLC Redesign"
  WriteRegStr SHCTX "${CAPS}" "ApplicationDescription" "Unofficial VLC-style media player for video, music and streams"
  WriteRegStr SHCTX "${CAPS}" "ApplicationIcon" "$INSTDIR\VLC Redesign.exe,0"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".mp4" "MP4-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".mkv" "MKV-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".avi" "AVI-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".mov" "MOV-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".webm" "WEBM-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".wmv" "WMV-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".flv" "FLV-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".m4v" "M4V-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".mpg" "MPG-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".mpeg" "MPEG-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".ts" "TS-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".m2ts" "M2TS-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".3gp" "3GP-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".ogv" "OGV-video"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".mp3" "MP3-audio"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".flac" "FLAC-audio"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".wav" "WAV-audio"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".m4a" "M4A-audio"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".aac" "AAC-audio"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".ogg" "OGG-audio"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".opus" "OPUS-audio"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".wma" "WMA-audio"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".ac3" "AC3-audio"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".mid" "MIDI-audio"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".midi" "MIDI-audio"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".kar" "MIDI-audio"
  WriteRegStr SHCTX "${CAPS}\FileAssociations" ".rmi" "MIDI-audio"
  WriteRegStr SHCTX "Software\RegisteredApplications" "VLC Redesign" "${CAPS}"
!macroend

!macro customUnInstall
  DeleteRegValue SHCTX "Software\RegisteredApplications" "VLC Redesign"
  DeleteRegKey SHCTX "Software\VLC Redesign\Capabilities"
  DeleteRegKey /ifempty SHCTX "Software\VLC Redesign"
!macroend
