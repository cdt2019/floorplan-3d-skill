// 导演：录视频用，网址带 ?rec 时启用（?rec=v 竖版）。按时间线改画面状态和镜头；录制脚本每帧调用 __director.frame(毫秒)。
// 终端回放的时间表（TERM_KEYS）按真实录像来定：打字、写文件按原速，长时间思考的那段压缩，画面上会标出加速倍数。
// look=pro（透视相机）：不带终端（没有 cast）时用紧凑时间线 TL_PRO——图纸俯视 → 斜下来、墙长出来 → 门窗 → 家具 → 上色 → 慢慢绕；
// 相机距离按画面比例自动贴合（横版、竖版都装得下），带 day 再过一天（tod 0.1 → 1）。带 cast 时沿用原时间线，正交的缩放换算成透视的距离。
// seq=final（成片）：TL_SEQ——书桌上的图纸 → 墙 → 门窗 → 家具 → 软装一件件落下 → 停一下 → 一天过去 → 蓝调开灯、慢慢绕 →
// 推进客厅（书桌淡出、墙长到满高、光照换成 Blender 烘焙的）→ 降到人眼高度慢慢推（共 40 秒）。
import * as THREE from "three";
import { useScene } from "./store.js";
import { termArea } from "./term/layout.js";
import { PRO, DAY, SEQ, TOUR, CAM_EL, CAM_AZ, camMargin, fitDistance, fitView, fitPoints, dirOf, modelBox, boxTarget } from "./look/look.js";
import { TL_TOUR, TOUR_IN, ORBIT_A, B0, C0, T_LAND, EYE_H, descentKeys, buildWalk, makeTrack } from "./look/tour.js";
import { sheetBounds } from "./plan/drawPlan.js";
import { FULL_CUT } from "./look/inside.jsx";
import { sourceFor } from "./plan/load.js";

const Q = new URLSearchParams(location.search);
const vertical = Q.get("rec") === "v";
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const seg = (t, a, b) => ease(clamp01((t - a) / (b - a)));
const lerp = (a, b, u) => a + (b - a) * u;

