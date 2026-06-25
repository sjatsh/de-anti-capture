// 验证探针 probe.exe —— 供 GUI「验证」按钮使用的可注入靶子。
// 建一个可见但不抢焦点(SW_SHOWNOACTIVATE)的标题窗口：fg 钩子需要可见主窗口、且本进程不在
// 前台才有可观测差异；uncapture 需要一个设了截屏保护的顶层窗口。每 ~400ms 打印一行观测值，
// 注入对应规则后这些值会变，GUI 据“注入前后”判定通过。控制台子系统 → printf 可被父进程读到。
#include <windows.h>
#include <cstdio>

#ifndef WDA_EXCLUDEFROMCAPTURE
#define WDA_EXCLUDEFROMCAPTURE 0x11
#endif

static const wchar_t* CLS = L"DeAntiCaptureProbe";

static LRESULT CALLBACK WndProc(HWND h, UINT m, WPARAM w, LPARAM l)
{
    if (m == WM_DESTROY) { PostQuitMessage(0); return 0; }
    return DefWindowProcW(h, m, w, l);
}

int main()
{
    HINSTANCE hi = GetModuleHandleW(nullptr);
    WNDCLASSW wc = {};
    wc.lpfnWndProc = WndProc; wc.hInstance = hi; wc.lpszClassName = CLS;
    RegisterClassW(&wc);
    HWND hwnd = CreateWindowExW(0, CLS, L"DeAntiCapture Probe", WS_OVERLAPPEDWINDOW,
                                CW_USEDEFAULT, CW_USEDEFAULT, 340, 150, nullptr, nullptr, hi, nullptr);
    ShowWindow(hwnd, SW_SHOWNOACTIVATE);   // 显示但不抢焦点 → 本进程不在前台

    typedef BOOL (WINAPI* SWDA)(HWND, DWORD);
    typedef BOOL (WINAPI* GWDA)(HWND, DWORD*);
    HMODULE u32 = GetModuleHandleW(L"user32.dll");
    SWDA pSet = (SWDA)GetProcAddress(u32, "SetWindowDisplayAffinity");
    GWDA pGet = (GWDA)GetProcAddress(u32, "GetWindowDisplayAffinity");
    if (pSet) pSet(hwnd, WDA_EXCLUDEFROMCAPTURE);   // 自设截屏保护，uncapture 注入后会被剥成 NONE

    printf("PID=%lu\n", GetCurrentProcessId()); fflush(stdout);

    DWORD lastPrint = 0;
    int ticks = 0;
    MSG msg;
    while (ticks < 600)   // 安全上限 ~240s；GUI 验证完会主动结束本进程
    {
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE))
        {
            if (msg.message == WM_QUIT) return 0;
            TranslateMessage(&msg); DispatchMessageW(&msg);
        }
        DWORD now = GetTickCount();
        if (now - lastPrint >= 400)
        {
            lastPrint = now; ticks++;
            LASTINPUTINFO lii; lii.cbSize = sizeof(lii); GetLastInputInfo(&lii);
            DWORD idle = GetTickCount() - lii.dwTime;
            HWND fg = GetForegroundWindow();
            DWORD fgpid = 0; if (fg) GetWindowThreadProcessId(fg, &fgpid);
            int fgself = (fgpid == GetCurrentProcessId()) ? 1 : 0;
            DWORD aff = 0; if (pGet) pGet(hwnd, &aff);
            int sm0 = GetSystemMetrics(SM_CXSCREEN);
            int dbg = IsDebuggerPresent() ? 1 : 0;
            printf("PROBE idle=%lu fgself=%d aff=0x%lx sm0=%d dbg=%d\n", idle, fgself, aff, sm0, dbg);
            fflush(stdout);
        }
        Sleep(30);
    }
    return 0;
}
