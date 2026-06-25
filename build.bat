@echo off
REM ============================================================
REM  Build the C++ injection hook DLL with VS2019 BuildTools.
REM  Output: bin\KeepAliveHook.dll
REM  (used by the Electron app's inject / idle / hook features)
REM  No .NET SDK required. Just run: build.bat
REM ============================================================
setlocal
cd /d "%~dp0"

set "VS=C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools"
set "VCVARS=%VS%\VC\Auxiliary\Build\vcvars64.bat"

if not exist "%VCVARS%" ( echo [ERROR] vcvars64.bat not found: "%VCVARS%" & exit /b 1 )
if not exist bin mkdir bin

echo === [1/2] Setting up MSVC x64 environment ===
call "%VCVARS%" >nul
cd /d "%~dp0"

echo === [2/2] Compiling C++ hook DLL  -^>  bin\KeepAliveHook.dll ===
cl /nologo /utf-8 /LD /O2 /MT /EHsc /DUNICODE /D_UNICODE ^
   HookDll\dllmain.cpp HookDll\hooks.cpp ^
   /Febin\KeepAliveHook.dll /Fobin\ /link /IMPLIB:bin\KeepAliveHook.lib
if errorlevel 1 ( echo [ERROR] DLL build failed & exit /b 1 )

echo.
echo === BUILD OK  -^>  bin\KeepAliveHook.dll ===
echo Run the app:  npm start    ^(inject / idle / hook features need this DLL^)
endlocal
