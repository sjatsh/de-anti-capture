// 测试目标：建一个窗口，WndProc 统计收到的 WM_MOUSEMOVE 次数，写进标题 "WiggleTarget|N"。8 秒后自退。
#include <windows.h>
#include <cstdio>

static int g_count = 0;
static HWND g_hwnd = nullptr;

static void UpdateTitle()
{
    wchar_t t[64];
    wsprintfW(t, L"WiggleTarget|%d", g_count);
    SetWindowTextW(g_hwnd, t);
}

static LRESULT CALLBACK WndProc(HWND h, UINT m, WPARAM w, LPARAM l)
{
    if (m == WM_MOUSEMOVE) { g_count++; UpdateTitle(); return 0; }
    if (m == WM_TIMER) { PostQuitMessage(0); return 0; }
    return DefWindowProcW(h, m, w, l);
}

int main()
{
    HINSTANCE hi = GetModuleHandleW(nullptr);
    WNDCLASSW wc = { 0 };
    wc.lpfnWndProc = WndProc; wc.hInstance = hi; wc.lpszClassName = L"WiggleTargetCls";
    RegisterClassW(&wc);
    g_hwnd = CreateWindowExW(0, L"WiggleTargetCls", L"WiggleTarget|0",
        WS_OVERLAPPEDWINDOW, 0, 0, 200, 150, nullptr, nullptr, hi, nullptr);
    ShowWindow(g_hwnd, SW_SHOWNOACTIVATE);
    SetTimer(g_hwnd, 1, 8000, nullptr);
    printf("[target] hwnd=%p, pumping messages for 8s...\n", (void*)g_hwnd); fflush(stdout);
    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0)) { TranslateMessage(&msg); DispatchMessageW(&msg); }
    printf("[target] final WM_MOUSEMOVE count = %d\n", g_count);
    return g_count;
}
