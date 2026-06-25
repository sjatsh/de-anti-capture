// hooks.cpp —— 配置驱动的 IAT Hook 引擎。
//
// 规则来自配置文件 <DLL同目录>\KeepAliveHook.rules.txt，每行：
//     kind|enabled|dll|func|value|name
//   kind=idle : 把 dll!func 当作 GetLastInputInfo 处理，空闲时间归零（保活拦截）
//   kind=fg   : 把 GetForegroundWindow 伪装成返回本进程自己的主窗口（云电脑防掉线，骗客户端“我一直在前台”）
//   kind=uncapture : 主动剥离本进程窗口的截屏保护(SetWindowDisplayAffinity→NONE)并 hook 防重设（防截屏置黑）
//   kind=ret  : 让 dll!func 直接返回 value 这个常量（忽略原函数）
//               —— x64 下对“返回 BOOL/状态码/句柄/指针”的检测类 API 通用有效
//
// GUI 改了配置后，远程线程调用导出函数 ReloadHooks 即可热重载。

#include <windows.h>
#include <tlhelp32.h>
#include <vector>
#include <string>
#include <cstdio>
#include <cstring>
#include <cstdarg>
#include <cstdlib>
#include "hooks.h"

#pragma comment(lib, "user32.lib")   // 新增的 fg 钩子直接调用 EnumWindows 等 user32 函数

// ---------------- 日志 ----------------
static void LogLine(const char* fmt, ...)
{
    char path[MAX_PATH];
    DWORD n = GetTempPathA(MAX_PATH, path);
    if (n == 0 || n >= MAX_PATH) return;
    strcat_s(path, MAX_PATH, "KeepAliveHook.log");
    FILE* f = nullptr;
    if (fopen_s(&f, path, "a") != 0 || f == nullptr) return;
    SYSTEMTIME st; GetLocalTime(&st);
    fprintf(f, "[%02d:%02d:%02d.%03d pid=%lu] ", st.wHour, st.wMinute, st.wSecond, st.wMilliseconds, GetCurrentProcessId());
    va_list ap; va_start(ap, fmt); vfprintf(f, fmt, ap); va_end(ap);
    fputc('\n', f); fclose(f);
}

// ---------------- 命中计数 + STAT 上报（无独立线程：在被钩函数自身线程里节流上报，规避卸载竞争）----------------
#define MAX_REG 128
struct RegEntry { std::string kind, dll, func; };
static RegEntry        g_reg[MAX_REG];
static volatile LONG64 g_hits[MAX_REG]   = { 0 };   // 每条已安装规则的命中次数
static LONG64          g_repSnap[MAX_REG] = { 0 };  // 上次上报的快照，仅在变化时再写 STAT
static int             g_regN = 0;
static int             g_idxIdle = -1, g_idxFg = -1, g_idxUncap = -1;   // C 钩子各自的计数槽
static DWORD           g_lastRep = 0;
static volatile LONG   g_repBusy = 0;

// 节流上报：每≥1.2s，把有变化的计数写成 STAT 行；GUI 解析后在规则卡上显示命中数。
static void MaybeReport()
{
    DWORD now = GetTickCount();
    if (now - g_lastRep < 1200) return;
    if (InterlockedExchange(&g_repBusy, 1)) return;     // 防重入（多线程同时命中）
    g_lastRep = now;
    for (int i = 0; i < g_regN; i++) {
        LONG64 h = g_hits[i];
        if (h != g_repSnap[i]) {
            g_repSnap[i] = h;
            LogLine("STAT kind=%s dll=%s func=%s hits=%lld",
                    g_reg[i].kind.c_str(),
                    g_reg[i].dll.empty()  ? "-" : g_reg[i].dll.c_str(),
                    g_reg[i].func.empty() ? "-" : g_reg[i].func.c_str(),
                    (long long)h);
        }
    }
    InterlockedExchange(&g_repBusy, 0);
}

