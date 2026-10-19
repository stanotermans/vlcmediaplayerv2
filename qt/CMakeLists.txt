cmake_minimum_required(VERSION 3.21)
project(vlcredesign3 VERSION 3.0.0 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 6.8 REQUIRED COMPONENTS Quick QuickControls2 Multimedia Svg)
qt_standard_project_setup(REQUIRES 6.8)

qt_add_executable(vlcr
  src/main.cpp
  src/settings.cpp src/settings.h
  src/windowframe.cpp src/windowframe.h
  src/vlcplayer.cpp src/vlcplayer.h
  src/library.cpp src/library.h
)
set_source_files_properties(qml/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
qt_add_qml_module(vlcr
  URI VLCR
  VERSION 1.0
  QML_FILES
    qml/Main.qml qml/Theme.qml qml/Icons.js qml/Lib.js
    qml/library/Rail.qml qml/library/SidePanel.qml qml/library/Browser.qml qml/library/Card.qml qml/library/ListRow.qml
    qml/dialogs/Ask.qml qml/dialogs/NewPlaylist.qml qml/dialogs/Network.qml qml/dialogs/MediaInfo.qml
    qml/controls/T.qml qml/controls/Icon.qml qml/controls/IconButton.qml qml/controls/Button.qml
    qml/controls/Toggle.qml qml/controls/Segmented.qml qml/controls/Swatches.qml qml/controls/Slider.qml
    qml/controls/TextField.qml qml/controls/Select.qml qml/controls/ColorField.qml
    qml/controls/SettingRow.qml qml/controls/Section.qml qml/controls/Note.qml qml/controls/Collapse.qml
    qml/controls/MenuBackground.qml qml/controls/MenuItem.qml qml/controls/ContextMenu.qml
    qml/controls/DialogBox.qml qml/controls/ScrollBar.qml
    qml/pages/SettingsWindow.qml qml/pages/InterfacePage.qml qml/pages/ComponentsPage.qml
  RESOURCES
    src/defaults.json
)
target_include_directories(vlcr PRIVATE src)
target_link_libraries(vlcr PRIVATE Qt6::Quick Qt6::QuickControls2 Qt6::Multimedia Qt6::Svg)
if(WIN32)
  target_link_libraries(vlcr PRIVATE user32)
endif()
set_target_properties(vlcr PROPERTIES WIN32_EXECUTABLE ON MACOSX_BUNDLE ON)