// ---------- 时间线（视频秒） ----------
const COMPACT = PRO && !Q.has("cast") && Q.get("tl") !== "full";
const TL_PRO = {
  term: null, reveal: null,  // 没有终端、不标读图结果
  tilt: [0.8, 4.6],          // 俯视图纸 → 3/4 鸟瞰
  walls: [2.0, 5.4],
  openings: [5.6, 7.6],
  furniture: [7.8, 10.8],
  finish: [11.0, 13.8],
  decor: [11.2, 14.2],       // 软装（look=pro&pbr）跟上色一起落下
  ...(DAY ? { day: [14.6, 22.6], end: 24 } : { end: 17 }), // 一天过去 8 秒
};
// 成片时间线（seq=final）：一开始就是上色后的配色（白天那套），地板在墙长出来时淡入，不用橙色高亮
const TL_SEQ = {
  term: null, reveal: null,
  open: [0, 2.0],            // 书桌上的图纸：斜上方慢慢推近（底座、桌面、铅笔都在画面里）
  tilt: [1.4, 5.0],          // 推到 3/4 鸟瞰、靠近模型
  floor: [2.0, 3.6],         // 地板淡入，盖住图纸
  walls: [2.4, 5.2],
  openings: [5.3, 6.8],
  furniture: [6.8, 9.4],
  decor: [8.8, 13.6],        // 软装一件件落下：铺地毯 → 床品抱枕 → 灯、边几、椅子 → 摆件 → 绿植 → 挂画 → 窗帘
  finish: [0, 0.01],
  hold: [13.6, 15.2],        // 白天停一下
  day: [15.2, 23.2],         // 一天过去 8 秒
  night: [23.2, 27.4],       // 蓝调开灯，慢慢绕
  // 第 3 轮：推进客厅、降到人眼高度，再慢慢推一段（光照从实时换成 Blender 烘焙的，见 look/bake.js）
  push: [27.4, 32.6],        // 从鸟瞰推近客厅：书桌淡出、墙长到满高、光照换成烘焙的，俯看客厅转个身，从敞开的顶上降进去
  dolly: [32.6, 40.0],       // 人眼高度（1.6 米）从餐桌那头往阳台方向慢慢推：吊灯、落地灯、窗外的蓝调
  slot: [27.4, 40.0],
  end: 40.0,
};
// 推进那段里各件事的时间
const TL_IN = {
  desk: [27.5, 29.2],        // 书桌、底座、图纸、铅笔淡出
  bake: [28.0, 30.0],        // 光照：实时 → 烘焙（墙在 27.9 秒换成满高版、拿到光照贴图以后再开始过渡）
  rise: [27.9, 30.5],        // 墙从 1.5 米长到 2.8 米
  inside: [28.6, 31.6],      // 后期：移轴 → 人眼
  sky: [31.0, 32.6],         // 窗外的天和城市淡入（这时相机已经在屋里，只能从窗户看出去）
};
export const TL = TOUR ? TL_TOUR : SEQ ? TL_SEQ : COMPACT ? TL_PRO : {
  term: [3, 17],        // 终端窗口在画面上的时间
  tilt: [17.2, 20.5],   // 俯视 → 斜视
  reveal: [18.5, 23],   // 读图结果标到图纸上
  walls: [23, 27.5],
  openings: [28, 31.5],
  furniture: [32, 36.5],
  finish: [37.5, 43],
  decor: [38, 43.5],
  end: 48,
};
// 终端回放：[视频秒（相对终端出现）, 录像秒]，由 setTermKeys 按真实录像填
let TERM_KEYS = [[0, 0], [12, 12]];
export const setTermKeys = (k) => { TERM_KEYS = k; };
export const termKeys = () => TERM_KEYS;

// ---------- 镜头 ----------
// 正投影相机绕目标点转：el 仰角、az 方位角（度）、zoom 缩放；target 看向的点
const TOP = { el: 89.5, az: 0, zoom: 36, target: [5.6, 0, 5.7] }; // az 0：图纸正着放，上北下南
const ISO = { el: 40.3, az: 45, zoom: 52, target: [6.6, 0, 4.5] };
function camAt(t) {
  const u = seg(t, ...TL.tilt);
  const orbit = seg(t, TL.finish[0], TL.end) * 28; // 完成那段慢慢绕
  const c = {
    el: lerp(TOP.el, ISO.el, u), az: lerp(TOP.az, ISO.az, u) + orbit, zoom: lerp(TOP.zoom, ISO.zoom, u) * (vertical ? 0.58 : 1) * (1 + 0.06 * seg(t, TL.finish[0], TL.end)),
    target: TOP.target.map((v, i) => lerp(v, ISO.target[i], u)),
  };
  // 终端在画面上时，图纸缩小、让到终端旁边（横版右侧、竖版下方），一边看 AI 干活一边看它读的那张图
  const k = seg(t, TL.term[0] - 0.2, TL.term[0] + 0.8) * (1 - seg(t, TL.term[1] - 0.8, TL.tilt[0] + 1.2));
  // 竖版：上面有标题、步骤和面积表，模型整体往下挪一点（沿屏幕"上"方向移动看向的点）
  if (vertical && k < 1) {
    const e = (c.el * Math.PI) / 180, a = (c.az * Math.PI) / 180, s = ((0.07 * innerHeight) / c.zoom) * (1 - k);
    c.target = [c.target[0] - Math.sin(a) * Math.sin(e) * s, c.target[1] + Math.cos(e) * s, c.target[2] - Math.cos(a) * Math.sin(e) * s];
  }
  if (k > 0) {
    const { paper, zoom } = termArea();
    c.zoom *= lerp(1, zoom, k);
    c.target[0] -= ((paper.cx - 0.5) * innerWidth / c.zoom) * k;
    c.target[2] -= ((paper.cy - 0.5) * innerHeight / c.zoom) * k;
  }
  return c;
}