// 供 C 钩子与生成的 stub 在入口调用：累加命中 + 尝试上报。idx 越界(未注册)则只上报不计数。
static void OnHookHit(unsigned idx)
{
    if (idx < (unsigned)g_regN) InterlockedIncrement64(&g_hits[idx]);
    MaybeReport();
}

// 给一条规则分配计数槽，返回 idx（超上限返回 -1，表示不计数）
static int RegisterRule(const std::string& kind, const std::string& dll, const std::string& func)
{
    if (g_regN >= MAX_REG) return -1;
    int i = g_regN++;
    g_reg[i].kind = kind; g_reg[i].dll = dll; g_reg[i].func = func;
    g_hits[i] = 0; g_repSnap[i] = 0;
    return i;
}

// ---------------- 数据结构 ----------------
struct Rule {
    unsigned long pid;
    std::string kind, dll, func;       // kind: idle | hook | ret(兼容旧)
    bool enabled;
    unsigned long long value;          // 旧字段(兼容，未直接使用)
    bool callOriginal;                 // hook: 是否调用原函数(false=完全拦截/mock)
    bool argSet[4];                    // hook: 是否覆盖入参 rcx/rdx/r8/r9
    unsigned long long arg[4];
    bool retSet;                       // hook: 是否覆盖返回值
    unsigned long long retValue;
};
struct PatchRecord { void** slot; void* original; };

static std::vector<PatchRecord> g_patches;   // 被改过的 IAT 槽位，用于还原
static std::vector<void*>       g_thunks;    // 为 ret 规则分配的小代码块

static HMODULE          g_self = nullptr;
static wchar_t          g_configPath[MAX_PATH] = { 0 };
static CRITICAL_SECTION g_lock;
static bool             g_lockInit = false;

// ---------------- idle 替身（保活拦截）----------------
typedef BOOL(WINAPI* GetLastInputInfo_t)(PLASTINPUTINFO);
static GetLastInputInfo_t g_realGLII = nullptr;

static BOOL WINAPI Hooked_GetLastInputInfo(PLASTINPUTINFO plii)
{
    OnHookHit((unsigned)g_idxIdle);
    if (plii && plii->cbSize >= sizeof(LASTINPUTINFO)) { plii->dwTime = GetTickCount(); return TRUE; }
    if (g_realGLII) return g_realGLII(plii);
    return FALSE;
}

// ---------------- fg 前台伪装（防云电脑/远程桌面空闲掉线）----------------
// 把 GetForegroundWindow 伪装成“永远返回本进程自己的主窗口”，让无影云 stream_viewer
// 误以为自己一直在前台，从而持续把本地输入转发到远端、不触发空闲断开。零闪屏、不切前台。
typedef HWND(WINAPI* GetForegroundWindow_t)(void);
static GetForegroundWindow_t g_realGFW = nullptr;
static HWND g_ownMainWnd = nullptr;

static BOOL CALLBACK FindOwnMainProc(HWND h, LPARAM lp)
{
    DWORD pid = 0; GetWindowThreadProcessId(h, &pid);
    if (pid != GetCurrentProcessId()) return TRUE;       // 不是本进程
    if (GetWindow(h, GW_OWNER) != nullptr) return TRUE;  // 有 owner = 非主窗口
    if (!IsWindowVisible(h)) return TRUE;                 // 隐藏窗口跳过
    if (GetWindowTextLengthW(h) <= 0) return TRUE;        // 无标题跳过
    *reinterpret_cast<HWND*>(lp) = h; return FALSE;      // 取第一个匹配的可见有标题主窗口，停止枚举
}
static HWND FindOwnMainWindow()
{
    HWND r = nullptr;
    EnumWindows(FindOwnMainProc, reinterpret_cast<LPARAM>(&r));
    return r;
}
static HWND WINAPI Hooked_GetForegroundWindow(void)
{
    OnHookHit((unsigned)g_idxFg);
    HWND real = g_realGFW ? g_realGFW() : nullptr;
    DWORD pid = 0; if (real) GetWindowThreadProcessId(real, &pid);
    if (pid == GetCurrentProcessId()) return real;       // 本来就是自己在前台 -> 行为不变
    if (!g_ownMainWnd || !IsWindow(g_ownMainWnd)) g_ownMainWnd = FindOwnMainWindow();  // 缓存，仅失效时重找
    return g_ownMainWnd ? g_ownMainWnd : real;           // 否则谎报“我自己的主窗口在前台”
}

