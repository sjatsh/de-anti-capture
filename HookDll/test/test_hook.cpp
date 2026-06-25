// 自包含的端到端验证：调用 GetLastInputInfo -> 加载 KeepAliveHook.dll
// (DLL 会 patch 本进程 IAT) -> 再次调用，空闲时间应被伪造为 ~0。
#include <windows.h>
#include <cstdio>

static DWORD idle()
{
    LASTINPUTINFO lii; lii.cbSize = sizeof(lii);
    if (!GetLastInputInfo(&lii)) { printf("GetLastInputInfo failed %lu\n", GetLastError()); return 0xFFFFFFFFu; }
    return GetTickCount() - lii.dwTime;
}

int main()
{
    printf("[test] idle before load = %lu ms\n", idle());
    Sleep(1500);
    printf("[test] idle after 1.5s  = %lu ms (should grow, no input)\n", idle());

    HMODULE h = LoadLibraryW(L"KeepAliveHook.dll");
    printf("[test] LoadLibrary KeepAliveHook.dll -> %p (err=%lu)\n", (void*)h, GetLastError());
    if (!h) return 1;

    Sleep(700); // DllMain 起了线程去装 hook，等它装好

    DWORD d = idle();
    printf("[test] idle after inject = %lu ms (expect ~0)\n", d);
    printf("[test] RESULT: %s\n", (d <= 100) ? "PASS - hook is spoofing idle time" : "FAIL");
    return (d <= 100) ? 0 : 2;
}