// ---------- look=pro 紧凑时间线的镜头（透视） ----------
// 两个机位：俯视（图纸装满画面，上北下南）、鸟瞰（按 mood 的仰角 / 方位，模型装进画面）。
// 鸟瞰的距离按整段绕圈里最费地方的那个角度算，绕到哪都不出画；最后几秒推近 5%。
const ORBIT_BUILD = 10, ORBIT_END = 16; // 搭建过程中慢慢转 10°，完成后再转 16°
let PC = null;
function proPoses(cam) {
  if (PC) return PC;
  const plan = window.__plan, aspect = innerWidth / innerHeight;
  const bounds = [Math.min(...plan.rooms.map((r) => r.rect[0])), Math.min(...plan.rooms.map((r) => r.rect[1])), Math.max(...plan.rooms.map((r) => r.rect[2])), Math.max(...plan.rooms.map((r) => r.rect[3]))];
  const sh = sheetBounds(sourceFor(plan));
  const sheetBox = new THREE.Box3(new THREE.Vector3(sh.x0, 0, sh.z0), new THREE.Vector3(sh.x1, 0, sh.z1));
  const tTop = [(sh.x0 + sh.x1) / 2, 0, (sh.z0 + sh.z1) / 2];
  const RTop = fitDistance(sheetBox, tTop, dirOf(89.5, 0), cam.fov, aspect, 0.03);
  const pts = fitPoints(plan, bounds), tIso = fitView(pts, boxTarget(modelBox(bounds)), dirOf(CAM_EL, CAM_AZ + (ORBIT_BUILD + ORBIT_END) / 2), cam.fov, aspect, camMargin(aspect)).target;
  let RIso = 0;
  for (let i = 0; i <= 12; i++) RIso = Math.max(RIso, fitDistance(pts, tIso, dirOf(CAM_EL, CAM_AZ + ((ORBIT_BUILD + ORBIT_END) * i) / 12), cam.fov, aspect, camMargin(aspect)));
  return (PC = { tTop, RTop, tIso, RIso });
}
function proCamAt(t, cam) {
  const P = proPoses(cam), u = seg(t, ...TL.tilt);
  const orbit = ORBIT_BUILD * seg(t, TL.tilt[1] - 1, TL.finish[0]) + ORBIT_END * seg(t, TL.finish[0], TL.end);
  const dolly = 1 - 0.05 * seg(t, TL.finish[0], TL.end);
  return {
    el: lerp(89.5, CAM_EL, u), az: lerp(0, CAM_AZ, u) + orbit,
    target: P.tTop.map((v, i) => lerp(v, P.tIso[i], u)),
    R: Math.exp(lerp(Math.log(P.RTop), Math.log(P.RIso), u)) * dolly,
  };
}