// ---------------- uncapture 防截屏：主动剥离 + 强制 NONE ----------------
// SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE) 会让窗口在截屏/录屏里变黑。
// 它通常在窗口创建时只调一次，事后无“调用”可拦——所以光 hook 没用，必须主动把已生效的保护剥掉。
typedef BOOL(WINAPI* SetWDA_t)(HWND, DWORD);
static SetWDA_t g_realSWDA = nullptr;

// hook：不管 app 传什么，强制 affinity=WDA_NONE(0) 再调原函数 —— 防止它以后又重设保护
static BOOL WINAPI Hooked_SetWindowDisplayAffinity(HWND h, DWORD aff)
{
    OnHookHit((unsigned)g_idxUncap);
    wchar_t cls[64] = { 0 };
    if (GetClassNameW(h, cls, 64) && _wcsicmp(cls, L"ClipSDK") == 0)   // 无影安全剪贴板叠加窗：放行原值，别动它(否则变白色遮挡)
        return g_realSWDA ? g_realSWDA(h, aff) : TRUE;
    if (g_realSWDA) return g_realSWDA(h, 0);   // 其它窗口：强制 NONE，撤掉黑屏保护
    return TRUE;
}
// 主动剥离：对本进程所有顶层窗口调真正的 SetWindowDisplayAffinity(hwnd, 0)，撕掉已有黑屏保护。
// (该 API 只对顶层窗口有效，子窗口会失败，无需枚举子窗口)
static BOOL CALLBACK StripTopProc(HWND h, LPARAM lp)
{
    DWORD pid = 0; GetWindowThreadProcessId(h, &pid);
    if (pid != GetCurrentProcessId()) return TRUE;
    wchar_t cls[64] = { 0 };
    if (GetClassNameW(h, cls, 64) && _wcsicmp(cls, L"ClipSDK") == 0) return TRUE;  // 跳过剪贴板叠加窗：剥它会变白色遮挡
    if (g_realSWDA && g_realSWDA(h, 0)) (*reinterpret_cast<int*>(lp))++;
    return TRUE;
}
static int StripCaptureProtection()
{
    if (!g_realSWDA) return 0;
    int n = 0; EnumWindows(StripTopProc, reinterpret_cast<LPARAM>(&n)); return n;
}

// ---------------- 工具 ----------------
static bool WriteSlot(void** slot, void* value)   // SEH 保护写指针
{
    __try {
        DWORD old = 0;
        if (!VirtualProtect(slot, sizeof(void*), PAGE_EXECUTE_READWRITE, &old)) return false;
        *slot = value;
        VirtualProtect(slot, sizeof(void*), old, &old);
        return true;
    } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}

