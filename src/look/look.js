// 画质实验（look-spike）：网址带 ?look=pro 才启用，不带时一切照旧。
//   look=pro            真实光照 + 后期：透视鸟瞰、低角度暖阳 + 软阴影、柔光箱天光、AO / 泛光 / 移轴 / 暗角 / SMAA、Neutral 色调映射
//   look=pro&pbr        再换材质：Poly Haven 的 PBR 贴图（木地板、石膏墙、亚麻布、地砖）+ 茶几、绿植的 CC0 模型（node tools/fetch-assets.mjs 下载）
//   view=eye            人眼高度（1.6 米）站在客厅里看阳台；满层高 + 天花板，天光换成天空 HDRI
//   look=pt             路径追踪（three-gpu-pathtracer），材质同 pbr，累积采样出静帧（配 view=eye）
//   mood=m1|m2|m3|m4    氛围预设（配 look=pro&pbr）：一整套太阳、天光、曝光、配色、室内灯、后期、机位，见下面 MOODS
//   tod=0..1            一天里的时间：0 正午 → 0.55 金色时刻 → 0.8 蓝调 → 1 夜里（太阳、天光、背景、曝光、室内灯一起插值）
//                       带了 tod 就按 tod 算光，mood 只管配色、后期、机位；m3 本身就是 tod=0.82 再加两项微调
//   rec&day             录视频时完成后一天过去（导演按时间线把 tod 从 0 推到 1）
//   mood=m2a|m2b|m2c    第 2 轮：奶油阴天的三个"看得清"版本（胡桃木 + 炭灰 / 鼠尾草绿 / 陶土橙），光更硬、AO 更重、墙顶剖切面压深
//   seq=final           成片时间线（配 rec）：书桌上的图纸 → 墙长出来 → 门窗 → 家具 + 软装（白天，day2 那套配色）→ 一天过去 → 蓝调开灯 → 留给人眼推进的空位
//                       day2=m2a|m2b|m2c 换白天那套配色（默认 m2a）；不带 rec 时用 tod=0..1 看这条时间线上任一时刻的光
//   软装（decor）        look=pro&pbr 下自动按户型数据布置（规则见 decor.js），&nodecor 关掉
//   view=eye&baked      第 3 轮：人眼高度 + Blender 烘焙的光照贴图（蓝调开灯，m3 配色），流程见 bake.js；cam= tgt= 换机位
//                       seq=final 也用它：蓝调绕完以后推进客厅（书桌淡出、墙长到满高、光照换成烘焙的）、降到人眼高度慢慢推，共 40 秒；&nobake 不加载烘焙
//                       bake=export 导出给 Blender 的场景状态；bakeset= 烘焙文件夹（默认 <plan>-m3）；bexp= 屋里的曝光；lmk= 光照贴图亮度
//                       skyrot= skyk= 窗外天空的方向 / 亮度（改了要重新导出、重新烘焙）；ibloom= iao= ivig= 屋里的后期
//   第 4 轮（人眼漫游前的准备）：每个房间的家具都换成 Blender 建的（床 + 床品、衣柜、书桌、整体厨房、冰箱、卫生间三件套）；
//                       整套房子一张 4096 光照贴图（bake.py）、每个房间一张探针；入户门外一段走廊；
//                       night=n1|n2|n3 阳台夜景三个方案（第 5 轮起默认 n2，见 night.jsx；n0 = 第 3 轮的方块楼）；nightk= cityk= hazek= 夜景调参
//                       静帧：node tools/room-shots.mjs（每个房间一个人眼机位，见里面的 ROOMS）
//   第 6 轮：去掉白色人偶，绕圈结束时从入户门里面的上空直着降进屋里；第一人称改成房产 VR 带看那种稳、慢（厨房、卫生间也走进去），见 tour.js 的 ROUTE / plan()
//   第 5 轮（第一人称漫游）：seq=final 换成漫游成片（TOUR，时间线和机位在 tour.js：鸟瞰搭建 → 白色人偶走到入户门 → 扎进人偶变第一人称 →
//                       走遍每个房间 → 走上阳台看外滩，约 38.8 秒）；seq=r4 = 第 4 轮的成片。门的规则见 doors.jsx，烘焙用 <plan>-m5 那套
// 调参：exp=曝光  env=天光强度  envk=sky|studio  suni=太阳强度  sun=太阳仰角（度）  sunaz=太阳方位（度，0 = 正南，90 = 正西）
//       tm=neutral|agx|aces  cam=x,y,z  tgt=x,y,z  fov=  el=  az=  dist=  bg=背景色（不带 #）  路径追踪：tiles=  bounces=
//       带 mood 的鸟瞰不给 dist 时按画面比例自动算距离，模型正好装进画面（横版、竖版都适用）
import * as THREE from "three";