// ---------- 成片（seq=final）的镜头 ----------
// 开场：斜上方（仰角 62°）看书桌上的图纸，框住整张纸（横版右边露出铅笔，竖版铅笔在下面），慢慢推近 6%；
// 然后斜下来到 3/4 鸟瞰、框住模型（软装的家要看清），整段按 ORBIT 慢慢绕，距离按绕圈里最费地方的角度算，绕到哪都不出画
const SEQ_ORBIT = [[TL_SEQ.tilt[1] - 1, TL_SEQ.decor[1], 8], [TL_SEQ.decor[1], TL_SEQ.day[0], 4], [TL_SEQ.day[0], TL_SEQ.day[1], 10], [TL_SEQ.night[0], TL_SEQ.night[1], 10]];
const SEQ_OPEN = { el: 62, az: 14 };
const ORB = () => (TOUR ? ORBIT_A : SEQ_ORBIT); // 漫游成片：搭建时只慢慢转 10°，8 秒以后的大绕圈见 tourOrbitAt
let SC = null;
function seqPoses(cam) {
  if (SC) return SC;
  const plan = window.__plan, aspect = innerWidth / innerHeight;
  const bounds = [Math.min(...plan.rooms.map((r) => r.rect[0])), Math.min(...plan.rooms.map((r) => r.rect[1])), Math.max(...plan.rooms.map((r) => r.rect[2])), Math.max(...plan.rooms.map((r) => r.rect[3]))];
  const sh = sheetBounds(sourceFor(plan));
  const sheetBox = new THREE.Box3(new THREE.Vector3(sh.x0, 0, sh.z0), new THREE.Vector3(sh.x1, 0, sh.z1));
  const tOpen = [(sh.x0 + sh.x1) / 2, 0, (sh.z0 + sh.z1) / 2];
  const ROpen = fitDistance(sheetBox, tOpen, dirOf(SEQ_OPEN.el, SEQ_OPEN.az), cam.fov, aspect, aspect < 1 ? 0.06 : 0.04);
  const pts = fitPoints(plan, bounds), total = ORB().reduce((a, o) => a + o[2], 0), m = camMargin(aspect) + 0.03; // 绕圈时多留一点边
  const v = fitView(pts, boxTarget(modelBox(bounds)), dirOf(CAM_EL, CAM_AZ + total / 2), cam.fov, aspect, m);
  let R = 0;
  for (let i = 0; i <= 16; i++) R = Math.max(R, fitDistance(pts, v.target, dirOf(CAM_EL, CAM_AZ + (total * i) / 16), cam.fov, aspect, m));
  return (SC = { tOpen, ROpen, tIso: v.target, RIso: R });
}
function seqCamAt(t, cam) {
  const P = seqPoses(cam), u = seg(t, ...TL.tilt);
  const orbit = ORB().reduce((a, [t0, t1, deg]) => a + deg * clamp01((t - t0) / (t1 - t0)), 0);
  const push = 1 - (TOUR ? 0.1 : 0.06) * seg(t, ...TL.open); // 漫游成片开场只有 1.5 秒，推得多一点，别像停住
  return {
    el: lerp(SEQ_OPEN.el, CAM_EL, u), az: lerp(SEQ_OPEN.az, CAM_AZ, u) + orbit,
    target: P.tOpen.map((v, i) => lerp(v, P.tIso[i], u)),
    R: Math.exp(lerp(Math.log(P.ROpen * push), Math.log(P.RIso), u)),
  };
}
// ---------- 推进客厅 + 人眼高度的镜头（seq=final 的最后一段） ----------
// 关键帧：时间、位置、朝向 yaw（度，0 = 看向南 +z，90 = 看向东 +x）、俯仰 pitch（度，负 = 往下看）、竖直视角 fov。
// 第一帧接上鸟瞰绕圈的最后一刻（位置、朝向和速度都接上）；中间用分段三次 Hermite 插值，切线按时间加权、单调限幅（不过冲、不回弹）。
// 竖版另一套：画面窄，镜头更靠后、视角更大，吊灯和落地灯一上一下
const PUSH_KEYS = {
  h: [
    [29.4, [8.6, 7.6, 3.2], 312, -50, 36],     // 东北角上空：看墙长高
    [30.7, [3.3, 4.7, 5.5], 364, -72, 40],     // 地毯上空俯看客厅，转向南
    [31.8, [1.15, 2.3, 4.55], 398, -24, 45],   // 从敞开的顶上降进屋里（2.8 米以下天花板出现），躲开餐桌吊灯
    [32.6, [0.86, 1.62, 4.16], 406, -10, 48],  // 人眼高度：餐桌那头，看向东南（吊灯在左前，沙发、落地灯、阳台）
    [36.3, [1.3, 1.56, 4.7], 404, -9, 48],
    [40.0, [1.75, 1.5, 5.25], 402, -8.5, 48],  // 慢慢推过餐桌：吊灯从左边滑出去，落地灯、茶几、阳台的蓝调留在画面里
  ],
  v: [
    [29.4, [8.6, 8.4, 3.2], 312, -52, 50],
    [30.7, [3.3, 5.2, 5.5], 364, -74, 54],
    [31.8, [1.1, 2.35, 4.5], 400, -22, 60],
    [32.6, [0.75, 1.6, 4.0], 414, -8, 64],     // 竖版：再往后、往左一点，吊灯（左上）、落地灯、窗户的一角都进画面
    [36.3, [1.15, 1.55, 4.6], 410, -7.5, 64],
    [40.0, [1.65, 1.5, 5.2], 405, -7, 64],
  ],
};
const deg = Math.PI / 180;
const fwd = (yaw, pitch) => [Math.cos(pitch * deg) * Math.sin(yaw * deg), Math.sin(pitch * deg), Math.cos(pitch * deg) * Math.cos(yaw * deg)];
let PK = null;
function pushKeys(cam) {
  if (PK) return PK;
  // 第一帧 = 绕圈在 push[0] 时刻的机位；速度用前后 0.05 秒差分
  const at = (tt) => {
    const c = seqCamAt(tt, cam), d = dirOf(c.el, c.az), p = c.target.map((v, i) => v + d[i] * c.R);
    return { p, yaw: c.az + 180, pitch: -c.el };
  };
  const t0 = TL_SEQ.push[0], a = at(t0 - 0.05), b = at(t0);
  const keys = [{ t: t0, v: [...b.p, b.yaw, b.pitch, cam.fov], m: [...b.p.map((x, i) => (x - a.p[i]) / 0.05), (b.yaw - a.yaw) / 0.05, 0, 0] }];
  let prevYaw = b.yaw;
  for (const [t, p, yaw, pitch, fov] of PUSH_KEYS[vertical ? "v" : "h"]) {
    let y = yaw; while (y - prevYaw > 180) y -= 360; while (y - prevYaw < -180) y += 360; prevYaw = y; // yaw 展开，不绕远路
    keys.push({ t, v: [...p, y, pitch, fov] });
  }
  keys[keys.length - 1].m = keys[keys.length - 1].v.map(() => 0);
  // 最后一段别停死：末端保留一点速度（位置、yaw）
  const n = keys.length, L = keys[n - 1], P = keys[n - 2];
  L.m = L.v.map((x, i) => (i < 4 ? ((x - P.v[i]) / (L.t - P.t)) * 0.35 : 0));
  // 中间关键帧的切线：两侧斜率按时间加权，异号置 0，限幅 3×较小斜率（Fritsch–Carlson），每个通道单独算
  for (let j = 1; j < n - 1; j++) {
    const A = keys[j - 1], K = keys[j], C = keys[j + 1], h0 = K.t - A.t, h1 = C.t - K.t;
    K.m = K.v.map((x, i) => {
      const s0 = (x - A.v[i]) / h0, s1 = (C.v[i] - x) / h1;
      if (s0 * s1 <= 0) return 0;
      const m = (s0 * h1 + s1 * h0) / (h0 + h1);
      return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.min(Math.abs(s0), Math.abs(s1)));
    });
  }
  return (PK = keys);
}
function pushCamAt(t, cam) {
  const K = pushKeys(cam);
  let j = 0;
  while (j < K.length - 2 && t > K[j + 1].t) j++;
  const A = K[j], C = K[j + 1], h = C.t - A.t, u = clamp01((t - A.t) / h);
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const v = A.v.map((x, i) => h00 * x + h10 * h * A.m[i] + h01 * C.v[i] + h11 * h * C.m[i]);
  return { pos: v.slice(0, 3), f: fwd(v[3], v[4]), fov: v[5] };
}
// ---------- 漫游成片（seq=final）的镜头 ----------
// 0–6 秒同上（书桌 → 鸟瞰，慢慢转 8°）；6–12.2 秒大绕圈：从东南转到西边（方位 −80°），距离拉近、看向的点挪到客厅，相机停在入户门里面的上空，
// 同时一天过去（光照见 stateAt）；每个量用三次 Hermite：起点接上前一段的速度，终点保留一半的平均速度（不停住，交给关键帧）。
// 12.2 秒起是关键帧（tour.js 的 DESCENT）：第一帧 = 绕圈在 12.2 秒的机位和速度，像升降臂一样从敞开的顶上直着降进入户门里，
// T_LAND 落到眼高、接上第一人称（tour.js 的 buildWalk：位置、朝向、俯仰都是预先算好、平滑过的表）
// 终点：相机在入户门里面的上空（约 4.3 米高），往东南俯看餐厅和客厅——视线不会扫到西墙外面那一大片墙
const BIRD_B = { h: { az: -80, el: 48, R: 4.7, tgt: [3.7, 0.8, 4.35] }, v: { az: -80, el: 50, R: 5.4, tgt: [4.02, 0.8, 4.3] } };
// 各量开始动的时间：方位 6 秒就开始转；仰角 8.6 秒、距离和看向的点 9 秒才开始（先绕着看整套房子、天慢慢黑，再往入户门那边推）
const B_START = { az: B0, el: 8.6, R: 9.0, tgt: 9.0 };
// 方位角：梯形速度——0.8 秒从 v0 加速到匀速，最后 1 秒减到平均速度的 0.3（交给关键帧时还在转），总量正好是 D（不像 Hermite 那样头两秒几乎不动）
function trap(x, h, v0, D) {
  const ta = 0.8, td = 1.0, v1 = 0.3 * (D / h);
  const vm = (D - (v0 * ta) / 2 - (v1 * td) / 2) / (h - ta / 2 - td / 2);
  if (x <= ta) return v0 * x + ((vm - v0) * x * x) / (2 * ta);
  const A = v0 * ta + ((vm - v0) * ta) / 2;
  if (x <= h - td) return A + vm * (x - ta);
  const y = x - (h - td), B = A + vm * (h - td - ta);
  return B + vm * y + ((v1 - vm) * y * y) / (2 * td);
}
const herm = (p0, p1, m0, m1, h, u) => { const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * m1; };
function tourOrbitAt(t, cam) {
  if (t <= B0) return seqCamAt(t, cam);
  const A = seqCamAt(B0, cam), A0 = seqCamAt(B0 - 0.05, cam), E = BIRD_B[vertical ? "v" : "h"];
  // 每个量：起点接上前一段的速度（只有方位角在 6 秒时还在转），终点保留一半的平均速度
  const go = (k, a, a0, e) => {
    const t0 = B_START[k], h = C0 - t0, m0 = t0 === B0 ? (a - a0) / 0.05 : 0;
    if (t <= t0) return a + m0 * (t - B0);
    if (k === "az") return a + trap(t - t0, h, m0, e - a);
    return herm(a + m0 * (t0 - B0), e, m0, ((e - a) / h) * 0.5, h, (t - t0) / h);
  };
  return {
    az: go("az", A.az, A0.az, E.az), el: go("el", A.el, A0.el, E.el),
    R: Math.exp(go("R", Math.log(A.R), Math.log(A0.R), Math.log(E.R))),
    target: A.target.map((v, i) => go("tgt", v, A0.target[i], E.tgt[i])),
  };
}
let TT = null;
function tourTrack(cam) {
  if (TT) return TT;
  const at = (tt) => { const c = tourOrbitAt(tt, cam), d = dirOf(c.el, c.az); return { p: c.target.map((v, i) => v + d[i] * c.R), yaw: c.az + 180, pitch: -c.el }; };
  const a = at(C0 - 0.05), b = at(C0);
  const first = [{ t: C0, v: [...b.p, b.yaw, b.pitch, cam.fov], m: [...b.p.map((x, i) => (x - a.p[i]) / 0.05), (b.yaw - a.yaw) / 0.05, (b.pitch - a.pitch) / 0.05, 0] }];
  const descent = makeTrack(descentKeys(vertical, first).keys), walk = buildWalk(vertical);
  return (TT = (tt) => {
    if (tt < T_LAND) { const v = descent(tt); return { pos: v.slice(0, 3), f: fwd(v[3], v[4]), fov: v[5], yaw: v[3], pitch: v[4] }; }
    const w = walk.at(tt); // 第一人称：眼高不变（不晃）、不侧倾（lookAt 的上方向是世界 y）
    return { pos: [w.x, EYE_H, w.z], f: fwd(w.yaw, w.pitch), fov: w.fov, yaw: w.yaw, pitch: w.pitch };
  });
}
if (TOUR) window.__tourCam = (tt) => (window.__three ? tourTrack(window.__three.camera)(tt) : null); // 调试：任一时刻的机位