// 按规则生成一段小代码(stub)覆盖到 IAT 槽位：
//   [可选] 改入参 rcx/rdx/r8/r9  ->  调原函数(尾跳，保留栈参) / 不调直接返回mock / 调后改返回值
static void* MakeStub(const Rule& r, void* original, int idx)
{
    unsigned char b[200]; size_t n = 0;
    #define PUTB(x) (b[n++] = (unsigned char)(x))
    // —— 命中计数前导：保存 rcx/rdx/r8/r9 → 调 OnHookHit(idx) → 还原 ——
    // 不破坏入参寄存器，rsp 精确还原后续逻辑照常；运行在目标自身线程，无独立线程→卸载安全。
    if (idx >= 0)
    {
        PUTB(0x51);                                        // push rcx
        PUTB(0x52);                                        // push rdx
        PUTB(0x41); PUTB(0x50);                            // push r8
        PUTB(0x41); PUTB(0x51);                            // push r9
        PUTB(0x48); PUTB(0x83); PUTB(0xEC); PUTB(0x28);    // sub rsp, 28h (影子空间+16 对齐)
        unsigned int id = (unsigned int)idx;
        PUTB(0xB9); memcpy(b + n, &id, 4); n += 4;         // mov ecx, idx
        unsigned long long fn = reinterpret_cast<unsigned long long>(&OnHookHit);
        PUTB(0x48); PUTB(0xB8); memcpy(b + n, &fn, 8); n += 8; // mov rax, &OnHookHit
        PUTB(0xFF); PUTB(0xD0);                            // call rax
        PUTB(0x48); PUTB(0x83); PUTB(0xC4); PUTB(0x28);    // add rsp, 28h
        PUTB(0x41); PUTB(0x59);                            // pop r9
        PUTB(0x41); PUTB(0x58);                            // pop r8
        PUTB(0x5A);                                        // pop rdx
        PUTB(0x59);                                        // pop rcx
    }
    if (r.argSet[0]) { PUTB(0x48); PUTB(0xB9); memcpy(b + n, &r.arg[0], 8); n += 8; } // mov rcx, imm
    if (r.argSet[1]) { PUTB(0x48); PUTB(0xBA); memcpy(b + n, &r.arg[1], 8); n += 8; } // mov rdx, imm
    if (r.argSet[2]) { PUTB(0x49); PUTB(0xB8); memcpy(b + n, &r.arg[2], 8); n += 8; } // mov r8,  imm
    if (r.argSet[3]) { PUTB(0x49); PUTB(0xB9); memcpy(b + n, &r.arg[3], 8); n += 8; } // mov r9,  imm

    if (!r.callOriginal)
    {
        unsigned long long rv = r.retSet ? r.retValue : 0ULL;
        PUTB(0x48); PUTB(0xB8); memcpy(b + n, &rv, 8); n += 8;          // mov rax, rv
        PUTB(0xC3);                                                     // ret  (完全mock)
    }
    else if (!r.retSet)
    {
        unsigned long long op = reinterpret_cast<unsigned long long>(original);
        PUTB(0x48); PUTB(0xB8); memcpy(b + n, &op, 8); n += 8;          // mov rax, original
        PUTB(0xFF); PUTB(0xE0);                                         // jmp rax (尾跳，栈参原样)
    }
    else
    {
        unsigned long long op = reinterpret_cast<unsigned long long>(original);
        PUTB(0x48); PUTB(0x83); PUTB(0xEC); PUTB(0x28);                 // sub rsp,28h (影子空间+对齐)
        PUTB(0x48); PUTB(0xB8); memcpy(b + n, &op, 8); n += 8;          // mov rax, original
        PUTB(0xFF); PUTB(0xD0);                                         // call rax
        PUTB(0x48); PUTB(0x83); PUTB(0xC4); PUTB(0x28);                 // add rsp,28h
        PUTB(0x48); PUTB(0xB8); memcpy(b + n, &r.retValue, 8); n += 8;  // mov rax, retValue
        PUTB(0xC3);                                                     // ret  (改返回值, 限≤4参数)
    }
    #undef PUTB

    void* p = VirtualAlloc(nullptr, n, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
    if (!p) return nullptr;
    memcpy(p, b, n);
    FlushInstructionCache(GetCurrentProcess(), p, n);
    return p;
}

static std::string Trim(const std::string& s)
{
    size_t a = 0, b = s.size();
    while (a < b && (s[a] == ' ' || s[a] == '\t' || s[a] == '\r' || s[a] == '\n')) ++a;
    while (b > a && (s[b - 1] == ' ' || s[b - 1] == '\t' || s[b - 1] == '\r' || s[b - 1] == '\n')) --b;
    return s.substr(a, b - a);
}

static std::vector<std::string> Split(const std::string& s, char d)
{
    std::vector<std::string> out; std::string cur;
    for (char c : s) { if (c == d) { out.push_back(cur); cur.clear(); } else cur.push_back(c); }
    out.push_back(cur); return out;
}

static bool ReadConfig(std::vector<Rule>& out)
{
    FILE* f = nullptr;
    if (_wfopen_s(&f, g_configPath, L"rb") != 0 || f == nullptr) return false;
    char buf[2048];
    while (fgets(buf, sizeof(buf), f))
    {
        std::string line = Trim(buf);
        if (line.empty() || line[0] == '#') continue;
        auto fld = Split(line, '|');               // '|' 不会出现在 UTF-8 续字节里，按字节切分安全
        if (fld.size() < 5) continue;              // pid|kind|enabled|dll|func[|value|name]
        Rule r;
        r.pid = strtoul(Trim(fld[0]).c_str(), nullptr, 10);
        r.kind = Trim(fld[1]);
        r.enabled = (Trim(fld[2]) == "1");
        r.dll = Trim(fld[3]);
        r.func = Trim(fld[4]);
        r.value = 0;
        r.callOriginal = true; r.retSet = false; r.retValue = 0;
        for (int i = 0; i < 4; ++i) { r.argSet[i] = false; r.arg[i] = 0; }

        std::string spec = (fld.size() > 5) ? Trim(fld[5]) : std::string();
        if (r.kind == "ret")
        {
            // 兼容旧格式: spec 是个数字 = 完全拦截并返回该常量
            r.callOriginal = false; r.retSet = true;
            r.retValue = spec.empty() ? 0ULL : _strtoui64(spec.c_str(), nullptr, 0);
        }
        else if (r.kind == "hook")
        {
            // spec = call=1;a0=..;a2=..;ret=..   (只出现的键才生效)
            auto toks = Split(spec, ';');
            for (size_t ti = 0; ti < toks.size(); ++ti)
            {
                auto kv = Split(Trim(toks[ti]), '=');
                if (kv.size() < 2) continue;
                std::string k = Trim(kv[0]), v = Trim(kv[1]);
                if (k == "call") r.callOriginal = (v != "0");
                else if (k == "ret") { r.retSet = true; r.retValue = _strtoui64(v.c_str(), nullptr, 0); }
                else if (k.size() == 2 && k[0] == 'a' && k[1] >= '0' && k[1] <= '3')
                { int idx = k[1] - '0'; r.argSet[idx] = true; r.arg[idx] = _strtoui64(v.c_str(), nullptr, 0); }
            }
        }
        out.push_back(r);
    }
    fclose(f);
    return true;
}

// 在一个模块的 IAT 里把 dll!func 指向 target，并记录原值
static void PatchModuleFunc(HMODULE mod, const char* dll, const char* func, void* target)
{
    if (!mod || mod == g_self) return;
    BYTE* base = (BYTE*)mod;
    auto dos = (PIMAGE_DOS_HEADER)base;
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) return;
    auto nt = (PIMAGE_NT_HEADERS)(base + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) return;
    DWORD rva = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT].VirtualAddress;
    if (!rva) return;

    for (auto imp = (PIMAGE_IMPORT_DESCRIPTOR)(base + rva); imp->Name; ++imp)
    {
        const char* dn = (const char*)(base + imp->Name);
        if (_stricmp(dn, dll) != 0) continue;
        DWORD ntRva = imp->OriginalFirstThunk ? imp->OriginalFirstThunk : imp->FirstThunk;
        auto nameT = (PIMAGE_THUNK_DATA)(base + ntRva);
        auto addrT = (PIMAGE_THUNK_DATA)(base + imp->FirstThunk);
        for (; nameT->u1.AddressOfData; ++nameT, ++addrT)
        {
            if (nameT->u1.Ordinal & IMAGE_ORDINAL_FLAG) continue;
            auto ibn = (PIMAGE_IMPORT_BY_NAME)(base + nameT->u1.AddressOfData);
            if (strcmp((const char*)ibn->Name, func) != 0) continue;
            void** slot = (void**)&addrT->u1.Function;
            if (*slot != target)
            {
                void* orig = *slot;
                if (WriteSlot(slot, target)) { PatchRecord pr{ slot, orig }; g_patches.push_back(pr); }
            }
            break;
        }
    }
}