const q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const vec = (k) => (q.has(k) ? q.get(k).split(",").map(Number) : null);

export const LOOK = q.get("look");
export const PT = LOOK === "pt";
export const PRO = LOOK === "pro" || PT;
export const PBR = PRO && (q.has("pbr") || PT);
export const EYE = q.get("view") === "eye";
// 烘焙光照（第 3 轮）：view=eye&baked 人眼高度 + Blender 烘好的光照贴图（蓝调开灯，m3 配色）；bake=export 是给 Blender 导出场景用的同一个状态
// 成片时间线（seq=final）也会加载烘焙结果，用在最后"推进客厅、人眼高度"那段；&nobake 关掉。见 bake.js
export const BAKE_EXPORT = PRO && PBR && EYE && !PT && q.get("bake") === "export";
export const BAKED_VIEW = PRO && PBR && EYE && !PT && (q.has("baked") || BAKE_EXPORT);
export const EYE_RT = EYE && !BAKED_VIEW;            // 第 1 轮的实时人眼视角（白天，天空 HDRI，无灯）
export const EXPOSURE = num("exp", PT ? 2.0 : EYE_RT ? 1.35 : 1.0); // 路径追踪没有假的补光，屋里真实地暗，曝光要拉高
export const ENV = num("env", PT ? 1.0 : EYE_RT ? 0.5 : 1.0);   // 天光强度
export const ENV_KIND = q.get("envk") || (EYE_RT ? "sky" : "studio"); // sky = Poly Haven 天空 HDRI；studio = 程序生成的柔光箱
export const SUN = num("suni", EYE_RT ? 4.2 : 3.0);  // 太阳强度
export const BG = q.get("bg") ? "#" + q.get("bg") : "#ece8e2";
// seq=final 是第 5 轮的漫游成片（TOUR，见 director.js 的 TL_TOUR）；seq=r4 保留第 4 轮的成片时间线（推进客厅、人眼慢推）做对照
export const SEQ = PRO && !PT && !EYE && ["final", "r4"].includes(q.get("seq"));
export const TOUR = SEQ && q.get("seq") === "final";
export const DECOR = PBR && !q.has("nodecor");

