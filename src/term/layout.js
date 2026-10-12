// 终端窗口在画面上占哪块地方。终端和图纸并排：横版终端在左、图纸在右；竖版终端在上、图纸在下。
// TermPanel 按它摆终端窗口，导演按 paper 把图纸挪到剩下的那块（两边用同一份数字，才不会互相挡住）。
export function termArea(W = innerWidth, H = innerHeight) {
  if (H > W) return { box: { x: 12, y: 96, w: W - 24, h: H * 0.56 - 96 }, paper: { cx: 0.5, cy: 0.735 }, zoom: 0.76 };
  return { box: { x: 40, y: 100, w: W * 0.6, h: H - 100 - 24 }, paper: { cx: 0.82, cy: 0.54 }, zoom: 0.72 };
}
