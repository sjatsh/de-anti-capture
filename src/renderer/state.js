// 渲染层共享的可变单例 state。所有模块 import 同一引用，一律通过 state.x 改写
// （可整体重设 state.targets = ...，但不要把要写的字段先解构成局部）——复刻原闭包共享语义。
export const state = {
  allWindows: [],
  targets: [],
  selWin: null,
  selTarget: null,
  selRule: -1,
  dllPath: '', // 永远指向内置 DLL（主进程 resolveDll 解析），界面不暴露任何路径设置
  showAll: false,
  logAll: false,
  funcs: [],
  _restoring: false,
  hookStats: {}, // 解析拦截日志得到的每 pid 挂钩状态：{ [pid]: { installs:{'kind|dll|func':slots}, active, strips } }
  hookView: 'activity', // 底部日志面板当前标签：activity | hook
  hookUnread: 0, // 「拦截日志」标签未读新行计数
};

let _uid = 0;
export const newUid = () => 'u' + (++_uid);
