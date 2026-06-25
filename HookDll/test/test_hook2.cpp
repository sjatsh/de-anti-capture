// 验证通用 hook：用 GetSystemMetrics 作观察对象。
//   GSM(0)=SM_CXSCREEN(屏幕宽)，GSM(43)=SM_CMOUSEBUTTONS(鼠标键数)，两者差异明显。
//   - 改入参 a0=43 -> GSM(0) 实际变成 GSM(43)
//   - 完全mock call=0;ret=N -> GSM(0) 恒为 N
//   - 透传 call=1 -> GSM(0) 不变
#include <windows.h>
#include <cstdio>

int main()
{
    int v0 = GetSystemMetrics(0);
    int v43 = GetSystemMetrics(43);
    printf("before: GSM(0)=%d GSM(43)=%d\n", v0, v43);

    HMODULE h = LoadLibraryW(L"KeepAliveHook.dll");
    if (!h) { printf("load fail %lu\n", GetLastError()); return 1; }
    Sleep(700);

    int after = GetSystemMetrics(0);
    printf("after: GSM(0)=%d\n", after);
    return 0;
}
