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
};

let _uid = 0;
export const newUid = () => 'u' + (++_uid);
