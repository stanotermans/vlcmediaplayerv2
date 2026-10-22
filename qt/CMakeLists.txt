cmake_minimum_required(VERSION 3.21)
project(velaplayer VERSION 3.2.0 LANGUAGES C CXX)
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
  src/android.cpp src/android.h
  src/store.cpp src/store.h
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
    qml/player/QuickPanel.qml qml/player/Engine.qml qml/UpdateBanner.qml qml/Onboarding.qml qml/dialogs/OsAccount.qml qml/dialogs/Shortcuts.qml qml/dialogs/WhatsNew.qml qml/dialogs/ProDialog.qml qml/controls/ProLock.qml
  RESOURCES
    src/defaults.json assets/icon.png assets/meow.wav CHANGELOG.md
    lang/de.json lang/es.json lang/fr.json lang/it.json lang/nl.json lang/pl.json lang/pt.json
)
qt_add_shaders(vlcr "shaders"
  PREFIX "/"
  FILES shaders/videofx.frag shaders/view360.frag shaders/upscale.frag shaders/rcas.frag
)
target_include_directories(vlcr PRIVATE src)
target_compile_definitions(vlcr PRIVATE VLCR_VERSION="${PROJECT_VERSION}")   # the version lives here only
# Android's version code: 3.1.0 → 3010000, plus a build number for more uploads of one version (ANDROID_BUILD)
if(NOT DEFINED VLCR_BUILD)
  set(VLCR_BUILD 0)
endif()
math(EXPR VLCR_VERSION_CODE "(${PROJECT_VERSION_MAJOR} * 10000 + ${PROJECT_VERSION_MINOR} * 100 + ${PROJECT_VERSION_PATCH}) * 100 + ${VLCR_BUILD}")
target_link_libraries(vlcr PRIVATE Qt6::Quick Qt6::QuickControls2 Qt6::Multimedia Qt6::Svg Qt6::Network)
if(ANDROID)
  # #53: the APK (qt/packaging/android/build.sh): libVLC for Android and FFmpeg go in as extra native libraries
  set(VLCR_ANDROID_LIBS "" CACHE STRING "libvlc.so, libc++_shared.so (libVLC's) and libffmpeg.so for the APK")
  set_target_properties(vlcr PROPERTIES
    QT_ANDROID_PACKAGE_SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/packaging/android
    QT_ANDROID_VERSION_NAME ${PROJECT_VERSION}
    QT_ANDROID_VERSION_CODE ${VLCR_VERSION_CODE}
    QT_ANDROID_MIN_SDK_VERSION 28
    QT_ANDROID_TARGET_SDK_VERSION 36
    QT_ANDROID_EXTRA_LIBS "${VLCR_ANDROID_LIBS}"
    QT_QML_IMPORT_PATH "${CMAKE_CURRENT_BINARY_DIR}")   # (androiddeployqt finds our VLCR module there)
elseif(WIN32)
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
# the program's name: "Vela Player.exe", "Vela Player.app", "vela-player" (like v2.x)
if(WIN32)
  set_target_properties(vlcr PROPERTIES OUTPUT_NAME "Vela Player")
  target_sources(vlcr PRIVATE packaging/windows/app.rc)
elseif(APPLE)
  set_target_properties(vlcr PROPERTIES OUTPUT_NAME "Vela Player"
    MACOSX_BUNDLE_INFO_PLIST ${CMAKE_CURRENT_SOURCE_DIR}/packaging/macos/Info.plist.in
    MACOSX_BUNDLE_SHORT_VERSION_STRING ${PROJECT_VERSION} MACOSX_BUNDLE_BUNDLE_VERSION ${PROJECT_VERSION})
else()
  set_target_properties(vlcr PROPERTIES OUTPUT_NAME "vela-player")
endif()
