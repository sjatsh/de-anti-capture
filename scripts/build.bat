@echo off
REM ============================================================
REM  Build the C++ injection hook DLL with VS2019 BuildTools.
REM  Output: bin\KeepAliveHook.dll
REM  (used by the Electron app's inject / idle / hook features)
REM  No .NET SDK required. Just run: scripts\build.bat  (or: npm run build:dll)
REM ============================================================
setlocal
cd /d "%~dp0.."

set "VS=C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools"
set "VCVARS=%VS%\VC\Auxiliary\Build\vcvars64.bat"

if not exist "%VCVARS%" ( echo [ERROR] vcvars64.bat not found: "%VCVARS%" & exit /b 1 )
if not exist bin mkdir bin

echo === [1/3] Setting up MSVC x64 environment ===
call "%VCVARS%" >nul
cd /d "%~dp0.."

echo === [2/3] Compiling C++ hook DLL  -^>  bin\KeepAliveHook.dll ===
cl /nologo /utf-8 /LD /O2 /MT /EHsc /DUNICODE /D_UNICODE ^
   HookDll\dllmain.cpp HookDll\hooks.cpp ^
   /Febin\KeepAliveHook.dll /Fobin\ /link /IMPLIB:bin\KeepAliveHook.lib
if errorlevel 1 ( echo [ERROR] DLL build failed & exit /b 1 )

echo === [3/3] Compiling probe (verify target)  -^>  bin\probe.exe ===
cl /nologo /utf-8 /O2 /MT /EHsc /DUNICODE /D_UNICODE ^
   test\probe.cpp ^
   /Febin\probe.exe /Fobin\ /link user32.lib
if errorlevel 1 ( echo [ERROR] probe build failed & exit /b 1 )

REM Remove compile intermediates so bin\ ships only deliverables (extraResource copies all of bin\).
del /q bin\*.obj bin\KeepAliveHook.lib bin\KeepAliveHook.exp >nul 2>nul

echo.
echo === BUILD OK  -^>  bin\KeepAliveHook.dll ===
echo Run the app:  npm start    ^(inject / idle / hook features need this DLL^)
endlocal