// fg 钩子专用过滤：跳过 GUI/渲染框架(Qt/Flutter/CEF/OpenGL/D3D)和系统目录下的 DLL。
// 在这些模块里改写 GetForegroundWindow 会破坏窗口/焦点管理(Qt 尤其严重)，表现为
// 注入后桌面冒出一个白屏、点不动的窗口。只在无影自身的 exe / SDK DLL 里 hook，
// 既不碰 UI 框架(不白屏)，又能骗过它自己的“是否在前台/有人在操作”探测。
static bool SkipModuleForFg(const MODULEENTRY32W& me)
{
    const wchar_t* nm = me.szModule;
    if ((nm[0] == L'Q' || nm[0] == L'q') && (nm[1] == L't' || nm[1] == L'T')) return true; // Qt5*/Qt6*
    static const wchar_t* kUi[] = {
        // Qt QPA 平台插件 —— 真正在 Win32 上替 Qt 管窗口/焦点的模块，钩它的 GetForegroundWindow
        // 会搞乱 Qt 窗口管理，把无影的 ClipSDK 安全剪贴板叠加窗顶成白屏(实测元凶)。
        L"qwindows.dll", L"qoffscreen.dll", L"qminimal.dll", L"qdirect2d.dll",
        L"wetype_tip_core.dll",                                                  // 输入法候选窗(也管窗口)
        L"flutter_engine.dll", L"cefview.dll", L"libcef.dll", L"chrome_elf.dll",
        L"libEGL.dll", L"libGLESv2.dll", L"opengl32.dll", L"d3d9.dll", L"d3d11.dll", L"d3d10.dll", L"dxgi.dll"
    };
    for (auto u : kUi) if (_wcsicmp(nm, u) == 0) return true;
    // Qt 平台/IME 等插件多在 \platforms\ \plugins\ 子目录，按路径兜底跳过
    if (wcsstr(me.szExePath, L"\\platforms\\") || wcsstr(me.szExePath, L"\\plugins\\")) return true;
    wchar_t win[MAX_PATH]; UINT n = GetWindowsDirectoryW(win, MAX_PATH);   // 系统目录下的 DLL 一律跳过
    if (n && n < MAX_PATH && _wcsnicmp(me.szExePath, win, wcslen(win)) == 0) return true;
    return false;
}

