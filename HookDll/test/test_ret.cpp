// 验证 ret 规则：用配置把 kernel32!IsDebuggerPresent 强制返回 1。
// 正常情况下未被调试时它返回 0；注入后应变成 1。
#include <windows.h>
#include <cstdio>

int main()
{
    printf("[ret-test] IsDebuggerPresent before load = %d\n", IsDebuggerPresent());

    HMODULE h = LoadLibraryW(L"KeepAliveHook.dll");
    printf("[ret-test] LoadLibrary -> %p (err=%lu)\n", (void*)h, GetLastError());
    if (!h) return 1;
    Sleep(700); // 等装 hook 的线程

    int v = IsDebuggerPresent();
    printf("[ret-test] IsDebuggerPresent after load = %d (expect 1)\n", v);
    printf("[ret-test] RESULT: %s\n", v == 1 ? "PASS - ret rule forced the return value" : "FAIL");
    return v == 1 ? 0 : 2;
}
