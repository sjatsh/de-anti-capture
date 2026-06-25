// 被注入测试目标：打印自己的 PID，并每 700ms 打印一次系统空闲时间。
// koffi 注入 DLL(含 idle 规则)后，idle 应被 hook 成 ~0。
#include <windows.h>
#include <cstdio>
int main()
{
    printf("PID=%lu\n", GetCurrentProcessId()); fflush(stdout);
    for (int i = 0; i < 40; i++)
    {
        LASTINPUTINFO lii; lii.cbSize = sizeof(lii);
        GetLastInputInfo(&lii);
        printf("idle=%lu\n", GetTickCount() - lii.dwTime); fflush(stdout);
        Sleep(700);
    }
    return 0;
}