let slotNoted = false;

// ---------- 状态 ----------
function stateAt(t) {
  const s = { stage: 1, grow: 0, reveal: 0, pop: 0, finish: 0 };
  if (TL.term && t >= TL.term[0]) s.stage = 2;
  s.reveal = TL.reveal ? seg(t, ...TL.reveal) : 0;
  if (t >= TL.walls[0]) { s.stage = 3; s.grow = seg(t, ...TL.walls); }
  if (t >= TL.openings[0]) { s.stage = 4; s.pop = seg(t, ...TL.openings); }
  if (t >= TL.furniture[0]) { s.stage = 5; s.pop = seg(t, ...TL.furniture); }
  if (t >= TL.finish[0] && !SEQ) { s.stage = 6; s.finish = seg(t, ...TL.finish); }
  if (TL.decor) s.decor = clamp01((t - TL.decor[0]) / (TL.decor[1] - TL.decor[0])); // 匀速推进，一件接一件
  if (TOUR) {
    s.finish = 1;
    s.floor = seg(t, ...TL.floor);
    if (t >= TL.hold[0]) s.stage = 6;
    s.tod = clamp01((t - TL.day[0]) / (TL.day[1] - TL.day[0]));
    s.desk = 1 - seg(t, ...TOUR_IN.desk);
    s.bake = seg(t, ...TOUR_IN.bake);
    s.rise = seg(t, ...TOUR_IN.rise);
    s.inside = seg(t, ...TOUR_IN.inside);
    s.sky = seg(t, ...TOUR_IN.sky);
    s.slideB = seg(t, ...TOUR_IN.slideB); // 入户门一直关着、门外的走廊不出现（第 6 轮起从屋顶降进来，不从门外走进来）
    s.slideK = seg(t, ...TOUR_IN.slideK); // 第 7 轮：落地后走两步，厨房推拉门滑开
    s.tourT = t;
  } else if (SEQ) {
    s.finish = 1;
    s.floor = seg(t, ...TL.floor);
    if (t >= TL.hold[0]) s.stage = 6;
    s.tod = seg(t, ...TL.day); // 0 白天 → 1 蓝调（光照见 look.js 的 seqState）
    s.desk = 1 - seg(t, ...TL_IN.desk);
    s.bake = seg(t, ...TL_IN.bake);
    s.rise = seg(t, ...TL_IN.rise);
    s.inside = seg(t, ...TL_IN.inside);
    s.sky = seg(t, ...TL_IN.sky);
    if (t >= TL.push[0] && !slotNoted) { slotNoted = true; console.log(`[seq] 推进客厅 ${TL.push[0]}–${TL.push[1]} 秒，人眼高度 ${TL.dolly[0]}–${TL.dolly[1]} 秒`); }
  } else if (TL.day) s.tod = lerp(0.1, 1, seg(t, ...TL.day)); // 搭建时是上午（tod 0.1），之后一天过去
  return s;
}