// 太阳：傍晚，从西南偏西照过来，仰角低，影子拉长
const SUN_EL_DEG = num("sun", EYE_RT ? 22 : 36), SUN_AZ_DEG = num("sunaz", EYE_RT ? 30 : 58); // 从正南往西转；人眼视角让阳光从阳台门正对着照进来
// 从目标点指向太阳的单位向量（x 东、z 南）；落山以后方向停在地平线上方一点（强度另外归零）
export const sunDir = (elDeg, azDeg) => {
  const el = (Math.max(elDeg, 2) * Math.PI) / 180, az = (azDeg * Math.PI) / 180;
  return [-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
};
export const SUN_DIR = sunDir(SUN_EL_DEG, SUN_AZ_DEG);

// ---------- 光照状态 ----------
// 太阳仰角 / 方位 / 颜色 / 强度 / 阴影软硬（shadowR）/ 地面影子深浅（shadowOp）、天光强度和三块柔光板（顶、侧、地）+ 底色、
// 背景色、曝光、室内灯（lamps 0~1）、窗户透出的灯光（glow 0~1）
const DAYLIGHT = {
  sunEl: SUN_EL_DEG, sunAz: SUN_AZ_DEG, sunColor: "#ffe0c2", sunI: SUN, shadowR: 3, shadowOp: 0.22,
  env: ENV, envTop: "#fffaf2", envSide: "#e6eefa", envGround: "#f6eadb", envBg: "#d9d4cc",
  bg: BG, exp: EXPOSURE, lamps: 0, glow: 0,
};
// 一天的关键帧（tod → 光照状态），中间线性插值。太阳从南边扫到西边、落山；然后天光变蓝变暗，屋里灯亮
const TOD_KEYS = [
  [0.0, { sunEl: 62, sunAz: -20, sunColor: "#fff6ea", sunI: 3.1, shadowR: 2, shadowOp: 0.22, env: 1.0, envTop: "#fffaf2", envSide: "#e8eefa", envGround: "#f4ebde", envBg: "#dcd8d0", bg: "#ece8e2", exp: 1.0, lamps: 0, glow: 0 }],
  [0.3, { sunEl: 40, sunAz: 35, sunColor: "#ffe8cc", sunI: 3.2, shadowR: 2, shadowOp: 0.22, env: 0.95, envTop: "#fff6ea", envSide: "#e4ebf8", envGround: "#f4e8d8", envBg: "#dad3c8", bg: "#ece6dc", exp: 1.0, lamps: 0, glow: 0 }],
  [0.55, { sunEl: 15, sunAz: 62, sunColor: "#ffbd7e", sunI: 2.9, shadowR: 2.5, shadowOp: 0.24, env: 0.72, envTop: "#ffe6cc", envSide: "#c6d3ee", envGround: "#eedbc4", envBg: "#d4c4b2", bg: "#e6d9c9", exp: 1.05, lamps: 0.1, glow: 0.05 }],
  [0.68, { sunEl: 4, sunAz: 76, sunColor: "#ff8f52", sunI: 1.7, shadowR: 3, shadowOp: 0.2, env: 0.48, envTop: "#e6c0ae", envSide: "#8ea2cf", envGround: "#a39083", envBg: "#958b96", bg: "#a59ca4", exp: 1.12, lamps: 0.6, glow: 0.45 }],
  [0.8, { sunEl: -3, sunAz: 84, sunColor: "#ff7a45", sunI: 0, shadowR: 3, shadowOp: 0.12, env: 0.32, envTop: "#8fa6d8", envSide: "#5a72ad", envGround: "#383d52", envBg: "#2f3a55", bg: "#38435e", exp: 1.25, lamps: 1, glow: 1 }],
  [1.0, { sunEl: 58, sunAz: 84, sunColor: "#9db4ff", sunI: 0.22, shadowR: 4, shadowOp: 0.1, env: 0.15, envTop: "#5d71a8", envSide: "#2f3e6c", envGround: "#1d2131", envBg: "#161c2b", bg: "#151a27", exp: 1.35, lamps: 1, glow: 1 }],
];

// ---------- 氛围预设 ----------
// 第 2 轮：奶油阴天（m2）好看但太淡、看不清 → 三个配色版本共用一套"看得清"的光和后期：
//   太阳从西南偏南斜照（南墙亮、东墙暗，体块分得开），影子更实；天光压低，反差靠 AO 和对比度拉回来；泛光、移轴、暗角都减弱，背景不发灰；
//   墙顶剖切面比墙面深两档（像图纸上剖到的墙），缩到手机大小也能看出房间边界；木头、布艺压深一档。
// decor：软装配色（地毯、抱枕、床品、窗帘、挂画、书……），见 Decor.jsx
const M2_LIGHT = { sunEl: 46, sunAz: 38, sunColor: "#fff2e2", sunI: 2.3, shadowR: 4, shadowOp: 0.2, env: 0.95, envTop: "#fffaf3", envSide: "#efe9e0", envGround: "#eee4d6", envBg: "#e7dfd3", bg: "#f4efe7", exp: 1.0 };
const M2_POST = { tilt: 0.07, taper: 0.42, bloom: 0.05, bloomTh: 1.0, vig: 0.16, ao: 3.2, sat: 0.03, contrast: 0.1 };
const M2V = {
  m2a: {
    name: "奶油 · 胡桃木炭灰", desc: "奶油墙 · 胡桃木家具 · 炭灰色布艺点缀 · 中橡木地板",
    light: M2_LIGHT, post: M2_POST,
    palette: { wall: "#f3ede4", wallTop: "#8a7f74", frame: "#4b4139", furn: "#f1ebe2", furn2: "#d5cab9", furnWood: "#5a3f2d", fabric: "#4a4643", plant: "#5f7a4c", dark: "#2e2b29", glass: "#e4ebee" },
    floor: { lift: ["#a8a096", 0.35] },
    decor: {
      rug: "#d8cdbd", rugBorder: "#4a4643", rug2: "#ece3d5", runner: "#cbbfae", mat: "#8a7f74",
      pillows: ["#45413e", "#efe7da", "#a5744b", "#6e4c34"], throw: "#4a4643", duvet: "#f4efe7", sheet: "#fbf8f2", bedRunner: "#45413e",
      curtain: "#e8e0d2", frame: "#2e2b29", art: ["#3a3633", "#a5744b", "#d8ccb8", "#f3ede3"], books: ["#45413e", "#d8cdbd", "#a5744b", "#efe8dc", "#6b6560"],
      kettle: "#34312e", towel: "#efe8dd", metal: "#2b2826", wood: "#a37650", bistro: "#2f2c2a",
    },
  },
  m2b: {
    name: "奶油 · 鼠尾草绿", desc: "奶油墙 · 浅橡木 · 鼠尾草绿沙发和抱枕",
    light: M2_LIGHT, post: M2_POST,
    palette: { wall: "#f3eee5", wallTop: "#868c7c", frame: "#5b6152", furn: "#f2ede4", furn2: "#a3b096", furnWood: "#b48657", fabric: "#6f8466", plant: "#5f7a4c", dark: "#33362f", glass: "#e4ebee" },
    floor: { lift: ["#d6c8b4", 0.45] },
    decor: {
      rug: "#e4dccd", rugBorder: "#6f8466", rug2: "#eee7da", runner: "#c9cbb6", mat: "#868c7c",
      pillows: ["#6f8466", "#efe8dc", "#cdb68f", "#4f6249"], throw: "#e2d8c5", duvet: "#f5f1e9", sheet: "#fbf9f4", bedRunner: "#6f8466",
      curtain: "#ebe5d7", frame: "#b48657", art: ["#6f8466", "#cdb68f", "#ebe4d5", "#3d4a3a"], books: ["#6f8466", "#e4dccd", "#cdb68f", "#f2ede4", "#4f6249"],
      kettle: "#a3b096", towel: "#f1ede4", metal: "#3a3b35", wood: "#c49a6c", bistro: "#4f6249",
    },
  },
  m2c: {
    name: "奶油 · 陶土橙", desc: "奶油墙 · 暖橡木 · 陶土橙点缀（品牌色）",
    light: M2_LIGHT, post: M2_POST,
    palette: { wall: "#f4eee5", wallTop: "#9b8171", frame: "#5a3d2e", furn: "#f3ede4", furn2: "#e1d4c1", furnWood: "#9a6a44", fabric: "#c4623a", plant: "#5f7a4c", dark: "#3a2c25", glass: "#e4ebee" },
    floor: { lift: ["#c9a988", 0.25] },
    decor: {
      rug: "#e8ddcc", rugBorder: "#c4623a", rug2: "#efe5d7", runner: "#d9b99c", mat: "#9b8171",
      pillows: ["#c4623a", "#ece1d1", "#dda27a", "#8a4a2e"], throw: "#c4623a", duvet: "#f5f0e7", sheet: "#fbf8f2", bedRunner: "#c4623a",
      curtain: "#eee5d6", frame: "#5a3d2e", art: ["#c4623a", "#e3ae84", "#efe5d6", "#5b3a2c"], books: ["#c4623a", "#e8ddcc", "#dda27a", "#f3ede4", "#8a4a2e"],
      kettle: "#c4623a", towel: "#f1ebe1", metal: "#3a2c25", wood: "#b07a4c", bistro: "#5a3d2e",
    },
  },
};
// light：光照状态（见上）；palette：完成那一步上色的目标颜色（覆盖 theme.js 的 e3）；floor：PBR 木地板调色（tint 相乘、lift 往某个颜色混）
// post：后期（tilt 移轴强度、taper 焦带渐变宽度、bloom 泛光、vig 暗角、ao、sat 饱和度、contrast 对比度）
// cam：鸟瞰机位（仰角、方位、留边）；desk：放在底座上、摆在书桌上（手办感）
export const MOODS = {
  m1: {
    name: "午后暖阳", desc: "低角度暖阳 · 奶油墙 · 蜂蜜色木头 · 偏硬的长影子",
    light: { sunEl: 25, sunAz: 52, sunColor: "#ffe6c8", sunI: 3.4, shadowR: 1.2, shadowOp: 0.28, env: 0.8, envTop: "#fff5e8", envSide: "#dce6f6", envGround: "#f6e8d6", envBg: "#dcd4c8", bg: "#efe8de", exp: 1.0 },
    palette: { wall: "#f6f0e6", wallTop: "#ece3d5", frame: "#5b4636", furn: "#f4eee4", furn2: "#d9cab3", furnWood: "#b8895a", fabric: "#c8693f", plant: "#6d8a52", glass: "#d8e6ee" },
    floor: { lift: ["#d4ae84", 0.3] },
    post: { tilt: 0.14, taper: 0.32, bloom: 0.22, vig: 0.42, ao: 2.6, sat: 0.06, contrast: 0.04 },
  },
  m2: {
    name: "奶油阴天", desc: "阴天柔光 · 低反差 · 奶油 / 米色配色（奶油风）",
    light: { sunEl: 64, sunAz: 30, sunColor: "#fff9f2", sunI: 0.75, shadowR: 10, shadowOp: 0.1, env: 1.55, envTop: "#fffaf4", envSide: "#f6f0e8", envGround: "#f2e9dd", envBg: "#e8e1d7", bg: "#efe9e0", exp: 1.02 },
    palette: { wall: "#f5efe7", wallTop: "#ede5d9", frame: "#cbbcaa", furn: "#f7f2eb", furn2: "#e9dece", furnWood: "#d8bd98", fabric: "#ddcdb5", plant: "#8f9c78", dark: "#8e8479", glass: "#e8eef0" },
    floor: { lift: ["#dcc4a2", 0.5] },
    post: { tilt: 0.12, taper: 0.34, bloom: 0.12, vig: 0.26, ao: 1.7, sat: -0.04, contrast: -0.08 },
  },
  ...M2V,
  m3: {
    name: "蓝调时刻", desc: "日落后的蓝色天光 · 屋里开灯（软装规则放的台灯、落地灯、吊灯）· 和 m2a 是同一个家",
    tod: 0.82,
    light: { exp: 1.3, env: 0.5 },
    palette: M2V.m2a.palette, floor: M2V.m2a.floor, decor: M2V.m2a.decor,
    post: { tilt: 0.1, taper: 0.36, bloom: 0.7, bloomTh: 0.85, vig: 0.42, ao: 2.8, sat: 0.04, contrast: 0.1 },
  },
  m4: {
    name: "微缩手办", desc: "模型放在底座上、摆在书桌上 · 旁边一支铅笔 · m2a 的配色和光 · 移轴稍强",
    light: { ...M2_LIGHT, sunEl: 44, sunAz: 34, sunI: 2.5, shadowOp: 0, env: 0.95, bg: "#2c2824" },
    palette: M2V.m2a.palette, floor: M2V.m2a.floor, decor: M2V.m2a.decor,
    post: { ...M2_POST, tilt: 0.16, taper: 0.28, vig: 0.36, sat: 0.04 },
    cam: { el: 38, az: 38, margin: 0.04, fitPad: 1.0 }, // fitPad：框住模型再往外 1 米（第 1 轮是 2.6 米、按外包框算，模型太小）
    desk: true,
  },
};
// 成片时间线（seq=final）：白天用 day2 那套配色（默认 m2a），整段放在书桌上的底座上；机位见 director.js
const SEQ_DAY = SEQ ? (["m2a", "m2b", "m2c"].includes(q.get("day2")) ? q.get("day2") : "m2a") : null;
export const MOOD_ID = SEQ ? SEQ_DAY : PRO && MOODS[q.get("mood")] ? q.get("mood") : BAKED_VIEW ? "m3" : null; // 烘焙视角默认 m3（蓝调开灯）
export const MOOD = SEQ ? { ...MOODS[SEQ_DAY], cam: { el: 38, az: 36, fitPad: 0.1 }, desk: true } : MOOD_ID ? MOODS[MOOD_ID] : null;
export const TOD = PRO && q.has("tod") && !SEQ ? Number(q.get("tod")) : null;
export const DAY = PRO && q.has("rec") && q.has("day") && !SEQ; // 录视频：完成后一天过去
export const DYN = DAY || SEQ;                               // 光照每帧在变：天光（柔光箱）每帧重画
export const LAMPS = PRO && !EYE_RT && !!(MOOD || TOD != null || DAY); // 加台灯 / 落地灯 / 吊灯（灯具本身白天也在）
// 点光源只在会开灯的时候挂（静态的白天预设不挂，省性能、也不用多编译着色器）
export const LAMP_LIGHTS = LAMPS && (DAY || SEQ || TOD != null || (MOOD?.tod ?? 0) > 0.5);
export const DESK = !!MOOD?.desk && !EYE;

const C = new THREE.Color(), D = new THREE.Color();
const lerpState = (a, b, u) => {
  const o = {};
  for (const k of Object.keys(a)) {
    if (typeof a[k] === "number") o[k] = a[k] + (b[k] - a[k]) * u;
    else o[k] = "#" + C.set(a[k]).lerp(D.set(b[k]), u).getHexString(); // THREE.Color 内部是线性空间，插值在线性空间里做
  }
  return o;
};
export function todState(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < TOD_KEYS.length; i++) {
    const [t1, s1] = TOD_KEYS[i];
    if (t <= t1) { const [t0, s0] = TOD_KEYS[i - 1]; return lerpState(s0, s1, (t - t0) / (t1 - t0)); }
  }
  return { ...TOD_KEYS[TOD_KEYS.length - 1][1] };
}
// 成片时间线的光：u = 0 白天（day2 那套）→ 0.32 下午 → 0.56 金色时刻 → 0.74 日落刚过（屋里开灯）→ 1 蓝调（= m3）。
// 第 1 轮日落发紫发灰：橙色太阳 + 偏紫的蓝色天光混出来的。这里天光先跟着太阳一起变暖、变暗，太阳落下去以后才转蓝，
// 蓝色也偏青（不偏紫）；转蓝那一段画面已经暗了、屋里灯亮了，看到的是"天黑了"，不是"发灰"
function seqKeys() {
  const day = { ...DAYLIGHT, ...MOOD.light, lamps: 0, glow: 0 };
  const night = { ...todState(MOODS.m3.tod), ...MOODS.m3.light };
  return [
    [0, day],
    [0.32, { ...day, sunEl: 30, sunAz: 52, sunColor: "#ffe4c4", sunI: 2.5, shadowR: 3, env: 0.85, envTop: "#fff2e2", envSide: "#f0e4d4", envGround: "#efdfca", envBg: "#e9d9c4", bg: "#f0e4d3" }],
    [0.56, { ...day, sunEl: 11, sunAz: 66, sunColor: "#ffb273", sunI: 2.6, shadowR: 2.5, shadowOp: 0.22, env: 0.6, envTop: "#ffdcb6", envSide: "#e6cdb2", envGround: "#dcb994", envBg: "#d9b893", bg: "#e2c3a0", exp: 1.04, lamps: 0.12, glow: 0.08 }],
    [0.74, { ...day, sunEl: 1, sunAz: 76, sunColor: "#ffa457", sunI: 0.35, shadowR: 3, shadowOp: 0.14, env: 0.5, envTop: "#9aa9bd", envSide: "#7b97bd", envGround: "#4d4a44", envBg: "#46526a", bg: "#4a566e", exp: 1.18, lamps: 0.75, glow: 0.65 }],
    // 太阳落下以后换成一点冷色的月光（从高处照下来）：书桌和模型外墙不至于黑成一片，蓝调的感觉也出来了。
    // 方向在强度为 0 的那一段里挪过去，看不到跳变
    [0.86, { ...night, sunEl: 52, sunAz: 70, sunColor: "#a9bfff", sunI: 0, env: 0.7 }],
    [1, { ...night, sunEl: 52, sunAz: 70, sunColor: "#a9bfff", sunI: 0.4, shadowR: 4, shadowOp: 0.1, env: 0.85 }],
  ];
}
let SEQ_KEYS = null;
function seqState(u) {
  const K = (SEQ_KEYS ??= seqKeys());
  u = Math.max(0, Math.min(1, u));
  for (let i = 1; i < K.length; i++) if (u <= K[i][0]) return lerpState(K[i - 1][1], K[i][1], (u - K[i - 1][0]) / (K[i][0] - K[i - 1][0]));
  return { ...K[K.length - 1][1] };
}
// 网址里显式给的调参压过预设
const OVR = Object.entries({ exp: "exp", env: "env", sunI: "suni", sunEl: "sun", sunAz: "sunaz" }).filter(([, k]) => q.has(k));
// 当前光照状态：tod（网址或导演给的）优先；否则用预设自己的光（m3 = tod 0.82 + 微调）；都没有就是原来的傍晚暖阳
export function lightAt(tod = null) {
  let s;
  if (SEQ) s = seqState(tod ?? (q.has("tod") ? Number(q.get("tod")) : 0));
  else if (tod != null) s = todState(tod);
  else if (MOOD?.tod != null) s = { ...todState(MOOD.tod), ...MOOD.light };
  else s = { ...DAYLIGHT, ...(MOOD?.light || {}) };
  for (const [k, p] of OVR) s[k] = Number(q.get(p));
  if (q.get("bg")) s.bg = BG;
  return s;
}

