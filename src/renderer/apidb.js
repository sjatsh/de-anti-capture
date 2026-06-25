/* ============================================================================
 *  内置 Win32 API 签名 / 作用库
 *  键 = 小写函数基名（A/W 变体去掉尾后缀，如 MessageBoxW → messagebox）。
 *  每项：{ dll, d:作用, r:返回类型, rd:返回值含义, p:[[参数名, 类型, 说明?], ...] }
 *  说明：x64 下前 4 个整型/指针参数走寄存器 RCX/RDX/R8/R9（hook 仅能覆盖这 4 个）。
 *        参数顺序即真实顺序；超过 4 个的参数在栈上，编辑器只渲染前 4 个。
 *  本库同时供「全量透传日志」(C++) 解释每次调用，故描述尽量贴近作用。
 * ========================================================================== */
window.API_DB = {
  /* ───────────── 反调试 / 调试检测 ───────────── */
  isdebuggerpresent:          { dll:'kernel32', d:'检测当前进程是否被调试器附加', r:'BOOL', rd:'非0=有调试器；反调试常 mock 成 0', p:[] },
  checkremotedebuggerpresent: { dll:'kernel32', d:'检测指定进程是否正被调试', r:'BOOL', rd:'调用成功=非0；是否被调试看 pbDebuggerPresent', p:[['hProcess','HANDLE','目标进程句柄'],['pbDebuggerPresent','PBOOL','输出：是否被调试']] },
  ntqueryinformationprocess:  { dll:'ntdll', n:5, d:'查询进程信息，反调试常查 ProcessDebugPort(7)/DebugObjectHandle(30)/DebugFlags(31)', r:'NTSTATUS', rd:'0=STATUS_SUCCESS', p:[['ProcessHandle','HANDLE','进程句柄'],['ProcessInformationClass','DWORD','查询类别'],['ProcessInformation','PVOID','输出缓冲'],['ProcessInformationLength','ULONG','缓冲字节数']] },
  ntsetinformationthread:     { dll:'ntdll', d:'设置线程信息，反调试用 HideFromDebugger(0x11) 让线程对调试器隐身', r:'NTSTATUS', rd:'0=STATUS_SUCCESS', p:[['ThreadHandle','HANDLE','线程句柄'],['ThreadInformationClass','DWORD','类别(0x11=HideFromDebugger)'],['ThreadInformation','PVOID','输入缓冲'],['ThreadInformationLength','ULONG','字节数']] },
  ntquerysysteminformation:   { dll:'ntdll', d:'查询系统信息，反调试常查 SystemKernelDebuggerInformation(0x23)', r:'NTSTATUS', rd:'0=STATUS_SUCCESS', p:[['SystemInformationClass','DWORD','类别'],['SystemInformation','PVOID','输出缓冲'],['SystemInformationLength','ULONG','字节数'],['ReturnLength','PULONG','输出：实际长度']] },
  ntclose:                    { dll:'ntdll', d:'关闭内核句柄，反调试用无效句柄触发异常探测调试器', r:'NTSTATUS', rd:'0=STATUS_SUCCESS', p:[['Handle','HANDLE','要关闭的句柄']] },
  outputdebugstring:          { dll:'kernel32', d:'向调试器输出一段字符串（反调试/日志）', r:'void', rd:'无返回值', p:[['lpOutputString','LPCTSTR','要输出的字符串']] },
  getthreadcontext:           { dll:'kernel32', d:'取线程寄存器上下文，反调试可查硬件断点 DR0-DR3', r:'BOOL', rd:'成功=非0', p:[['hThread','HANDLE','线程句柄'],['lpContext','LPCONTEXT','输出/输入上下文']] },

  /* ───────────── 时间 / 空闲计时 ───────────── */
  gettickcount:               { dll:'kernel32', d:'系统启动至今的毫秒数（约 49.7 天回绕）', r:'DWORD', rd:'毫秒数；反调试用两次差值测单步', p:[] },
  gettickcount64:             { dll:'kernel32', d:'系统启动至今的毫秒数（64 位不回绕）', r:'ULONGLONG', rd:'毫秒数', p:[] },
  timegettime:                { dll:'winmm', d:'多媒体定时器：系统时间毫秒', r:'DWORD', rd:'毫秒数', p:[] },
  queryperformancecounter:    { dll:'kernel32', d:'读取高精度性能计数器（反调试计时）', r:'BOOL', rd:'成功=非0；计数在 lpPerformanceCount', p:[['lpPerformanceCount','LARGE_INTEGER*','输出：当前计数']] },
  queryperformancefrequency:  { dll:'kernel32', d:'读取高精度计数器频率', r:'BOOL', rd:'成功=非0', p:[['lpFrequency','LARGE_INTEGER*','输出：每秒计数']] },
  getlastinputinfo:           { dll:'user32', d:'取最后一次用户输入时间（系统空闲判定关键）', r:'BOOL', rd:'成功=非0；想让空闲归零建议直接用 idle 规则', p:[['plii','PLASTINPUTINFO','输出：最后输入信息']] },
  getsystemtimeasfiletime:    { dll:'kernel32', d:'取当前系统时间（FILETIME）', r:'void', rd:'无返回值', p:[['lpSystemTimeAsFileTime','LPFILETIME','输出：时间']] },
  getsystemtime:              { dll:'kernel32', d:'取当前系统时间（UTC, SYSTEMTIME）', r:'void', rd:'无返回值', p:[['lpSystemTime','LPSYSTEMTIME','输出：时间']] },
  getlocaltime:               { dll:'kernel32', d:'取当前本地时间（SYSTEMTIME）', r:'void', rd:'无返回值', p:[['lpSystemTime','LPSYSTEMTIME','输出：时间']] },
  sleep:                      { dll:'kernel32', d:'当前线程休眠指定毫秒', r:'void', rd:'无返回值（不可改返回）', p:[['dwMilliseconds','DWORD','休眠毫秒数']] },
  sleepex:                    { dll:'kernel32', d:'可被 APC 唤醒的休眠', r:'DWORD', rd:'0=超时 / WAIT_IO_COMPLETION', p:[['dwMilliseconds','DWORD','毫秒'],['bAlertable','BOOL','是否可警告']] },
  setthreadexecutionstate:    { dll:'kernel32', d:'告诉系统正在工作以阻止休眠/息屏（防空闲）', r:'EXECUTION_STATE', rd:'之前的状态标志', p:[['esFlags','EXECUTION_STATE','ES_CONTINUOUS|ES_DISPLAY_REQUIRED|ES_SYSTEM_REQUIRED']] },

  /* ───────────── 系统 / 进程 信息 ───────────── */
  getsystemmetrics:           { dll:'user32', d:'取系统度量（屏幕宽高、显示器数、是否远程会话等）', r:'int', rd:'度量值；如 nIndex=80(SM_CMONITORS) 返回显示器数', p:[['nIndex','int','度量索引 SM_*']] },
  getversion:                 { dll:'kernel32', d:'取 Windows 版本（旧式）', r:'DWORD', rd:'低字=主次版本', p:[] },
  getversionex:               { dll:'kernel32', d:'取 Windows 版本（结构体）', r:'BOOL', rd:'成功=非0', p:[['lpVersionInformation','LPOSVERSIONINFO','输出/输入版本结构']] },
  getsysteminfo:              { dll:'kernel32', d:'取系统信息（CPU 数、架构、页大小等）', r:'void', rd:'无返回值', p:[['lpSystemInfo','LPSYSTEM_INFO','输出：系统信息']] },
  getnativesysteminfo:        { dll:'kernel32', d:'取真实系统信息（不受 WOW64 影响）', r:'void', rd:'无返回值', p:[['lpSystemInfo','LPSYSTEM_INFO','输出：系统信息']] },
  globalmemorystatusex:       { dll:'kernel32', d:'取内存使用情况', r:'BOOL', rd:'成功=非0', p:[['lpBuffer','LPMEMORYSTATUSEX','输出/输入内存结构']] },
  getcomputername:            { dll:'kernel32', d:'取本机计算机名', r:'BOOL', rd:'成功=非0', p:[['lpBuffer','LPTSTR','输出：名字'],['nSize','LPDWORD','缓冲大小/输出实际长度']] },
  getusername:                { dll:'advapi32', d:'取当前用户名', r:'BOOL', rd:'成功=非0', p:[['lpBuffer','LPTSTR','输出：用户名'],['pcbBuffer','LPDWORD','缓冲大小/输出长度']] },
  getcurrentprocessid:        { dll:'kernel32', d:'取当前进程 PID', r:'DWORD', rd:'当前进程 PID', p:[] },
  getcurrentthreadid:         { dll:'kernel32', d:'取当前线程 ID', r:'DWORD', rd:'当前线程 TID', p:[] },
  getcurrentprocess:          { dll:'kernel32', d:'取当前进程伪句柄', r:'HANDLE', rd:'伪句柄 (-1)', p:[] },
  getcommandline:             { dll:'kernel32', d:'取本进程完整命令行', r:'LPTSTR', rd:'命令行字符串指针', p:[] },
  getenvironmentvariable:     { dll:'kernel32', d:'取环境变量值', r:'DWORD', rd:'写入字符数；0=失败', p:[['lpName','LPCTSTR','变量名'],['lpBuffer','LPTSTR','输出：值'],['nSize','DWORD','缓冲字符数']] },
  getmodulehandle:            { dll:'kernel32', d:'取已加载模块基址（NULL=主模块）', r:'HMODULE', rd:'模块基址；0=未加载', p:[['lpModuleName','LPCTSTR','模块名或 NULL']] },
  getmodulefilename:          { dll:'kernel32', d:'取模块对应的磁盘路径', r:'DWORD', rd:'写入字符数', p:[['hModule','HMODULE','模块句柄/NULL'],['lpFilename','LPTSTR','输出：路径'],['nSize','DWORD','缓冲字符数']] },
  getprocaddress:             { dll:'kernel32', d:'取模块导出函数地址（IAT hook 盲区：动态取址绕过静态 hook）', r:'FARPROC', rd:'函数地址；0=未找到', p:[['hModule','HMODULE','模块句柄'],['lpProcName','LPCSTR','函数名或序号']] },
  getlasterror:               { dll:'kernel32', d:'取本线程最后错误码', r:'DWORD', rd:'错误码（0=无错误）', p:[] },
  setlasterror:               { dll:'kernel32', d:'设置本线程错误码', r:'void', rd:'无返回值', p:[['dwErrCode','DWORD','错误码']] },

  /* ───────────── 窗口 / 输入 ───────────── */
  messagebox:                 { dll:'user32', d:'弹出消息框', r:'int', rd:'按下的按钮 ID（IDOK=1, IDCANCEL=2, IDYES=6, IDNO=7）', p:[['hWnd','HWND','父窗口'],['lpText','LPCTSTR','正文'],['lpCaption','LPCTSTR','标题'],['uType','UINT','按钮/图标标志']] },
  messagebeep:                { dll:'user32', d:'播放系统提示音', r:'BOOL', rd:'成功=非0', p:[['uType','UINT','声音类型']] },
  findwindow:                 { dll:'user32', d:'按类名/标题查找顶层窗口', r:'HWND', rd:'窗口句柄；0=未找到', p:[['lpClassName','LPCTSTR','窗口类名或 NULL'],['lpWindowName','LPCTSTR','窗口标题或 NULL']] },
  findwindowex:               { dll:'user32', d:'在父窗口下按类名/标题查找子窗口', r:'HWND', rd:'窗口句柄；0=未找到', p:[['hWndParent','HWND','父窗口'],['hWndChildAfter','HWND','起始子窗口'],['lpszClass','LPCTSTR','类名'],['lpszWindow','LPCTSTR','标题']] },
  getforegroundwindow:        { dll:'user32', d:'取当前前台窗口', r:'HWND', rd:'前台窗口句柄', p:[] },
  setforegroundwindow:        { dll:'user32', d:'把窗口置为前台', r:'BOOL', rd:'成功=非0', p:[['hWnd','HWND','目标窗口']] },
  getwindowtext:              { dll:'user32', d:'取窗口标题文本', r:'int', rd:'拷贝的字符数', p:[['hWnd','HWND','窗口'],['lpString','LPTSTR','输出：标题'],['nMaxCount','int','缓冲字符数']] },
  getwindowthreadprocessid:   { dll:'user32', d:'取窗口所属线程 ID 和进程 PID', r:'DWORD', rd:'创建该窗口的线程 ID', p:[['hWnd','HWND','窗口'],['lpdwProcessId','LPDWORD','输出：进程 PID']] },
  getcursorpos:               { dll:'user32', d:'取鼠标光标屏幕坐标', r:'BOOL', rd:'成功=非0', p:[['lpPoint','LPPOINT','输出：坐标']] },
  setcursorpos:               { dll:'user32', d:'移动鼠标光标到屏幕坐标', r:'BOOL', rd:'成功=非0', p:[['X','int','屏幕 X'],['Y','int','屏幕 Y']] },
  getasynckeystate:           { dll:'user32', d:'查询某按键的实时状态', r:'SHORT', rd:'最高位=当前按下；次低位=曾按下', p:[['vKey','int','虚拟键码 VK_*']] },
  getkeystate:                { dll:'user32', d:'查询某按键在消息队列中的状态', r:'SHORT', rd:'高位=按下；低位=切换态', p:[['nVirtKey','int','虚拟键码']] },
  getkeyboardstate:           { dll:'user32', d:'取全部 256 个键的状态', r:'BOOL', rd:'成功=非0', p:[['lpKeyState','PBYTE','输出：256 字节键状态']] },
  showwindow:                 { dll:'user32', d:'显示/隐藏/最小化窗口', r:'BOOL', rd:'之前是否可见', p:[['hWnd','HWND','窗口'],['nCmdShow','int','显示方式 SW_*']] },
  setwindowpos:               { dll:'user32', n:7, d:'设置窗口位置/大小/Z序', r:'BOOL', rd:'成功=非0', p:[['hWnd','HWND','窗口'],['hWndInsertAfter','HWND','Z序基准'],['X','int','左'],['Y','int','上']] },
  setwindowdisplayaffinity:   { dll:'user32', d:'设置窗口防截屏/录屏亲和度', r:'BOOL', rd:'成功=非0', p:[['hWnd','HWND','窗口'],['dwAffinity','DWORD','WDA_NONE=0 / WDA_MONITOR=1 / WDA_EXCLUDEFROMCAPTURE=0x11']] },
  getwindowdisplayaffinity:   { dll:'user32', d:'取窗口的防截屏亲和度', r:'BOOL', rd:'成功=非0', p:[['hWnd','HWND','窗口'],['pdwAffinity','DWORD*','输出：亲和度']] },
  enumwindows:                { dll:'user32', d:'枚举所有顶层窗口（逐个回调）', r:'BOOL', rd:'成功=非0', p:[['lpEnumFunc','WNDENUMPROC','枚举回调'],['lParam','LPARAM','透传给回调的参数']] },
  iswindow:                   { dll:'user32', d:'判断句柄是否为有效窗口', r:'BOOL', rd:'是窗口=非0', p:[['hWnd','HWND','要判断的句柄']] },
  iswindowvisible:            { dll:'user32', d:'判断窗口是否可见', r:'BOOL', rd:'可见=非0', p:[['hWnd','HWND','窗口']] },
  getwindowrect:              { dll:'user32', d:'取窗口外框屏幕矩形', r:'BOOL', rd:'成功=非0', p:[['hWnd','HWND','窗口'],['lpRect','LPRECT','输出：矩形']] },
  postmessage:                { dll:'user32', d:'向窗口投递消息（不等待处理）', r:'BOOL', rd:'成功=非0', p:[['hWnd','HWND','目标窗口'],['Msg','UINT','消息 ID'],['wParam','WPARAM','参数1'],['lParam','LPARAM','参数2']] },
  sendmessage:                { dll:'user32', d:'向窗口发送消息（等待处理返回）', r:'LRESULT', rd:'由消息决定', p:[['hWnd','HWND','目标窗口'],['Msg','UINT','消息 ID'],['wParam','WPARAM','参数1'],['lParam','LPARAM','参数2']] },
  blockinput:                 { dll:'user32', d:'屏蔽/恢复鼠标键盘输入', r:'BOOL', rd:'成功=非0', p:[['fBlockInput','BOOL','TRUE=屏蔽']] },
  setwindowshookex:           { dll:'user32', d:'安装钩子（键鼠/消息等）', r:'HHOOK', rd:'钩子句柄；0=失败', p:[['idHook','int','钩子类型 WH_*'],['lpfn','HOOKPROC','钩子过程'],['hmod','HINSTANCE','模块'],['dwThreadId','DWORD','线程ID(0=全局)']] },
  sendinput:                  { dll:'user32', d:'合成键鼠输入（真实输入级别）', r:'UINT', rd:'成功注入的事件数', p:[['cInputs','UINT','事件个数'],['pInputs','LPINPUT','事件数组'],['cbSize','int','单事件字节数']] },
  mouse_event:               { dll:'user32', d:'合成鼠标事件（旧式）', r:'void', rd:'无返回值', p:[['dwFlags','DWORD','MOUSEEVENTF_*'],['dx','DWORD','X'],['dy','DWORD','Y'],['dwData','DWORD','滚轮/按钮数据']] },
  keybd_event:               { dll:'user32', d:'合成键盘事件（旧式）', r:'void', rd:'无返回值', p:[['bVk','BYTE','虚拟键码'],['bScan','BYTE','扫描码'],['dwFlags','DWORD','KEYEVENTF_*'],['dwExtraInfo','ULONG_PTR','附加信息']] },
  systemparametersinfo:       { dll:'user32', d:'读取/设置系统参数（屏保、壁纸、超时等）', r:'BOOL', rd:'成功=非0', p:[['uiAction','UINT','操作 SPI_*'],['uiParam','UINT','参数1'],['pvParam','PVOID','参数2/输出'],['fWinIni','UINT','是否写入用户配置']] },

  /* ───────────── 进程 / 内存 / 模块 ───────────── */
  openprocess:                { dll:'kernel32', d:'按 PID 打开进程句柄', r:'HANDLE', rd:'进程句柄；0=失败', p:[['dwDesiredAccess','DWORD','访问权限'],['bInheritHandle','BOOL','是否可继承'],['dwProcessId','DWORD','目标 PID']] },
  terminateprocess:           { dll:'kernel32', d:'强制结束进程', r:'BOOL', rd:'成功=非0', p:[['hProcess','HANDLE','进程句柄'],['uExitCode','UINT','退出码']] },
  exitprocess:                { dll:'kernel32', d:'结束当前进程', r:'void', rd:'无返回值（不可改返回）', p:[['uExitCode','UINT','退出码']] },
  getexitcodeprocess:         { dll:'kernel32', d:'取进程退出码', r:'BOOL', rd:'成功=非0', p:[['hProcess','HANDLE','进程句柄'],['lpExitCode','LPDWORD','输出：退出码(259=仍在运行)']] },
  createprocess:              { dll:'kernel32', n:10, d:'创建子进程', r:'BOOL', rd:'成功=非0', p:[['lpApplicationName','LPCTSTR','程序路径'],['lpCommandLine','LPTSTR','命令行'],['lpProcessAttributes','LPSECURITY_ATTRIBUTES','进程安全'],['lpThreadAttributes','LPSECURITY_ATTRIBUTES','线程安全']] },
  createremotethread:         { dll:'kernel32', n:7, d:'在目标进程创建线程（DLL 注入常用）', r:'HANDLE', rd:'线程句柄；0=失败', p:[['hProcess','HANDLE','目标进程'],['lpThreadAttributes','LPSECURITY_ATTRIBUTES','安全'],['dwStackSize','SIZE_T','栈大小'],['lpStartAddress','LPTHREAD_START_ROUTINE','线程入口']] },
  virtualalloc:               { dll:'kernel32', d:'在本进程提交/保留内存', r:'LPVOID', rd:'分配的基址；0=失败', p:[['lpAddress','LPVOID','建议地址/NULL'],['dwSize','SIZE_T','字节数'],['flAllocationType','DWORD','MEM_COMMIT|MEM_RESERVE'],['flProtect','DWORD','保护属性']] },
  virtualallocex:             { dll:'kernel32', n:5, d:'在目标进程分配内存（注入常用）', r:'LPVOID', rd:'分配的基址；0=失败', p:[['hProcess','HANDLE','目标进程'],['lpAddress','LPVOID','建议地址/NULL'],['dwSize','SIZE_T','字节数'],['flAllocationType','DWORD','分配类型']] },
  virtualprotect:             { dll:'kernel32', d:'修改内存页保护属性', r:'BOOL', rd:'成功=非0', p:[['lpAddress','LPVOID','起始地址'],['dwSize','SIZE_T','字节数'],['flNewProtect','DWORD','新保护(PAGE_*)'],['lpflOldProtect','PDWORD','输出：旧保护']] },
  writeprocessmemory:         { dll:'kernel32', n:5, d:'向目标进程写内存（注入/改内存）', r:'BOOL', rd:'成功=非0', p:[['hProcess','HANDLE','目标进程'],['lpBaseAddress','LPVOID','目标地址'],['lpBuffer','LPCVOID','源数据'],['nSize','SIZE_T','字节数']] },
  readprocessmemory:          { dll:'kernel32', n:5, d:'读目标进程内存', r:'BOOL', rd:'成功=非0', p:[['hProcess','HANDLE','目标进程'],['lpBaseAddress','LPCVOID','源地址'],['lpBuffer','LPVOID','输出缓冲'],['nSize','SIZE_T','字节数']] },
  loadlibrary:                { dll:'kernel32', d:'加载 DLL 到本进程', r:'HMODULE', rd:'模块基址；0=失败', p:[['lpLibFileName','LPCTSTR','DLL 路径/名']] },
  loadlibraryex:              { dll:'kernel32', d:'按标志加载 DLL', r:'HMODULE', rd:'模块基址；0=失败', p:[['lpLibFileName','LPCTSTR','DLL 路径'],['hFile','HANDLE','保留(NULL)'],['dwFlags','DWORD','加载标志']] },
  freelibrary:                { dll:'kernel32', d:'卸载 DLL', r:'BOOL', rd:'成功=非0', p:[['hLibModule','HMODULE','模块句柄']] },
  createtoolhelp32snapshot:   { dll:'kernel32', d:'对进程/模块/线程拍快照（枚举常用，反调试查父进程）', r:'HANDLE', rd:'快照句柄；INVALID(-1)=失败', p:[['dwFlags','DWORD','TH32CS_SNAPPROCESS 等'],['th32ProcessID','DWORD','目标 PID(0=全部)']] },
  process32first:             { dll:'kernel32', d:'取快照中第一个进程', r:'BOOL', rd:'成功=非0', p:[['hSnapshot','HANDLE','快照句柄'],['lppe','LPPROCESSENTRY32','输出/输入进程项']] },
  process32next:              { dll:'kernel32', d:'取快照中下一个进程', r:'BOOL', rd:'成功=非0；无更多=0', p:[['hSnapshot','HANDLE','快照句柄'],['lppe','LPPROCESSENTRY32','输出进程项']] },
  createmutex:                { dll:'kernel32', d:'创建/打开命名互斥体（多开检测常用）', r:'HANDLE', rd:'句柄；已存在则 GetLastError=ERROR_ALREADY_EXISTS', p:[['lpMutexAttributes','LPSECURITY_ATTRIBUTES','安全'],['bInitialOwner','BOOL','是否立即拥有'],['lpName','LPCTSTR','互斥体名']] },
  waitforsingleobject:        { dll:'kernel32', d:'等待内核对象（线程/事件等）', r:'DWORD', rd:'0=已就绪 / 0x102=超时', p:[['hHandle','HANDLE','对象句柄'],['dwMilliseconds','DWORD','超时毫秒(INFINITE=等到)']] },
  closehandle:                { dll:'kernel32', d:'关闭内核对象句柄', r:'BOOL', rd:'成功=非0', p:[['hObject','HANDLE','要关闭的句柄']] },

  /* ───────────── 文件 / 注册表 ───────────── */
  createfile:                 { dll:'kernel32', n:7, d:'打开/创建文件或设备', r:'HANDLE', rd:'句柄；INVALID(-1)=失败', p:[['lpFileName','LPCTSTR','路径'],['dwDesiredAccess','DWORD','GENERIC_READ/WRITE'],['dwShareMode','DWORD','共享模式'],['lpSecurityAttributes','LPSECURITY_ATTRIBUTES','安全']] },
  readfile:                   { dll:'kernel32', n:5, d:'从文件/设备读数据', r:'BOOL', rd:'成功=非0', p:[['hFile','HANDLE','文件句柄'],['lpBuffer','LPVOID','输出缓冲'],['nNumberOfBytesToRead','DWORD','要读字节数'],['lpNumberOfBytesRead','LPDWORD','输出：实际读取']] },
  writefile:                  { dll:'kernel32', n:5, d:'向文件/设备写数据', r:'BOOL', rd:'成功=非0', p:[['hFile','HANDLE','文件句柄'],['lpBuffer','LPCVOID','源数据'],['nNumberOfBytesToWrite','DWORD','要写字节数'],['lpNumberOfBytesWritten','LPDWORD','输出：实际写入']] },
  deletefile:                 { dll:'kernel32', d:'删除文件', r:'BOOL', rd:'成功=非0', p:[['lpFileName','LPCTSTR','路径']] },
  getfileattributes:          { dll:'kernel32', d:'取文件属性（也用于判断存在）', r:'DWORD', rd:'属性位；INVALID(-1)=不存在', p:[['lpFileName','LPCTSTR','路径']] },
  copyfile:                   { dll:'kernel32', d:'复制文件', r:'BOOL', rd:'成功=非0', p:[['lpExistingFileName','LPCTSTR','源'],['lpNewFileName','LPCTSTR','目标'],['bFailIfExists','BOOL','已存在是否失败']] },
  movefile:                   { dll:'kernel32', d:'移动/重命名文件', r:'BOOL', rd:'成功=非0', p:[['lpExistingFileName','LPCTSTR','源'],['lpNewFileName','LPCTSTR','目标']] },
  regopenkeyex:               { dll:'advapi32', n:5, d:'打开注册表键', r:'LONG', rd:'0=ERROR_SUCCESS', p:[['hKey','HKEY','根键 HKEY_*'],['lpSubKey','LPCTSTR','子键路径'],['ulOptions','DWORD','保留(0)'],['samDesired','REGSAM','访问权限']] },
  regqueryvalueex:            { dll:'advapi32', n:6, d:'读取注册表值', r:'LONG', rd:'0=ERROR_SUCCESS', p:[['hKey','HKEY','已打开键'],['lpValueName','LPCTSTR','值名'],['lpReserved','LPDWORD','保留(NULL)'],['lpType','LPDWORD','输出：值类型']] },
  regsetvalueex:              { dll:'advapi32', n:6, d:'写注册表值', r:'LONG', rd:'0=ERROR_SUCCESS', p:[['hKey','HKEY','已打开键'],['lpValueName','LPCTSTR','值名'],['Reserved','DWORD','保留(0)'],['dwType','DWORD','值类型 REG_*']] },
  regcreatekeyex:             { dll:'advapi32', n:9, d:'创建/打开注册表键', r:'LONG', rd:'0=ERROR_SUCCESS', p:[['hKey','HKEY','根键'],['lpSubKey','LPCTSTR','子键'],['Reserved','DWORD','保留(0)'],['lpClass','LPTSTR','类(NULL)']] },
  regclosekey:                { dll:'advapi32', d:'关闭注册表键句柄', r:'LONG', rd:'0=ERROR_SUCCESS', p:[['hKey','HKEY','键句柄']] },
  regdeletevalue:             { dll:'advapi32', d:'删除注册表值', r:'LONG', rd:'0=ERROR_SUCCESS', p:[['hKey','HKEY','键句柄'],['lpValueName','LPCTSTR','值名']] },

  /* ───────────── 加密 / 随机 ───────────── */
  cryptgenrandom:             { dll:'advapi32', d:'生成密码学随机字节', r:'BOOL', rd:'成功=非0', p:[['hProv','HCRYPTPROV','CSP 句柄'],['dwLen','DWORD','字节数'],['pbBuffer','BYTE*','输出/输入缓冲']] },
  systemfunction036:          { dll:'advapi32', d:'RtlGenRandom：快速生成随机字节', r:'BOOLEAN', rd:'成功=非0', p:[['RandomBuffer','PVOID','输出缓冲'],['RandomBufferLength','ULONG','字节数']] },

  /* ───────────── 网络 (Winsock / WinINet) ───────────── */
  connect:                    { dll:'ws2_32', d:'发起 TCP/UDP 连接', r:'int', rd:'0=成功 / SOCKET_ERROR(-1)', p:[['s','SOCKET','套接字'],['name','sockaddr*','目标地址'],['namelen','int','地址长度']] },
  send:                       { dll:'ws2_32', d:'在已连接套接字上发送数据', r:'int', rd:'发送字节数 / -1', p:[['s','SOCKET','套接字'],['buf','char*','数据'],['len','int','长度'],['flags','int','标志']] },
  recv:                       { dll:'ws2_32', d:'从套接字接收数据', r:'int', rd:'收到字节数 / 0=关闭 / -1', p:[['s','SOCKET','套接字'],['buf','char*','输出缓冲'],['len','int','缓冲长度'],['flags','int','标志']] },
  gethostbyname:              { dll:'ws2_32', d:'域名解析（旧式）', r:'hostent*', rd:'主机信息指针；NULL=失败', p:[['name','char*','主机名']] },
  getaddrinfo:               { dll:'ws2_32', d:'域名/服务解析（新式）', r:'int', rd:'0=成功', p:[['pNodeName','PCSTR','主机名'],['pServiceName','PCSTR','服务/端口'],['pHints','ADDRINFO*','过滤条件'],['ppResult','ADDRINFO**','输出：结果链表']] },
  wsastartup:                 { dll:'ws2_32', d:'初始化 Winsock', r:'int', rd:'0=成功', p:[['wVersionRequested','WORD','请求版本'],['lpWSAData','LPWSADATA','输出：实现信息']] },
  socket:                     { dll:'ws2_32', d:'创建套接字', r:'SOCKET', rd:'套接字；INVALID=失败', p:[['af','int','地址族(AF_INET)'],['type','int','类型(SOCK_STREAM)'],['protocol','int','协议']] },
  closesocket:                { dll:'ws2_32', d:'关闭套接字', r:'int', rd:'0=成功', p:[['s','SOCKET','套接字']] },
  internetopen:               { dll:'wininet', d:'初始化 WinINet 会话', r:'HINTERNET', rd:'会话句柄；NULL=失败', p:[['lpszAgent','LPCTSTR','User-Agent'],['dwAccessType','DWORD','访问方式'],['lpszProxy','LPCTSTR','代理'],['lpszProxyBypass','LPCTSTR','代理例外']] },
  internetopenurl:            { dll:'wininet', n:6, d:'打开一个 URL', r:'HINTERNET', rd:'句柄；NULL=失败', p:[['hInternet','HINTERNET','会话'],['lpszUrl','LPCTSTR','URL'],['lpszHeaders','LPCTSTR','附加头'],['dwHeadersLength','DWORD','头长度']] },
  httpopenrequest:            { dll:'wininet', n:8, d:'创建 HTTP 请求', r:'HINTERNET', rd:'请求句柄；NULL=失败', p:[['hConnect','HINTERNET','连接'],['lpszVerb','LPCTSTR','方法(GET/POST)'],['lpszObjectName','LPCTSTR','路径'],['lpszVersion','LPCTSTR','HTTP 版本']] },

  /* ───────────── GDI / 截屏 ───────────── */
  bitblt:                     { dll:'gdi32', n:9, d:'位块传送（截屏/绘制核心）', r:'BOOL', rd:'成功=非0', p:[['hdc','HDC','目标 DC'],['x','int','目标 X'],['y','int','目标 Y'],['cx','int','宽']] },
  createcompatibledc:         { dll:'gdi32', d:'创建兼容内存 DC（截屏用）', r:'HDC', rd:'DC 句柄；NULL=失败', p:[['hdc','HDC','参照 DC']] },
  getpixel:                   { dll:'gdi32', d:'取某点像素颜色', r:'COLORREF', rd:'RGB 颜色；CLR_INVALID=失败', p:[['hdc','HDC','DC'],['x','int','X'],['y','int','Y']] }
};
