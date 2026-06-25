#pragma once
#include <windows.h>

// 初始化内部锁（在 DllMain ATTACH 里同步调用一次）
void InitHookSystem();

// 计算配置路径并按配置安装 hook（由注入线程调用）
void StartHooking(HMODULE self);

// 还原全部 hook（DLL 被 FreeLibrary 卸载时调用）
void StopHooking();

// 导出函数：GUI 改了规则后，远程线程调用它即可“热重载”当前配置
extern "C" __declspec(dllexport) DWORD WINAPI ReloadHooks(LPVOID);