// ---------- 相机 ----------
// 让盒子装进画面：相机从 dir（单位向量，从目标指向相机）方向看 target，返回需要的距离。
// 相机基和 Object3D.lookAt 一样（世界 up = +y）；每个角点要求 |x| ≤ tan(半视角)·深度、|y| 同理，取最大。
// box 可以是 Box3（取 8 个角），也可以直接给一组点
const corners = (b) => Array.from({ length: 8 }, (_, i) => new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
const camBasis = (dir) => {
  const z = new THREE.Vector3(...dir).normalize(), x = new THREE.Vector3(0, 1, 0).cross(z).normalize();
  return { x, y: new THREE.Vector3().crossVectors(z, x), z };
};
export function fitDistance(box, target, dir, fovDeg, aspect, margin = 0.08) {
  const { x, y, z } = camBasis(dir);
  const ty = Math.tan((fovDeg * Math.PI) / 360) * (1 - margin), tx = Math.tan((fovDeg * Math.PI) / 360) * aspect * (1 - margin);
  const p = new THREE.Vector3(), t = new THREE.Vector3(...target);
  let R = 0;
  for (const c of box.isBox3 ? corners(box) : box) {
    p.copy(c).sub(t);
    const pz = p.dot(z);
    R = Math.max(R, Math.abs(p.dot(x)) / tx + pz, Math.abs(p.dot(y)) / ty + pz);
  }
  return R;
}
// 装进画面并且居中：先按 t0 算距离，再看这些点投到画面上偏哪边，把看向的点挪过去，迭代几次
export function fitView(pts, t0, dir, fovDeg, aspect, margin = 0.08) {
  const { x, y, z } = camBasis(dir);
  const ty = Math.tan((fovDeg * Math.PI) / 360) * (1 - margin), tx = ty * aspect;
  const t = new THREE.Vector3(...t0), q = new THREE.Vector3();
  let R = 0;
  for (let it = 0; it < 5; it++) {
    R = fitDistance(pts, t.toArray(), dir, fovDeg, aspect, margin);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      q.copy(p).sub(t);
      const d = R - q.dot(z), sx = q.dot(x) / (d * tx), sy = q.dot(y) / (d * ty);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    t.addScaledVector(x, ((x0 + x1) / 2) * tx * R * 0.9).addScaledVector(y, ((y0 + y1) / 2) * ty * R * 0.9);
  }
  return { target: t.toArray(), R: fitDistance(pts, t.toArray(), dir, fovDeg, aspect, margin) };
}
// 仰角、方位（度）→ 从目标指向相机的单位向量；方位 0 = 相机在南边，45 = 东南
export const dirOf = (elDeg, azDeg) => {
  const el = (elDeg * Math.PI) / 180, az = (azDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
};
// 模型的盒子（剖切后的高度）
export function modelBox(bounds, cut = 1.5) {
  const [x0, z0, x1, z1] = bounds;
  return new THREE.Box3(new THREE.Vector3(x0 - 0.3, -0.16, z0 - 0.3), new THREE.Vector3(x1 + 0.3, cut, z1 + 0.3));
}
// 手办预设：底座比图纸四周大 0.5 米，高 1.2 米（1:100 就是 1.2 厘米）
export const PLINTH_H = 1.2;
export function plinthBox(sheet) {
  return new THREE.Box3(new THREE.Vector3(sheet.x0 - 0.5, -0.02 - PLINTH_H, sheet.z0 - 0.5), new THREE.Vector3(sheet.x1 + 0.5, -0.02, sheet.z1 + 0.5));
}
export const aspectNow = () => (typeof innerWidth !== "undefined" ? innerWidth / innerHeight : 16 / 9);
// 竖版画面窄，视角放宽一点，不然要退到很远、透视也太平
export const proFov = (aspect = aspectNow()) => num("fov", EYE ? 48 : aspect < 1 ? 46 : 32);
export const CAM_EL = num("el", MOOD?.cam?.el ?? 42), CAM_AZ = num("az", MOOD?.cam?.az ?? 45);
// 竖版留边：第 1 轮 0.05 太贴边，第 2 轮（带 decor 的预设）至少 0.13
export const camMargin = (aspect = aspectNow()) => (aspect < 1 && (DECOR || SEQ) ? Math.max(0.13, MOOD?.cam?.margin ?? 0) : MOOD?.cam?.margin ?? (aspect < 1 ? 0.05 : 0.1));
// 看向盒子中心（高度压低一点，模型在画面里略偏上、底下留给影子）
export const boxTarget = (box) => { const c = box.getCenter(new THREE.Vector3()); return [c.x, Math.min(c.y, 0.4), c.z]; };

// 鸟瞰要装进画面的盒子：模型（手办预设再往外放 fitPad 米，露出底座边和桌面）
export function fitBox(bounds, cut = 1.5) {
  const b = modelBox(bounds, cut), p = MOOD?.cam?.fitPad || 0;
  return p ? b.expandByVector(new THREE.Vector3(p, 0, p)) : b;
}
// 要装进画面的点：每个房间矩形的四个角（往外 0.3 米，手办预设再加 fitPad）× 地面 / 剖切高度。
// L 形、凹进去的户型不会因为外包框的空角而在画面里缩小（第 2 轮起带 mood 的鸟瞰都用它）
export function fitPoints(plan, bounds, cut = 1.5) {
  if (!plan) return corners(fitBox(bounds, cut));
  const pts = [], pad = 0.3 + (MOOD?.cam?.fitPad || 0);
  for (const { rect: [x0, z0, x1, z1] } of plan.rooms)
    for (const [x, z] of [[x0 - pad, z0 - pad], [x1 + pad, z0 - pad], [x0 - pad, z1 + pad], [x1 + pad, z1 + pad]])
      for (const yy of [-0.16, cut]) pts.push(new THREE.Vector3(x, yy, z));
  return pts;
}

// 相机：鸟瞰 = 透视 3/4 俯视（像桌上的建筑模型）；人眼 = 站在客厅东北角看阳台
// box：带 mood 时要装进画面的盒子，看向模型中心（不带 mood 保持原来的固定机位，老截图可比）
export function proCamera(center, box, bounds) {
  if (EYE) {
    return { position: vec("cam") || [4.4, 1.6, 3.9], fov: num("fov", 48), target: vec("tgt") || [2.3, 1.05, 9.0] };
  }
  if (box && MOOD && !q.has("dist") && !q.has("cam")) {
    const fov = proFov(), dir = dirOf(CAM_EL, CAM_AZ), t0 = vec("tgt") || boxTarget(modelBox(bounds));
    const { target: t, R } = q.has("tgt") ? { target: t0, R: fitDistance(box, t0, dir, fov, aspectNow(), camMargin()) } : fitView(box, t0, dir, fov, aspectNow(), camMargin());
    return { position: t.map((v, i) => v + dir[i] * R), fov, target: t };
  }
  const el = (num("el", 42) * Math.PI) / 180, az = (num("az", 45) * Math.PI) / 180, R = num("dist", 23);
  const t = vec("tgt") || [center[0] + 0.3, 0, center[2] + 0.2];
  return {
    position: vec("cam") || [t[0] + Math.sin(az) * Math.cos(el) * R, t[1] + Math.sin(el) * R, t[2] + Math.cos(az) * Math.cos(el) * R],
    fov: num("fov", 32), target: t,
  };
}

// 图纸（纸面）不吃点光源：点光源不投影，屋里的台灯会穿过外墙把墙外的纸照亮一圈；纸只受太阳和天光
export function noPointLights(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <lights_fragment_begin>",
      THREE.ShaderChunk.lights_fragment_begin.replace("#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )", "#if 0"));
  };
  mat.customProgramCacheKey = () => "noPointLights";
  return mat;
}
