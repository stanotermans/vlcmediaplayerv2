cmake_minimum_required(VERSION 3.21)
project(vlcredesign3 VERSION 3.0.7 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 6.8 REQUIRED COMPONENTS Quick QuickControls2 Multimedia Svg Network ShaderTools)
qt_standard_project_setup(REQUIRES 6.8)

qt_add_executable(vlcr
  src/main.cpp
  src/settings.cpp src/settings.h
  src/windowframe.cpp src/windowframe.h
  src/crashlog.cpp src/crashlog.h
  src/vlcplayer.cpp src/vlcplayer.h
  src/library.cpp src/library.h
  src/frames.cpp src/frames.h
  src/keyfilter.cpp src/keyfilter.h
  src/subtitles.cpp src/subtitles.h
  src/i18n.cpp src/i18n.h
  src/system.cpp src/system.h
)
set_source_files_properties(qml/Theme.qml qml/SettingsSearch.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
qt_add_qml_module(vlcr
  URI VLCR
  VERSION 1.0
  QML_FILES
    qml/Main.qml qml/Theme.qml qml/SettingsSearch.qml qml/Icons.js qml/Lib.js
    qml/library/Rail.qml qml/library/SidePanel.qml qml/library/Browser.qml qml/library/Card.qml qml/library/ListRow.qml
    qml/player/Playback.qml qml/player/PlayerView.qml qml/player/ControlBar.qml qml/player/SeekBar.qml
    qml/player/MiniPlayer.qml qml/player/PipWindow.qml qml/player/PixelCat.qml
    qml/player/Subtitles.qml qml/player/SubtitleView.qml qml/player/LyricsView.qml
    qml/dialogs/Ask.qml qml/dialogs/NewPlaylist.qml qml/dialogs/Network.qml qml/dialogs/MediaInfo.qml qml/dialogs/SearchSubs.qml
    qml/controls/T.qml qml/controls/Icon.qml qml/controls/IconButton.qml qml/controls/Button.qml
    qml/controls/Toggle.qml qml/controls/Segmented.qml qml/controls/Swatches.qml qml/controls/Slider.qml
    qml/controls/TextField.qml qml/controls/Select.qml qml/controls/ColorField.qml
    qml/controls/SettingRow.qml qml/controls/Section.qml qml/controls/Note.qml qml/controls/Collapse.qml
    qml/controls/MenuBackground.qml qml/controls/MenuItem.qml qml/controls/ContextMenu.qml
    qml/controls/DialogBox.qml qml/controls/ScrollBar.qml
    qml/pages/SettingsWindow.qml qml/pages/InterfacePage.qml qml/pages/ComponentsPage.qml
    qml/pages/GeneralPage.qml qml/pages/PrivacyPage.qml qml/pages/ControlsPage.qml qml/pages/PlaybackPage.qml
    qml/pages/VideoPage.qml qml/pages/AudioPage.qml qml/pages/SubtitlesPage.qml qml/pages/LibraryPage.qml
    qml/pages/NetworkPage.qml qml/pages/PerformancePage.qml qml/pages/RecordingPage.qml qml/pages/ExtensionsPage.qml
    qml/pages/AboutPage.qml qml/pages/EffectRows.qml qml/pages/VSlider.qml qml/pages/FontSelect.qml qml/pages/Effects.js
    qml/controls/KeyCaps.qml qml/controls/FolderRow.qml qml/controls/LinkButton.qml
    qml/player/QuickPanel.qml qml/player/Engine.qml qml/UpdateBanner.qml qml/Onboarding.qml qml/dialogs/OsAccount.qml qml/dialogs/Shortcuts.qml qml/dialogs/WhatsNew.qml
  RESOURCES
    src/defaults.json assets/icon.png CHANGELOG.md
    lang/de.json lang/es.json lang/fr.json lang/it.json lang/nl.json lang/pl.json lang/pt.json
)
qt_add_shaders(vlcr "shaders"
  PREFIX "/"
  FILES shaders/videofx.frag shaders/view360.frag
)
target_include_directories(vlcr PRIVATE src)
target_compile_definitions(vlcr PRIVATE VLCR_VERSION="${PROJECT_VERSION}")   # the version lives here only
target_link_libraries(vlcr PRIVATE Qt6::Quick Qt6::QuickControls2 Qt6::Multimedia Qt6::Svg Qt6::Network)
if(WIN32)
  target_link_libraries(vlcr PRIVATE user32 crypt32 runtimeobject dbghelp dwmapi)
elseif(APPLE)
  target_link_libraries(vlcr PRIVATE "-framework IOKit" "-framework CoreFoundation")   # keeping the screen on (#61)
else()
  find_package(Qt6 COMPONENTS DBus)                                                     # keeping the screen on (#61)
  if(Qt6DBus_FOUND)
    target_link_libraries(vlcr PRIVATE Qt6::DBus)
    target_compile_definitions(vlcr PRIVATE VLCR_DBUS)
  endif()
endif()
set_target_properties(vlcr PROPERTIES WIN32_EXECUTABLE ON MACOSX_BUNDLE ON)
# the program's name: "VLC Redesign.exe", "VLC Redesign.app", "vlc-redesign" (like v2.x)
if(WIN32)
  set_target_properties(vlcr PROPERTIES OUTPUT_NAME "VLC Redesign")
  target_sources(vlcr PRIVATE packaging/windows/app.rc)
elseif(APPLE)
  set_target_properties(vlcr PROPERTIES OUTPUT_NAME "VLC Redesign"
    MACOSX_BUNDLE_INFO_PLIST ${CMAKE_CURRENT_SOURCE_DIR}/packaging/macos/Info.plist.in
    MACOSX_BUNDLE_SHORT_VERSION_STRING ${PROJECT_VERSION} MACOSX_BUNDLE_BUNDLE_VERSION ${PROJECT_VERSION})
else()
  set_target_properties(vlcr PROPERTIES OUTPUT_NAME "vlc-redesign")
endif()