static void ApplyRuleAllModules(const Rule& r, void* target, bool fgScope)
{
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, GetCurrentProcessId());
    if (snap == INVALID_HANDLE_VALUE) return;
    MODULEENTRY32W me; me.dwSize = sizeof(me);
    if (Module32FirstW(snap, &me))
        do {
            if (fgScope && SkipModuleForFg(me)) continue;   // fg：只 hook 无影自身模块，避开 UI 框架
            PatchModuleFunc(me.hModule, r.dll.c_str(), r.func.c_str(), target);
        } while (Module32NextW(snap, &me));
    CloseHandle(snap);
}

static void RestoreAll()
{
    g_regN = 0; g_idxIdle = g_idxFg = g_idxUncap = -1;   // 先停计数(让 OnHookHit 短路)，再拆钩子/释放 stub
    for (auto& p : g_patches) WriteSlot(p.slot, p.original);
    g_patches.clear();
    for (void* t : g_thunks) VirtualFree(t, 0, MEM_RELEASE);
    g_thunks.clear();
    for (int i = 0; i < MAX_REG; i++) { g_hits[i] = 0; g_repSnap[i] = 0; }
    g_lastRep = 0;
}

static void InstallFromConfig()
{
    std::vector<Rule> rules;
    if (!ReadConfig(rules) || rules.empty())
    {
        // 没有配置文件时，默认装一条 idle 保活拦截，保证“注入即生效”
        Rule d; d.pid = 0; d.kind = "idle"; d.enabled = true; d.dll = "user32.dll"; d.func = "GetLastInputInfo"; d.value = 0;
        rules.push_back(d);
        LogLine("no config, using default idle rule");
    }
    if (!g_realGLII)
        g_realGLII = (GetLastInputInfo_t)GetProcAddress(GetModuleHandleW(L"user32.dll"), "GetLastInputInfo");
    if (!g_realGFW)
        g_realGFW = (GetForegroundWindow_t)GetProcAddress(GetModuleHandleW(L"user32.dll"), "GetForegroundWindow");
    if (!g_realSWDA)
        g_realSWDA = (SetWDA_t)GetProcAddress(GetModuleHandleW(L"user32.dll"), "SetWindowDisplayAffinity");

    // logall 观察模式：对一组“检测类”API 装透传计数钩子(kind=obs，不改行为只统计调用次数)，
    // 看目标到底在探什么、探多频。已被用户规则覆盖的(dll!func)跳过，避免与 fg/hook 冲突。
    bool logAll = false;
    for (auto& r : rules) if (r.enabled && r.kind == "logall") { logAll = true; break; }
    if (logAll)
    {
        auto covered = [&](const char* dll, const char* fn) {
            for (auto& r : rules) {
                if (r.kind == "logall" || r.kind == "obs") continue;
                if (_stricmp(r.dll.c_str(), dll) == 0 && _stricmp(r.func.c_str(), fn) == 0) return true;
            }
            return false;
        };
        static const char* OBS[][2] = {
            // —— 活跃/检测类：看目标在探什么 ——
            { "user32.dll",   "GetForegroundWindow" },
            { "user32.dll",   "GetLastInputInfo" },
            { "user32.dll",   "GetActiveWindow" },
            { "user32.dll",   "GetWindowThreadProcessId" },
            { "kernel32.dll", "IsDebuggerPresent" },
            { "kernel32.dll", "CheckRemoteDebuggerPresent" },
            // —— 输入读取路径探测：注入目标后聚焦它、真实动鼠标/敲键盘，看下面哪些命中，
            //    即可判定它从哪拿输入(决定该用消息注入 PostMessage 还是真实输入 SendInput) ——
            { "user32.dll",   "RegisterRawInputDevices" },  // 启动时注册原始输入设备 → 走 raw input 的强信号
            { "user32.dll",   "GetRawInputData" },          // 每个 WM_INPUT 后取数据 → 正在用 raw input
            { "user32.dll",   "GetRawInputBuffer" },        // raw input 批量读取
            { "user32.dll",   "GetAsyncKeyState" },         // 轮询按键(异步键态)
            { "user32.dll",   "GetKeyState" },              // 轮询按键(消息队列键态)
            { "user32.dll",   "GetKeyboardState" },         // 轮询整张键盘
            { "user32.dll",   "GetCursorPos" },             // 轮询光标位置
            { "user32.dll",   "SetWindowsHookExW" },        // 低级钩子 WH_KEYBOARD_LL/WH_MOUSE_LL
            { "user32.dll",   "SetWindowsHookExA" },        // 低级钩子(A 变体)
            // 键盘走窗口消息时的处理特征(WM_KEYDOWN→翻译/查表)：Qt 等处理按键消息会调这些 →
            // 若动键盘时它们命中、而 raw/轮询都不命中，说明键盘是走标准窗口消息(可试 PostMessage)。
            { "user32.dll",   "ToUnicodeEx" },
            { "user32.dll",   "ToUnicode" },
            { "user32.dll",   "MapVirtualKeyW" },
            { "user32.dll",   "GetKeyboardLayout" },
            // 焦点门控探测：循环若在后台仍跑、靠这些判活，则可用透传伪装(安全)骗它继续采集
            { "user32.dll",   "GetFocus" },
            { "user32.dll",   "GetGUIThreadInfo" },
        };
        for (auto& o : OBS) {
            if (covered(o[0], o[1])) continue;
            Rule r; r.pid = 0; r.kind = "obs"; r.enabled = true; r.dll = o[0]; r.func = o[1];
            r.value = 0; r.callOriginal = true; r.retSet = false; r.retValue = 0;
            for (int i = 0; i < 4; ++i) { r.argSet[i] = false; r.arg[i] = 0; }
            rules.push_back(r);
        }
        LogLine("logall: 观察模式开启，对检测类 + 输入读取类 API 装透传计数钩子");
    }

    DWORD self = GetCurrentProcessId();
    for (auto& r : rules)
    {
        if (!r.enabled) continue;
        if (r.pid != 0 && r.pid != self) continue;   // 只应用分配给本进程(或 pid=0 全局)的规则
        void* target = nullptr;
        if (r.kind == "idle")
        {
            g_idxIdle = RegisterRule(r.kind, r.dll, r.func);
            target = (void*)&Hooked_GetLastInputInfo;
        }
        else if (r.kind == "fg")
        {
            g_idxFg = RegisterRule(r.kind, r.dll, r.func);
            target = (void*)&Hooked_GetForegroundWindow;
        }
        else if (r.kind == "uncapture")
        {
            g_idxUncap = RegisterRule(r.kind, r.dll, r.func);
            int stripped = StripCaptureProtection();                 // 主动剥离已有黑屏保护
            LogLine("uncapture: 主动剥离了 %d 个顶层窗口的截屏保护", stripped);
            target = (void*)&Hooked_SetWindowDisplayAffinity;        // 再 hook 住，防止重设
        }
        else if (r.kind == "hook" || r.kind == "ret" || r.kind == "obs")
        {
            void* original = nullptr;
            if (r.callOriginal)   // 需要调原函数 -> 先拿到真实地址嵌进 stub
            {
                HMODULE m = GetModuleHandleA(r.dll.c_str());
                if (!m) m = LoadLibraryA(r.dll.c_str());
                if (m) original = (void*)GetProcAddress(m, r.func.c_str());
                if (!original) { LogLine("hook: 无法解析 %s!%s, 跳过", r.dll.c_str(), r.func.c_str()); continue; }
            }
            int idx = RegisterRule(r.kind, r.dll, r.func);
            void* stub = MakeStub(r, original, idx);
            if (stub) { g_thunks.push_back(stub); target = stub; }
            else if (idx >= 0) g_regN--;                              // 生成失败回滚计数槽
        }
        if (!target) continue;

        size_t before = g_patches.size();
        ApplyRuleAllModules(r, target, r.kind == "fg");   // fg 限定只 hook 无影自身模块，避开 Qt/UI 框架(否则白屏)
        LogLine("rule[%s] %s!%s call=%d ret=%d -> %zu slot(s)",
                r.kind.c_str(), r.dll.c_str(), r.func.c_str(), (int)r.callOriginal, (int)r.retSet, g_patches.size() - before);
    }
    LogLine("InstallFromConfig done: %zu slot(s), %zu thunk(s)", g_patches.size(), g_thunks.size());
}

