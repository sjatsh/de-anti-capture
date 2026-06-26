// 枚举到的桌面窗口信息（native.listWindows 产出，渲染层窗口列表消费）。
// hwnd 用十进制字符串承载 64 位句柄——JS number 存不下，全链路按字符串传递。
export interface WindowInfo {
  hwnd: string;
  pid: number;
  title: string;
  process: string;
  cls: string;
  visible: boolean;
}
