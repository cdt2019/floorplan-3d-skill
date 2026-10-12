// 画面状态：现在是第几步、墙长到多高、读图标注显示到哪、上色进度、终端窗口。
// 交互时从网址参数取初值；录视频时由 director.js 按时间线改。
import { create } from "zustand";
import { BAKED_VIEW, TOUR } from "./look/look.js";

const q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);

export const useScene = create((set) => ({
  stage: num("stage", 6),     // 1 图纸 · 2 读图 · 3 墙体 · 4 门窗 · 5 家具 · 6 完成
  grow: num("grow", 1),       // 第 3 步墙的高度 0~1
  reveal: num("reveal", 1),   // 第 2 步读图标注：0~0.33 墙、~0.66 门窗、~1 房间
  pop: num("pop", 1),         // 第 4、5 步门窗 / 家具出现的进度 0~1
  finish: num("finish", 0),   // 第 6 步从单色过渡到上色 0~1
  tod: q.has("tod") ? Number(q.get("tod")) : null, // look=pro：一天里的时间 0~1（null = 用预设自己的光）
  decor: num("decor", 1),     // look=pro&pbr：软装布置进度 0~1（一件件落下）
  floor: num("floor", 1),     // seq=final：地板淡入 0~1（成片时间线里地板不等上色那一步）
  // 第 3 轮"推进客厅、人眼高度"（seq=final 的最后一段；view=eye&baked 直接是终点状态）：
  rise: num("rise", BAKED_VIEW ? 1 : 0),   // 墙从剖切高度长到满高 0~1（软装的挂画、窗帘、吊灯跟着换到满高的位置）
  bake: num("bakek", BAKED_VIEW ? 1 : 0),  // 光照从实时过渡到烘焙 0~1
  desk: num("deskk", BAKED_VIEW ? 0 : 1),  // 书桌、底座、图纸、铅笔 1 → 0 淡出（进到模型里去）
  sky: num("sky", BAKED_VIEW ? 1 : 0),     // 窗外的蓝调天空 + 远处城市 0~1
  ceil: BAKED_VIEW,                        // 天花板（相机降到天花板以下才出现）
  inside: num("inside", BAKED_VIEW ? 1 : 0), // 后期从鸟瞰（移轴）过渡到人眼 0~1
  // 第 5 轮（漫游）：入户门开门进度、阳台 / 厨房推拉门推开的进度 0~1（门的规则见 look/doors.jsx）；成片里由导演推，其他视角都开着
  doorE: num("doorE", TOUR ? 0 : 1),
  slideB: num("slideB", TOUR ? 0 : 1),
  slideK: num("slideK", TOUR ? 0 : 1),   // 第 7 轮：漫游成片里厨房推拉门先关着，落地后走到门口时滑开
  vest: num("vest", TOUR ? 0 : 1),        // 入户门外的走廊 0~1（第 6 轮的漫游成片从屋顶降进来、不从门外进，一直是 0；人眼视角里是 1）
  set: (o) => set(o),
}));
if (typeof window !== "undefined") window.__scene = useScene;
