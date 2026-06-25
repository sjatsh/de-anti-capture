// dllmain.cpp —— 注入入口。
// 复杂工作放到独立线程做（规避 loader lock）；锁在 ATTACH 时同步初始化。

#include <windows.h>
#include "hooks.h"

static DWORD WINAPI InitThreadProc(LPVOID p)
{
    StartHooking(reinterpret_cast<HMODULE>(p));
    return 0;
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD reason, LPVOID lpReserved)
{
    switch (reason)
    {
    case DLL_PROCESS_ATTACH:
        DisableThreadLibraryCalls(hModule);
        InitHookSystem();
        {
            HANDLE h = CreateThread(nullptr, 0, InitThreadProc, hModule, 0, nullptr);
            if (h) CloseHandle(h);
        }
        break;

    case DLL_PROCESS_DETACH:
        if (lpReserved == nullptr) // FreeLibrary 动态卸载才还原；进程退出则不动
            StopHooking();
        break;
    }
    return TRUE;
}
