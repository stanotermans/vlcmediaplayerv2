@echo off
rem Builds VLC Redesign 3 (Qt) for Windows: Qt 6.8 (C:\Qt\6.8.3, or QT_DIR) and the Visual Studio 2022 Build Tools
rem (their CMake and Ninja). Output: build\vlcr.exe; run "build.bat deploy" to also copy Qt's files next to it.
cd /d "%~dp0"
if "%QT_DIR%"=="" set QT_DIR=C:\Qt\6.8.3\msvc2022_64
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
set PATH=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja;%PATH%
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=%QT_DIR% || exit /b 1
cmake --build build || exit /b 1
if "%1"=="deploy" "%QT_DIR%\bin\windeployqt.exe" --release --qmldir qml --no-translations --no-system-d3d-compiler --no-opengl-sw build\vlcr.exe
