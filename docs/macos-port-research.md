# macOS 移植可行性调研

> 目标：把本工具（Windows 上靠 **DLL 注入 + IAT Hook** 改写无影/cloud 客户端 API 来防掉线、防截屏）做到 macOS 上、与 Windows 功能对等。
> 结论先行：**注入式拦截这套核心，在现代 macOS（Sonoma 14 / Sequoia 15 / Apple Silicon）上对"未修改的已签名第三方客户端"基本无法实现**——不是"难写"，是被 Apple 的安全架构主动封死。下面给出证据、功能对照、以及真正可落地的替代方案。

## 一、功能对照矩阵（Windows → macOS）

| Windows 能力 | macOS 对等性 | 机制 / 说明 |
|---|---|---|
| 窗口列表（`EnumWindows`） | ✅ **可以** | `CGWindowListCopyWindowInfo`（列表/PID/坐标/层级免权限；**窗口标题**需「屏幕录制」权限，或用辅助功能 AX 取） |
| `keepalive` 保活（`PostMessage` 鼠标消息） | ⚠️ **部分** | 改用合成输入 `CGEventPostToPid(pid, event)`（需「辅助功能」权限）。**但后台投递是否被目标接收，取决于 App**——Chromium/Electron/游戏会丢弃合成事件；无影客户端是否吃，需实测 |
| `idle` 空闲归零（`GetLastInputInfo`） | ⚠️ **换机制** | macOS 空闲是**全局**的。`IOPMAssertionDeclareUserActivity`（= `caffeinate -u`）可**无需注入、无需权限**重置全局空闲时钟——但只有当无影是"读系统空闲"判活时才有用 |
| `fg` 前台伪装（Hook `GetForegroundWindow`） | ❌ **不行** | 需要注入进无影进程改它的 API —— **被封死**（见第二节） |
| `uncapture` 防截屏（改它的 `SetWindowDisplayAffinity`） | ❌ **不行** | 同上，需注入进无影；macOS 只能给**自己的**窗口设防截屏，改不了别的 App 的窗口 |
| `hook` 通用拦截 | ❌ **不行** | 需要注入 —— 被封死 |

**一句话**：窗口列表 ✅、输入保活 ⚠️（要测）、空闲重置 ⚠️（有非注入的新办法），但**三个注入类规则（fg/uncapture/hook）❌ 无法移植**。讽刺的是：Windows 上我们从"合成输入(F15)"升级到了"DLL 注入"；macOS 上得反过来，因为注入这条路被堵死，只能退回"合成输入 + 电源断言"。

## 二、为什么注入在 macOS 上行不通（核心结论）

把"自己的代码塞进别的运行中进程"——Windows 默认允许（同用户即可 `OpenProcess`+`WriteProcessMemory`+`CreateRemoteThread`），**macOS 默认禁止**，且对"已签名 + 强化运行时"的目标，**连 root 都拿不到它的 task port**。

| 技术 | 对"未修改的已签名无影客户端"是否可行 | 真实前提 |
|---|---|---|
| `DYLD_INSERT_LIBRARIES`（≈ AppInit_DLLs） | ❌ | 对强化运行时进程，`DYLD_*` 在 `main()` 前就被 dyld **整段清除**；且**库验证**只收 Apple 或同 Team ID 签名的 dylib。两道墙都由**目标的签名**决定，第三方加不了 |
| `task_for_pid` + Mach 注入（≈ OpenProcess+CreateRemoteThread） | ❌ | 强化且无 `get-task-allow` 的进程，**root 也拿不到 task port**。**macOS 14.4+ 连调用 `task_for_pid` 都会被 `EXC_GUARD` SIGKILL**，即便 SIP 已关，还要额外 `amfi_get_out_of_my_way=1` 等 boot-args |
| Frida / Dobby / mach_inject / insert_dylib | ❌ | Frida 是目前唯一还在维护的成熟方案，但它**也卡在同一个 OS 安全模型**：要么 SIP off + AMFI boot-args + root，要么把目标**重签名**。Dobby/insert_dylib 只是"进程内 Hook"或"静态打补丁"，解决不了"进得去"的问题 |
| 重签名 / 重打包无影（塞 dylib + `disable-library-validation` 再签） | ⚠️ 能启动，但**多半登录/串流就废了** | 重签后 bundle 带的是**你的** Team ID，客户端自检（`SecCodeCopySigningInformation`）或**服务端对客户端的签名 attestation** 会发现身份变了 → 拒绝登录/握手。对企业级 DRM 串流客户端，这是大概率的死穴 |