let t = 0, BASE_FOV = null;
const apply = () => {
  useScene.getState().set({ ...stateAt(t), ...(TL.term ? { termT: t - TL.term[0], termOn: seg(t, TL.term[0], TL.term[0] + 0.6) * (1 - seg(t, TL.term[1] - 0.6, TL.term[1])) } : { termOn: 0 }) });
  const g = window.__three;
  if (g && TOUR) {
    BASE_FOV ??= g.camera.fov;
    let pos, look, fov = BASE_FOV;
    if (t < C0) {
      const c = tourOrbitAt(t, g.camera), d = dirOf(c.el, c.az);
      pos = c.target.map((v, i) => v + d[i] * c.R); look = c.target;
    } else {
      const c = tourTrack(g.camera)(t);
      pos = c.pos; look = pos.map((v, i) => v + c.f[i] * 3); fov = c.fov;
    }
    g.camera.position.set(...pos);
    if (g.camera.fov !== fov) { g.camera.fov = fov; g.camera.updateProjectionMatrix(); }
    g.camera.lookAt(...look);
    g.controls.target.set(...look);
    const ceil = pos[1] < FULL_CUT - 0.01 && useScene.getState().rise >= 1;
    if (useScene.getState().ceil !== ceil) useScene.getState().set({ ceil });
  } else if (g && SEQ && t >= TL.push[0]) {
    BASE_FOV ??= g.camera.fov;
    const c = pushCamAt(t, g.camera), look = c.pos.map((v, i) => v + c.f[i] * 3);
    g.camera.position.set(...c.pos);
    g.camera.fov = c.fov; g.camera.updateProjectionMatrix();
    g.camera.lookAt(...look);
    g.controls.target.set(...look);
    // 天花板：相机降到墙顶以下才出现（这时天花板的底面正好和视线平齐，不会突然冒出来）
    useScene.getState().set({ ceil: c.pos[1] < FULL_CUT - 0.01 && useScene.getState().rise >= 1 });
  } else if (g && (COMPACT || SEQ)) {
    if (BASE_FOV != null && g.camera.fov !== BASE_FOV) { g.camera.fov = BASE_FOV; g.camera.updateProjectionMatrix(); }
    if (SEQ && useScene.getState().ceil) useScene.getState().set({ ceil: false });
    const c = SEQ ? seqCamAt(t, g.camera) : proCamAt(t, g.camera), d = dirOf(c.el, c.az);
    g.camera.position.set(...c.target.map((v, i) => v + d[i] * c.R));
    g.camera.lookAt(...c.target);
    g.controls.target.set(...c.target);
  } else if (g) {
    const c = camAt(t), el = (c.el * Math.PI) / 180, az = (c.az * Math.PI) / 180;
    // 透视相机（look=pro 带 cast）：正交的缩放（每米多少像素）换成同样取景需要的距离
    const R = PRO ? innerHeight / (2 * c.zoom * Math.tan((g.camera.fov * Math.PI) / 360)) : 40;
    g.camera.position.set(c.target[0] + Math.sin(az) * Math.cos(el) * R, c.target[1] + Math.sin(el) * R, c.target[2] + Math.cos(az) * Math.cos(el) * R);
    if (!PRO) g.camera.zoom = c.zoom;
    g.camera.lookAt(...c.target);
    g.controls.target.set(...c.target);
    g.camera.updateProjectionMatrix();
  }
};
window.__director = {
  END: TL.end,
  SLOT: TL.slot || null, // seq=final：留给人眼推进镜头的时间段
  frame(ms) { window.__vt?.step(ms); t += ms / 1000; apply(); return t < TL.end; },
  seek(sec) { t = sec; apply(); }, // 检查画面用：?rec&at=秒
};
const at = new URLSearchParams(location.search).get("at");
if (at != null) setTimeout(() => window.__director.seek(Number(at)), 800);
window.__directorReady = true;
