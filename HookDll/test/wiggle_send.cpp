// 模拟 GUI 的保活：找到 WiggleTarget 窗口，跨进程 PostMessage 10 条随机 WM_MOUSEMOVE，
// 再读它标题里的计数，验证目标确实收到了。
#include <windows.h>
#include <cstdio>
#include <cstdlib>

static int TitleCount(HWND h)
{
    wchar_t buf[128];
    GetWindowTextW(h, buf, 128);
    const wchar_t* p = wcsrchr(buf, L'|');
    return p ? _wtoi(p + 1) : -1;
}

int main()
{
    Sleep(600); // 等目标起来
    HWND h = FindWindowW(L"WiggleTargetCls", nullptr);
    printf("[send] FindWindow -> %p\n", (void*)h);
    if (!h) { printf("[send] target window not found\n"); return 1; }

    int before = TitleCount(h);
    printf("[send] count before = %d\n", before);

    RECT rc; GetClientRect(h, &rc);
    int w = rc.right - rc.left, ht = rc.bottom - rc.top;
    if (w < 1) w = 100; if (ht < 1) ht = 100;
    for (int i = 0; i < 10; i++)
        PostMessageW(h, WM_MOUSEMOVE, 0, MAKELPARAM(rand() % w, rand() % ht));

    Sleep(500);
    int after = TitleCount(h);
    printf("[send] count after  = %d (posted 10)\n", after);
    bool pass = (after >= before + 10);
    printf("[send] RESULT: %s\n", pass ? "PASS - target received cross-process WM_MOUSEMOVE" : "FAIL");
    return pass ? 0 : 2;
}
