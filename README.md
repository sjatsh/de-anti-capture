# 窗口保活 / API 拦截工具

Windows 桌面工具：**Electron 客户端 + C++ 注入式 Hook DLL**。
以**窗口为主体**：把窗口加入“目标”，再给每个目标挂多条规则（多对多）。每条规则可勾选启用/停用、编辑、删除。

> **客户端是 Electron**（根目录即项目，源码在 `src/`）：自绘标题栏、暗色主题、进程头像、分段控件规则编辑器、活动日志、配置持久化等。通过 [koffi](https://koffi.dev) 直接调用 Win32 API（枚举窗口、`PostMessage` 保活、`CreateRemoteThread` 注入/卸载、`ReloadHooks` 热重载、模块检测、PE 导出解析）。注入类规则依赖 `bin\KeepAliveHook.dll`（由 `HookDll/` 编译）。

## 界面布局
- **顶部「所有可见窗口」**：高度可拖拽调整（中间分隔条）；带**筛选框**（按 `PID / 进程名 / 窗口标题 / 类名 / 句柄` 匹配）和 **「显示隐藏」** 开关（连隐藏/无标题窗口一起列，如全屏云电脑的投屏窗口）。
- **左下「目标窗口」(master)**：你加入的窗口，每个可挂多条规则；对应程序没在跑显示**离线**。
- **右下「选中窗口的规则」(detail)**：当前目标的规则列表，勾选=启用、双击=编辑。
- **标题栏**：保活定时器开关、窗口控制。
- **底部**：内置拦截 DLL 标识（已随程序打包，注入时自动使用，无需选择路径）、注入/卸载/应用规则、**「自动注入」** 开关（目标 PID 变动时自动重挂，通用一键规则）、可展开的活动日志。

## 规则类型（同一套规则系统，按类型显示不同配置）
| 类型 | 作用 | 配置项 | 需要注入? |
|---|---|---|---|
| **keepalive 保活** | 定时向该窗口投递**随机坐标的 `WM_MOUSEMOVE`**，让程序自己不进入空闲（不动你真实光标） | 间隔(秒) | 否 |
| **idle 空闲归零** | 把某 API 当作 `GetLastInputInfo` 处理，空闲时间归零 | 模块 DLL、函数名 | 是 |
| **fg 前台伪装** | 钩 `GetForegroundWindow`：进程在后台时也返回**自己的主窗口**，骗过“按前台判定是否在操作”的探测（如无影云会话窗口）；自己真在前台时返回真实值 | 无（开箱即用） | 是 |
| **uncapture 防截屏** | 主动剥离 `SetWindowDisplayAffinity` 的防截屏保护：注入时 `EnumWindows` 把本进程所有顶层窗口的 affinity 复位为 `WDA_NONE`，并钩住该 API 让后续再设防截屏也无效——让原本截图全黑的窗口可正常截屏/录屏 | 无（开箱即用） | 是 |
| **hook 通用拦截** | 对某 API：可**改入参**、可**改返回值**、可**完全不调用原函数返回 mock**（什么都不设=透传不拦截） | 模块 DLL、函数名、入参覆盖、调用原函数、返回值 | 是 |

**hook 的四种用法（任意组合）：**
- **改入参**：填“入参覆盖”，如 `0=0x2B,2=0`（序号 0~3 = 前 4 个参数→x64 的 RCX/RDX/R8/R9）；不填=不改。
- **改返回值**：勾“拦截返回值”并填值；不勾=用原函数的返回。
- **完全拦截/mock**：取消勾“调用原函数”→ 根本不调系统方法，直接返回你填的 mock 值。
- **透传**：什么都不设 → 调原函数、入参回参都不动（等于不拦截）。

> 入参/返回值都按 64 位整数/指针处理；改返回值时函数参数应 ≤4 个；浮点返回与“指针指向 mock 缓冲区”暂不支持。
> 加入目标窗口时会自动带一条默认 **keepalive** 规则（可改/删/关），开箱即保活。
> 规则编辑器**函数名自动补全**：解析所选 DLL 真实导出表（user32≈1046、kernel32≈1693、ntdll≈2516 个函数），边输入边匹配。

## 自动注入（通用一键规则）
底部 **「自动注入」** 开关打开后，渲染层每隔 N 秒（默认 5 秒，可调 2~60）自动做一轮巡检：

1. 重新枚举窗口，把**离线/PID 变动**的目标按「进程名 + 标题」重绑到当前活动窗口；
2. 对每个**在线、且挂了注入类规则（idle / fg / uncapture / hook）**的目标，检测其进程内是否已加载 `KeepAliveHook.dll`；
3. 没加载的就**自动写规则文件 + 注入**，让规则立即在新进程里生效。

这是一个**与具体程序无关的通用机制**：任何“会频繁重启 / 重连导致 PID 变化”的窗口（云电脑会话、反复重开的客户端等），只要给它配好注入类规则并打开自动注入，就能在 PID 一变时自动重新挂上，无需手动盯着点「注入」。

## 多对多与按窗口生效
注入类规则写入 DLL 同目录的 `KeepAliveHook.rules.txt`，每行带 **PID**；`spec` 描述拦截动作：

```
# 格式: pid|kind|enabled|dll|func|spec|name
# spec(hook): call=1/0;a0=..;a1=..;a2=..;a3=..;ret=..  (只写出现的键)
7808|idle|1|user32.dll|GetLastInputInfo||保活拦截
7808|fg|1||||前台伪装(防掉线)
7808|uncapture|1||||防截屏(剥离 affinity)
7808|hook|1|kernel32.dll|IsDebuggerPresent|call=0;ret=0|反调试(完全mock返回0)
25280|hook|1|user32.dll|GetSystemMetrics|call=1;a0=43;ret=7|另一个窗口:改入参后再改返回
```

每个被注入进程里的 DLL **只应用 pid 匹配自己的规则**（pid=0 表示全局）。于是“多个窗口、每个窗口多条规则”互不干扰。改完规则点【应用规则到选中窗口】会通过导出函数 `ReloadHooks` **热重载**，无需重新注入。

> **改规则 vs 改 DLL 代码**：在界面里增删/调整规则是**实时生效**的（`ReloadHooks` 重读规则文件）；只有当你要给 DLL 增加**新的能力（新 C++ 代码）**时才需重新跑 `npm run build:dll`（`scripts\build.bat`）编译——而且对已注入进程，换了 DLL 代码要先「卸载」再重新「注入」才会加载新代码（对同名已加载 DLL 再 `LoadLibrary` 不会重跑 `DllMain`）。

---

## 运行

```bat
npm install        :: 首次：装 electron + koffi
npm start          :: 启动；用注入功能时建议以管理员身份运行
```

> 纯 **keepalive 保活** 装好依赖即可用，无需 DLL。
> **注入类规则（idle / fg / uncapture / hook）** 需要 `bin\KeepAliveHook.dll`，先用 `npm run build:dll` 编译（见下）。该 DLL **随程序内置**（开发期取项目 `bin\`，打包后由主进程从 `resources\bin\` 复制到可写的 `userData\bin\`），注入时自动使用，界面不再暴露路径设置。
> 位数要一致：Electron 与目标进程都需 x64；注入更高完整性级别的进程要管理员权限。

**配置自动持久化**：目标窗口、规则、各开关设置都存到 `%APPDATA%\窗口保活与API拦截工具\state.json`，重启自动恢复。目标按「进程名 + 标题」重新绑定到当前活动窗口；对应程序没在跑则标记**离线**（保留规则，刷新或程序重开后自动重连）。

## 编译 C++ Hook DLL

运行 **`npm run build:dll`**（即 `scripts\build.bat`，用本机 VS2019 BuildTools，无需 .NET SDK）：`cl.exe` → `bin\KeepAliveHook.dll`（x64，导出 `ReloadHooks`）；链接后自动清理 `.obj/.lib/.exp` 中间产物，`bin\` 只留交付物。

## 打包 / 分发

基于 **Electron Forge + Vite**（`@electron-forge/plugin-vite` 分别打包 main / preload / renderer）。

```bat
npm run build:dll  :: 发版前先刷新 bin\KeepAliveHook.dll（C++ 不随打包自动编译）
npm run package    :: 生成未压缩应用目录 out\de-anti-capture-win32-x64\
npm run make       :: 生成分发包 out\make\：Squirrel 安装器 DeAntiCapture-Setup.exe + 便携 zip
```

- **koffi 原生 FFI** 是拆分包（JS 加载器 `koffi/` + 预编译二进制 `@koromix/koffi-win32-x64`）：Vite 将其 external（保持运行时 `require`），`forge.config.js` 用自定义 `ignore` 把这两个包留进包内，再由 `asar.unpack` 解出 `.node` 到 `app.asar.unpacked`（asar 内无法 `dlopen`）。三道闸缺一不可。
- **内置 DLL**：`extraResource: ['./bin']` 把 `bin\` 复制进 `resources\bin\`；打包版首启由 `resolveDll()` 复制到可写的 `userData\bin\` 再注入。
- 安装器用 **Squirrel.Windows**（每用户装到 `%LocalAppData%`、免管理员、利于自动更新）；不带“选择安装目录”向导，需要便携版就发 zip。

## 使用
`npm start` 启动（用注入功能时建议**以管理员身份运行**）。
1. 上方选窗口（可拖高度、可筛选；隐藏窗口点「显示隐藏」）→「加入目标」。
2. 左下选中目标 → 右下「添加规则」选类型并填配置 → 勾选启用。
3. keepalive 保活即时生效（标题栏「保活定时器」勾着）。
4. idle / fg / uncapture / hook 规则：选中目标 →「注入」；之后改规则点「应用规则」热生效；「卸载」还原。会变 PID 的窗口可打开底部 **「自动注入」**，PID 一变自动重挂。
5. 日志：界面底部活动日志（可展开）；DLL 内部日志 `%TEMP%\KeepAliveHook.log`。

---

## 已实测（本机真跑）
| 项 | 结果 |
|---|---|
| 跨进程鼠标移动保活 | ✅ 目标 `WM_MOUSEMOVE` 计数 0→10 |
| hook 透传(不设拦截) | ✅ `GetSystemMetrics(0)` 返回真实值不变 |
| hook 改入参 a0=43 | ✅ `GetSystemMetrics(0)` 实际执行成 `GetSystemMetrics(43)` |
| hook 完全mock call=0;ret=999 | ✅ 恒返回 999，原函数未调用 |
| hook 改入参+改返回 | ✅ 调原函数(参数43)后返回被改成 7 |
| idle 规则（空闲归零） | ✅ `GetLastInputInfo` 空闲→0ms |
| fg 前台伪装（GetForegroundWindow） | ✅ 无影云会话进程后台时仍返回自身主窗口（13 处导入命中） |
| uncapture 防截屏剥离 | ✅ 主动剥离 7 个顶层窗口的 affinity，原本全黑窗口恢复可截屏 |
| 按 PID 过滤 | ✅ 标错 PID 的规则不生效 |
| PE 导出解析（自动补全数据） | ✅ user32=1046/kernel32=1693/ntdll=2516 |
| 热重载 ReloadHooks / Electron 启动 | ✅ 正常 |
| 显示隐藏窗口（含 layered 投屏窗口） | ✅ 普通 26 / 全部 338，隐藏窗口带标记 |
| 自动注入（PID 变动自动重挂） | ✅ 巡检检测模块未加载即重注入 |
| 配置持久化 + 重启重绑/离线 | ✅ 目标/规则/设置恢复，按进程+标题重绑 |

## 源码
工程化为 **Electron Forge + Vite + TypeScript**，主进程 / 渲染层 / 原生桥 / shared 全量 TS（`main` 指向 Vite 产物 `.vite/build/index.js`）。

```
package.json                  Electron Forge 项目（main=.vite/build/index.js，由 Vite 生成）
forge.config.js               Forge：asar.unpack(koffi/@koromix)、extraResource(bin)、makers(squirrel+zip)、plugin-vite
vite.main.config.mjs          主进程打包（external: koffi/@koromix/.node；注入 APP_ROOT）
vite.preload.config.mjs       preload 打包（CJS 输出）
vite.renderer.config.mjs      渲染层打包（root=src/renderer、base './'、outDir 钉回顶层 .vite）
eslint.config.js / .prettierrc / .editorconfig / .gitattributes   工程基建
tsconfig.json                 渲染层 + shared 类型检查（编辑器 / Vite 拾取）
tsconfig.node.json            主进程 + preload + native + shared 类型检查（Node 环境）
vitest.config.ts              单测配置（Node 环境、@shared/@ 别名、koffi external）
src/
  main/                       主进程（TS，按职责拆分）
    index.ts                  入口：whenReady → setDefaultDll(resolveDll()) → registerIpc() → createWindow() → startHookLogTail()
    window.ts                 BrowserWindow + 渲染层/preload 加载（Forge Vite 魔法常量）、最大化状态同步
    dll.ts                    resolveDll（dev 用 APP_ROOT / 打包复制到 userData\bin）+ 默认 DLL 访问器
    ipc.ts                    注册全部 ipcMain 处理器（按 IpcInvokeMap 强类型 handle<K>）
    state.ts                  loadState/saveState（userData\state.json）
    logtail.ts                轮询 tail %TEMP%\KeepAliveHook.log，增量推送渲染层
    verify.ts                 一键验证：起探针 → 注入单条规则 → 对比注入前后观测
    paths.ts                  ICON / stateFile / hookLogFile / rulesFileFor
  config.ts                   写 KeepAliveHook.rules.txt（带 pid）
  preload.ts                  contextBridge 暴露 window.api（按 IpcApi 强类型）
  native/
    index.ts                  平台分派 + 能力标志；win32/darwin 用 create() 工厂（koffi.load 延迟到选中平台）
    types.ts                  NativeImpl 接口（两平台共同契约）
    win32.ts                  koffi 调 Win32：枚举/保活(PostMessage)/注入/卸载/热重载/模块检测
    peexports.ts              纯 TS 解析 PE 导出表（自动补全 + ReloadHooks RVA）
    darwin.ts                 macOS 非注入子集（inject 类 stub 返回明确错误）
  shared/                     主进程 ↔ 渲染层共享的单一数据源
    ipc/contract.ts           强类型 IPC 契约（IpcInvokeMap / IpcApi）
    types/*.ts                领域类型（Rule / Target / WindowInfo / HookEvent / …）
  renderer/                   渲染层（React 18 + TS，Zustand 状态）
    index.html  style.css  apidb.ts          外壳 / 样式 / Win32 API 签名库（含 ApiEntry 类型）
    index.tsx                 ReactDOM.createRoot 入口
    App.tsx                   根组件：挂载副作用 hooks + 布局
    lib/{api,format,hookparse,sig}.ts        桥接 / 文案 / 日志解析 / 函数签名（纯函数）
    store/{ui,windows,targets,settings,hookLog}Store.ts   Zustand 领域 store（高内聚、互不依赖）
    hooks/{useInitApp,useKeepAlive,useAutoInject,useAntiSleep,useHookLog,usePersistence}.ts   副作用封装
    components/{layout,windows,targets,rules,footer,icons,common}/*.tsx   UI 组件（按域分目录）
HookDll/                      C++ 注入 DLL（注入类规则依赖）
  dllmain.cpp                 注入入口
  hooks.cpp / hooks.h         配置驱动 IAT Hook（idle 替身 + fg 前台伪装 + uncapture 防截屏 + hook mock + 按 pid 过滤）
bin/                          KeepAliveHook.dll · inject_target.exe（构建产物，已 gitignore；运行时另写 KeepAliveHook.rules.txt）
test/                         Vitest 单测：unit/（纯逻辑）+ integration/（win32 原生层，缺 DLL 自动跳过）
  probe.cpp / inject_target.cpp   验证探针 / 注入靶子（C++ 源，由 scripts/build.bat / 手动编译）
scripts/                      构建 / 工具脚本（统一存放）
  build.bat                   编译 C++ DLL + probe → bin\（npm run build:dll）
  render-icon.ts              SVG → PNG 应用图标（npm run icon，electron + tsx）
```

## 云电脑 / 远程桌面（无影 / RDP）
云电脑（无影 WUYing 等）的空闲判定在**远端服务器**，本地发的 `PostMessage` 保活、甚至本地真实输入都不一定算数；而且**不能往云里传文件 / 装脚本**时，只能在**本地客户端进程里**用注入式 Hook 去骗过它的“是否有人在操作 / 是否被截屏”探测。本工具针对无影云客户端（本地进程 `stream_viewer.exe` 是会话窗口、`wuying.exe` 是外壳）做过实测：

- **本地枚举到的是客户端进程**：全屏/桌面模式下真正的投屏窗口是 `IsWindowVisible=false` 的 layered 窗口，被默认过滤——点窗口列表 **「显示隐藏」** 开关即可列出（带「隐藏」标记）。远端桌面里运行的程序是**远端窗口**，本地枚举不到，只能在远端机器里运行本工具。
- **防空闲掉线 → 用 `fg` 前台伪装规则**：无影云会话窗口（`stream_viewer.exe`）用 `GetForegroundWindow` 之类的前台门控来判断“你是不是在看/在操作”。给该目标挂一条 **fg** 规则注入后，即使它被丢到后台、你在用本地电脑做别的，它问到的前台窗口仍是它自己，远端不会判你空闲。**全程在后台、零闪屏、不动你的焦点和光标**。
  - `fg` 只 hook 无影自身模块（`stream_viewer.exe`、`salad.dll`），**自动跳过 Qt 平台插件 `qwindows.dll`、输入法窗及 `\platforms\`/`\plugins\` 目录的 DLL**——否则谎报前台会搞乱 Qt 窗口管理，把无影隐藏的 `ClipSDK` 安全剪贴板叠加窗顶成全屏白框（早期踩过的坑）。`uncapture` 也已设为永不触碰 `ClipSDK` 窗口。
- **防截屏（截图全黑）→ 用 `uncapture` 防截屏规则**：会话窗口可能用 `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` 让截图/录屏全黑。该保护通常**只在窗口创建时设置一次**，所以光靠钩 API 拦不到已经发生的那次调用——**uncapture** 规则会在注入时**主动 `EnumWindows` 把本进程顶层窗口的 affinity 复位为 `WDA_NONE`**，并钩住该 API 防止再次设置，截屏即可恢复正常。
- **PID 每次重连都会变** → 打开底部 **「自动注入」**：会话断开重连后 `stream_viewer.exe` 的 PID 会变，已注入的 DLL 随旧进程消失。把会话窗口加为目标、配好 `fg`(+ 需要时 `uncapture`)规则后打开自动注入，巡检会按「进程名+标题」重绑并对新 PID 自动重新注入。
- **最干净（治本，若你是管理员）**：在 **无影云控制台 → 云桌面/安全策略** 里关掉或调长“无操作自动断开/休眠”时间；能改策略就根本不用保活。

> 典型配置：把 `stream_viewer.exe`（会话窗口）加为目标 → 加 **fg 前台伪装** 规则（防掉线）+ **uncapture 防截屏** 规则（如需）→ 点「注入」→ 打开 **「自动注入」** 应对重连换 PID。

## 限制 / 注意
- **保活 `WM_MOUSEMOVE`** 只对“处理窗口鼠标消息/据此重置空闲”的程序有效；对“用 `GetLastInputInfo` 看系统空闲”的程序用 **idle** 规则；对**云电脑/远程桌面**用 **fg 前台伪装**（远端按前台门控判活）。
- **位数一致**：程序与 DLL 均 x64，只能注入 x64 进程（日志 `LoadLibraryW 返回 0` 多为位数不匹配）。
- **权限**：注入更高完整性级别进程需以管理员运行（`OpenProcess` 报错 5）；向更高 IL 窗口 `PostMessage` 会被 UIPI 拦截。
- **IAT Hook 盲区**：只拦导入表静态调用；目标用 `GetProcAddress` 动态取址则拦不到（需 inline hook，可接 MinHook）。`fg` / `uncapture` 因此在“目标静态导入了对应 API”时最稳。
- **杀软**：DLL 注入+改进程内存属敏感行为，可能被拦/误报。请仅在你拥有或获授权的设备/程序上使用。