**唯一可能翻盘的情况**：无影的 Mac 客户端**自己**签了 `get-task-allow` 或 `disable-library-validation`（少数 Electron 类应用为了插件会签）。这要**实测**——见第四节那条 30 秒命令。但对商业串流客户端，几乎肯定是没有的。

> 详细出处见调研原始记录（dyld 源码 `DyldProcessConfig.cpp`、AFINE《Task Injection on macOS》、Frida issue #524、Apple 签名/公证文档等）。

## 三、不靠注入能做到什么（真正可落地的 macOS 版）

| 能力 | API（可经 koffi FFI 或小型原生 helper 调用） | 权限 |
|---|---|---|
| 列窗口 + 所属进程 | `CGWindowListCopyWindowInfo`；建议直接复用成熟原生模块 `get-windows` / `node-window-manager`（纯 koffi 解析 CFArray 太脆） | 列表免权限；标题需「屏幕录制」 |
| 合成输入保活（给指定进程发鼠标/键盘，不抢焦点不动光标） | `CGEventCreateMouseEvent` + `CGEventPostToPid(pid, ev)` | **辅助功能** |
| 防睡眠 + 重置全局空闲（**不发假输入**） | `IOPMAssertionCreateWithName`（防睡眠）+ `IOPMAssertionDeclareUserActivity`（重置空闲时钟） | 免权限 |
| 给**自己**窗口防截屏 | Electron `BrowserWindow.setContentProtection(true)`（Sequoia 15.4+ 对 ScreenCaptureKit 已不保证拦得住，best-effort） | 免权限 |

koffi 在 macOS arm64 上能直接调这些系统框架（CoreGraphics/IOKit/ApplicationServices 都是 C ABI；调 **Apple 自带框架**不需要 `disable-library-validation`）。`CGEventPostToPid` / 电源断言已有生产级 JS FFI 先例。

## 四、建议的 macOS 架构与计划

1. **抽象原生层**：新增 `src/native/index.js`，按 `process.platform` 分派到 `win32.js`（现有）/ `darwin.js`（新）。两者实现同一接口（`listWindows / wiggle / keepAlive / setIdleAssertion …`）。
2. **`darwin.js`**：koffi 调 CoreGraphics（窗口列表/合成输入）+ IOKit（电源断言/空闲）。窗口列表优先复用 `get-windows` 原生 helper。
3. **规则系统按平台裁剪**：macOS 上保留 `keepalive`（→ `CGEventPostToPid`）和一个新的 `idle/awake`（→ 电源断言）；**`fg`/`uncapture`/`hook` 在 Mac 上置灰并标注"macOS 不支持（系统安全限制）"**。
4. **权限引导**：首次用保活时引导用户在「系统设置 → 隐私与安全性 → 辅助功能」授权；TCC 授权绑定稳定签名，开发期也要用真证书签名否则每次 build 权限重置。
5. **打包**：Developer ID 签名 + 公证 + 强化运行时；Electron 需 `cs.allow-jit`、`cs.allow-unsigned-executable-memory`；因加载 koffi/原生 helper 需 `cs.disable-library-validation`。**必须在 Mac 上 build/公证**（`electron-builder --mac`）。

## 五、诚实的效果预期

即便做出 Mac 版保活，**能不能真防住无影掉线，和 Windows 一样是未知数**，且取决于：
- 无影 Mac 客户端按**系统空闲**判活 → 电源断言/合成输入有戏；
- 按**服务端超时（要真实转发输入）**判活 → 合成输入得被客户端转发，而 `CGEventPostToPid` 对非 AppKit 客户端可能被丢弃 → 可能无效。

→ 必须在 Mac 上**实测**才能定。

## 六、能翻盘的 30 秒检查

在装了无影的 Mac 上，对其可执行文件跑：

```bash
codesign -d --entitlements :- "/Applications/无影云电脑.app"   # 路径按实际
# 或定位到真正的会话进程二进制再查
```

看输出里有没有 `com.apple.security.get-task-allow` / `com.apple.security.cs.disable-library-validation` / `com.apple.security.cs.allow-dyld-environment-variables`。
- **有**（极少见）→ 对应注入路线在普通 Mac 上就能用，parity 有戏。
- **没有**（大概率）→ 第二节的结论成立，注入类功能在 Mac 上做不了。