// ---------------- 对外接口 ----------------
void InitHookSystem()
{
    if (!g_lockInit) { InitializeCriticalSection(&g_lock); g_lockInit = true; }
}

void StartHooking(HMODULE self)
{
    g_self = self;
    GetModuleFileNameW(self, g_configPath, MAX_PATH);
    wchar_t* slash = wcsrchr(g_configPath, L'\\');
    if (slash) *(slash + 1) = 0; else g_configPath[0] = 0;
    wcscat_s(g_configPath, MAX_PATH, L"KeepAliveHook.rules.txt");
    LogLine("=== StartHooking pid=%lu config=%ls ===", GetCurrentProcessId(), g_configPath);

    if (!g_lockInit) InitHookSystem();
    EnterCriticalSection(&g_lock);
    InstallFromConfig();
    LeaveCriticalSection(&g_lock);
}

void StopHooking()
{
    if (!g_lockInit) return;
    EnterCriticalSection(&g_lock);
    RestoreAll();
    LeaveCriticalSection(&g_lock);
    LogLine("StopHooking done");
}

extern "C" __declspec(dllexport) DWORD WINAPI ReloadHooks(LPVOID)
{
    if (!g_lockInit) return 1;
    LogLine("ReloadHooks: reapplying config");
    EnterCriticalSection(&g_lock);
    RestoreAll();
    InstallFromConfig();
    LeaveCriticalSection(&g_lock);
    return 0;
}
