// 第 7 轮：漫游成片（seq=final）的时间线、落地（从鸟瞰降到客厅中间）、第一人称漫游的路线和机位。
// 纯函数、不依赖 three / 页面，node 里也能 import（tools/tour-path.mjs 用它画路线图、查离墙多近、量速度和转头）。
//
// 时间线（视频秒）：
//   0–1.5     书桌上的图纸（铅笔），斜上方推近
//   1.5–5.6   墙 → 门窗 → 家具
//   5.4–8.0   软装按房间成组落下，房间之间错开、互相叠着（Decor.jsx 的 tourStarts）
//   6–12.2    绕着转（软装还在落）+ 7.4 秒起一天过去 + 9 秒起往入户门那边降（director.js 的 tourOrbitAt）
//   12.2–T_LAND 从入户门上空像升降臂一样降下来，一边往客厅中间挪，落在餐桌西南边、面朝餐桌和厨房推拉门（DESCENT）
//   T_LAND–   第一人称（ROUTE）：走两步到厨房门口，推拉门滑开 → 厨房（沿台面往左摇 → 冰箱 → 一直转到门口，走出来）→
//             绕过餐桌（电视、阳台外的外滩、沙发，一路往左转）→ 卫生间（洗手台和镜子 → 淋浴 → 马桶 → 一直往右转到门口，走出来）→
//             次卧（书桌和窗 → 床 → 南墙的画 → 门口）→ 主卧（床 → 窗和阅读角 → 门口）→ 从沙发和茶几之间穿过客厅 →
//             阳台推拉门滑开 → 走上阳台，摇到外滩和江，最后慢慢飘一下
// 第一人称的规矩：眼高 1.6 米、不晃（没有步伐起伏、不侧倾），俯仰基本不变（−6°；卫生间扫过马桶时低一点头），
//   走路 ≤ 1.05 米 / 秒、过门 0.55 米 / 秒，加减速平滑；转头 ≤ 35°/秒（厨房、卫生间扫的那一下 37°/秒），每个房间只扫一遍：进门 →
//   一个方向匀速摇过看点 → 一直转到正对门口 → 走出去（不来回摇、不倒退）。怎么算的见下面的 plan()
// 第 8 轮（主次分明）：两个卧室扫得慢（≈ 28°/秒，床、窗边各放慢停一会儿，各 ≈ 10.5–11 秒），厨房、卫生间扫得紧凑（≈ 7.5 / 6 秒）
export const EYE_H = 1.6;
export const T_LAND = 14.2;                // 落地：降到眼高、接上第一人称
export const T_MERGE = T_LAND;             // 旧名字（inside.jsx 用它判断"进屋了没有"）
export const ORBIT_A = [[3.4, 6.0, 8]];    // 搭建时慢慢转 8°
export const B0 = 6.0, C0 = 12.2;          // 6 秒起大绕圈（软装还在落，和它叠着）+ 下降；12.2 秒起换成关键帧（降进屋里）

// 漫游 / 人眼视角专用的门的调整（不改户型数据 public/plans/*.json——那是 AI 读图的原始结果）：
// 按户型名 → 门的名字给覆盖项，doors.jsx 读。
//   卫生间门：合页放西边（墙的 a 端），开 120° 斜着收进洗手台和门之间的角落——往右扫完马桶一直转到门口时，东边是空的墙面，
//            不会有一扇近在眼前的门扇扫过画面（门扇不参与烘焙，改了不用重烘）
//   厨房推拉门：西边那扇推到东边那扇后面（slide: "a" = 让出墙 a 端那一半）——东半边门口正对着餐椅，走不进去；西半边对着客厅里的空地
export const DOOR_OVERRIDES = {
  opus55: { 卫生间门: { hinge: "a", angle: 120 }, 厨房推拉门: { slide: "a" } },
};
// 漫游成片专用的补充软装（接在软装清单最后面，不打乱烘焙按序号对应的那些；low = 墙长高之前、剖切高度那套位置）：
// 每个房间扫到门口时都会经过一段空墙，各挂一点东西，别让一整面白墙占满画面：
//   次卧南墙（门和床之间）：两幅小画（第 7 轮缩小、往床那边挪，第 6 轮那两幅大的扫过时占半个画面）
//   卫生间东墙（马桶和门之间）：一幅小画
//   主卧西墙（门和阅读角之间）：两幅画
//   厨房西墙（台面和冰箱之间）：两幅小画（白墙 + 白冰箱，往左扫过去时一大片白）
export const DECOR_EXTRA = {
  opus55: (low) => [
    { kind: "art", room: "次卧", x: 7.15, z: 3.52, y: low ? 1.02 : 1.5, rot: Math.PI, phase: 5,
      frames: [{ dx: -0.3, w: 0.5, h: low ? 0.5 : 0.66, print: 0 }, { dx: 0.3, w: 0.5, h: low ? 0.5 : 0.66, print: 2 }] },
    { kind: "art", room: "卫生间", x: 4.93, z: 2.96, y: low ? 1.0 : 1.45, rot: -Math.PI / 2, phase: 5,
      frames: [{ dx: 0, w: 0.5, h: low ? 0.5 : 0.66, print: 3 }] },
    { kind: "art", room: "主卧", x: 6.07, z: 6.2, y: low ? 1.02 : 1.5, rot: Math.PI / 2, phase: 5,
      frames: [{ dx: -0.36, w: 0.6, h: low ? 0.6 : 0.8, print: 1 }, { dx: 0.36, w: 0.6, h: low ? 0.6 : 0.8, print: 3 }] },
    { kind: "art", room: "厨房", x: 0.13, z: 1.52, y: low ? 1.0 : 1.5, rot: Math.PI / 2, phase: 5,
      frames: [{ dx: -0.3, w: 0.46, h: low ? 0.46 : 0.6, print: 2 }, { dx: 0.3, w: 0.46, h: low ? 0.46 : 0.6, print: 0 }] },
  ],
};
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (u) => u * u * (3 - 2 * u);

// ---------- 第一人称的路线 ----------
// p：[x, z]（米；x 东、z 南）；v：经过这一点时的目标速度（米 / 秒；两点之间按路程线性插值，实际速度还受加速度、转头限制，见 plan()）
// hold：在这一点至少停多少秒（v 必须是 0）；停下的点把路线切成几段，前后可以换方向
// yaw：朝向锚点（度；0 = 看向南 +z，90 = 东，180 = 北，270 = 西）。**按字面值、不取近路**：从 212 到 25 就是往右转 187°，
//      从 182 到 364 就是往左转 182°。锚点之间按**时间**线性插值（所以中间不给 yaw 的节点、停下的那段都按同一个角速度匀速转），
//      最后整条曲线做一次高斯平滑（转头的起停都是缓的）。hold 的点可以给数组：停的这段时间里按角度匀速摇过这些朝向
//      给 "path" = 这一点路线的走向（可以加 lead 度），过道里拐弯用
// yv：竖版的朝向锚点（水平视角只有 54°，同一处要多转一点、少转一点的地方单独给；不给 = 同横版）。时间和横版共用
// yawOut / yvOut：（停下的点用）离开这一点时的朝向锚点——房间里扫到这儿就该起步往外走了（比出门的方向差 20–40°，边走边转完，
//      不在原地转到正对门口才走，也不会一边横着挪一边转）
// sweep：从这一点起到下一个朝向锚点（下一个点的 yaw 或停留点的 yawOut）按这个角速度（°/秒）匀速扫过去——中间停多久自动算
// linger：（sweep 的点用）[{ yaw, w, t }]——扫到 yaw ± w/2 这一段时放慢，多花 t 秒（看点多停一会儿；还是同一个方向一直转、不回头）。
//      多出来的时间算进停留时长；扫的其余部分仍按 sweep 的角速度
// pre / post：（停下的点用）朝向锚点提前 pre 秒（快停稳时就开始扫）、yawOut 推后 post 秒（起步后再扫完最后一点）——
//      扫的总时长不变，停的时间少 pre + post 秒（第 8 轮：厨房、卫生间扫得紧凑一点）
// pitch：俯仰锚点（度，负 = 往下看；按时间插值，不给 = 前后锚点之间插值，首尾默认 PITCH0）
// dip：{ yaw, depth, width }——从这一点到下一个朝向锚点之间，朝向扫到 yaw 附近（± width）时低一下头（depth，余弦形），卫生间看马桶用
// slide：这一点是推拉门的门口（"K" 厨房 / "B" 阳台），沿路线离它还有 open 米时开始滑开（dur 秒推开）
// beat：这一拍在干什么（分镜表 tools/round7-storyboard.py 用）
const PITCH0 = -6;
export const ROUTE = [
  // 落地：客厅中间（餐桌西南边），面朝餐桌和吊灯、左前方是厨房的玻璃推拉门；走两步到门口，门滑开
  { p: [1.3, 5.6], v: 0.1, yaw: 145, yv: 147, pitch: -6, beat: "落地：客厅中间，面朝餐桌和厨房推拉门" },   // 落地停稳（降下来时在往东南挪，起步往北走）
  { p: [1.27, 5.22], v: 0.9 },
  { p: [1.2, 4.62], v: 0.95 },
  { p: [1.145, 3.6], v: 0.55, yaw: 163, yv: 168, slide: "K", open: 1.5, dur: 1.0, beat: "推拉门滑开，走进厨房" },  // 稍微往右看：门里左手边就是冰箱，别让它的侧面贴着画面左边
  // 厨房：看着灶台和油烟机走进去，走到东边（离冰箱 1.2 米、冰箱不会占满画面）快停稳时就往左匀速扫（灶台、窗、水槽 → 冰箱 → 门口），
  // 起步时已经看着门口，边走边接着往左转。第 8 轮：扫得快一点（37°/秒）、扫的头尾和走路叠一点（pre / post），≈ 7.5 秒
  { p: [1.42, 3.06], v: 0.8 },
  { p: [1.9, 2.56], v: 0, hold: 0.3, yaw: 163, yv: 168, yawOut: 320, yvOut: 318, pitch: -8, sweep: 37, pre: 0.7, post: 0.7, beat: "厨房：沿台面往左摇 → 冰箱 → 转到门口" },
  { p: [1.56, 2.98], v: 0.8 },
  { p: [1.24, 3.26], v: 0.66 },
  { p: [1.15, 3.6], v: 0.55, yaw: 366, yv: 364, pitch: -6, beat: "出厨房，绕过餐桌：电视、外滩、沙发" },  // 出门时朝南偏东一点（入户门正对着厨房门，往外走时在画面右半边过去）
  // 绕过餐桌：一路往左转——先朝南（电视在右、阳台玻璃外的外滩在前），再朝东（茶几、沙发、沙发上的画），再朝北走向卫生间
  { p: [1.17, 4.25], v: 0.8 },
  { p: [1.32, 5.1], v: 1.0, yaw: "path", lead: 24 },
  { p: [1.86, 5.8], v: 1.06 },
  { p: [2.6, 5.86], v: 1.06, yaw: "path", lead: 24 },
  { p: [3.14, 5.58], v: 0.96 },
  { p: [3.38, 4.98], v: 0.82, yaw: "path", lead: 12 },
  { p: [3.62, 4.38], v: 0.7 },
  { p: [3.84, 3.95], v: 0.6 },
  { p: [3.9, 3.6], v: 0.55, yaw: 550, yv: 552, pitch: -8, beat: "进卫生间" },
  { p: [3.87, 3.42], v: 0.45 },                                                            // 先直着进门（离门框 ≥ 0.28 米；门扇在左边，斜着收在角落里）
  // 卫生间：走进去看着洗手台和镜子，快停稳时就往右匀速扫（淋浴 → 马桶，低一下头 → 东墙的小画），快对着门口时起步走出来。第 8 轮：37°/秒、头尾和走路叠一点，≈ 6 秒
  { p: [3.72, 3.2], v: 0, hold: 0.3, yaw: 563, yv: 565, yawOut: 410, yvOut: 408, pitch: -9, sweep: 37, pre: 0.4, post: 0.4, dip: { yaw: 499, depth: -10, width: 85 }, beat: "卫生间：镜子 → 淋浴 → 马桶 → 转到门口" },
  { p: [3.87, 3.42], v: 0.45 },
  { p: [3.9, 3.6], v: 0.55, yaw: 400, yv: 398, pitch: -6, beat: "出卫生间，走向次卧" },   // 不再往右转正：出门就要往左拐
  // 往东绕过大绿植（夹在绿植和沙发背之间），走向次卧门，一路往左转
  { p: [4.06, 4.2], v: 0.7, yaw: "path", lead: 12 },
  { p: [4.56, 4.68], v: 0.8, yaw: "path", lead: 12 },
  { p: [5.18, 4.6], v: 0.72, yaw: "path", lead: 10 },
  { p: [5.5, 4.07], v: 0.6, yaw: 530, yv: 532 },                                          // 对着次卧门走过去（别斜眼看主卧门那面墙）
  { p: [5.55, 3.6], v: 0.55, yaw: 524, yv: 526, beat: "进次卧" },                        // 次卧门
  // 次卧：边走进去边往右匀速扫（书桌和窗 → 床 → 床头的画 → 南墙的画），扫到快对着门口时起步走出来。
  // 第 8 轮：扫得慢（28°/秒），书桌、窗和床同框那一刻、正对床那一刻各放慢多停一会儿，≈ 10.5 秒
  { p: [5.68, 3.14], v: 0.62, yaw: 518, yv: 522, pitch: -7, sweep: 28, linger: [{ yaw: 498, w: 20, t: 0.7 }, { yaw: 462, w: 20, t: 0.8 }], beat: "次卧：书桌和窗 → 床 → 南墙的画 → 转到门口" },
  { p: [5.86, 2.62], v: 0, hold: 0.3, yawOut: 355, yvOut: 353 },                         // 起步时已经看着门口
  { p: [5.62, 3.1], v: 0.7 },
  { p: [5.56, 3.6], v: 0.55, yaw: 354, yv: 352, pitch: -6, beat: "出次卧，走向主卧" },
  { p: [5.52, 4.06], v: 0.55 },
  { p: [5.74, 4.42], v: 0.55 },
  { p: [6.0, 4.5], v: 0.55, yaw: 440, yv: 444, beat: "进主卧" },                          // 主卧门（正对着走进去）
  // 主卧：看着床走进去，边走边往右匀速扫（床 → 窗和阅读角 → 西墙的画），扫到门口起步走出来。
  // 第 8 轮：扫得慢（28°/秒），床、窗和阅读角各放慢多停一会儿，≈ 11 秒
  { p: [6.46, 4.68], v: 0.7, yaw: 444, yv: 446, pitch: -7, sweep: 28, linger: [{ yaw: 427, w: 20, t: 0.7 }, { yaw: 378, w: 24, t: 0.9 }], beat: "主卧：床 → 窗和阅读角 → 转到门口" },
  { p: [6.92, 4.92], v: 0, hold: 0.3, yawOut: 260, yvOut: 258 },                         // 起步时已经看着门口
  { p: [6.46, 4.6], v: 0.68 },
  { p: [6.0, 4.5], v: 0.55, yaw: 270, yv: 270, pitch: -6, beat: "出主卧，穿过客厅" },
  // 穿过客厅：往西出门，往左转向南，从沙发和茶几之间往南，阳台推拉门滑开
  { p: [5.45, 4.6], v: 0.7 },
  { p: [4.76, 4.74], v: 0.85 },
  { p: [4.46, 5.26], v: 0.95, yaw: 350 },
  { p: [4.43, 6.1], v: 1.06 },
  { p: [4.3, 7.04], v: 1.0 },
  { p: [3.76, 7.8], v: 0.72 },
  { p: [3.45, 8.4], v: 0.5, yaw: 344, slide: "B", open: 2.3, dur: 1.2, beat: "阳台推拉门滑开，走上阳台" },
  // 阳台：右下的灯笼、绿植、小桌椅 → 往左摇、抬头：外滩和江 → 最后慢慢往前飘一下
  { p: [3.4, 8.78], v: 0.3, yaw: 336, yv: 322, pitch: -10 },
  { p: [3.38, 8.95], v: 0, hold: 1.4, yaw: [338, 363], yv: [324, 364], pitch: [-10, 2.5], beat: "摇向外滩和江、抬头" },
  { p: [3.37, 8.99], v: 0.05, yaw: 364, pitch: 3 },
];

// ---------- 路线几何：按停下的点切段，每段过节点做向心 Catmull-Rom，按弧长 1 厘米重采样，再轻微平滑（曲率连续） ----------
const DS = 0.01;
function catmull(P, n = 60) {
  const pts = [], a = 0.5;
  const ext = [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]], ...P, [2 * P[P.length - 1][0] - P[P.length - 2][0], 2 * P[P.length - 1][1] - P[P.length - 2][1]]];
  const d = (p, q) => Math.max(1e-4, Math.hypot(q[0] - p[0], q[1] - p[1]) ** a);
  const nodeIdx = [0];
  for (let i = 1; i < ext.length - 2; i++) {
    const [p0, p1, p2, p3] = [ext[i - 1], ext[i], ext[i + 1], ext[i + 2]];
    const t0 = 0, t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = t1 + ((t2 - t1) * k) / n;
      const L = (pa, pb, ta, tb) => [((tb - t) * pa[0] + (t - ta) * pb[0]) / (tb - ta), ((tb - t) * pa[1] + (t - ta) * pb[1]) / (tb - ta)];
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      pts.push(L(B1, B2, t1, t2));
    }
    nodeIdx.push(pts.length - 1);
  }
  return { pts, nodeIdx };
}
function geometry(route) {
  // 切段：停下的点（不是首尾）同时是前一段的终点和后一段的起点
  const legs = [];
  let cur = [0];
  for (let i = 1; i < route.length; i++) {
    cur.push(i);
    if (route[i].hold != null && i < route.length - 1) { legs.push(cur); cur = [i]; }
  }
  if (cur.length > 1) legs.push(cur);
  const nodeS = new Array(route.length).fill(0), legData = [];
  let S = 0;
  for (const idx of legs) {
    const { pts, nodeIdx } = catmull(idx.map((i) => route[i].p));
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const L = cum[cum.length - 1];
    // 按弧长等距重采样
    const N = Math.max(2, Math.round(L / DS) + 1), res = [];
    for (let j = 0, k = 0; j < N; j++) {
      const s = (L * j) / (N - 1);
      while (k < cum.length - 2 && cum[k + 1] < s) k++;
      const u = (s - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
      res.push([pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u]);
    }
    // 轻微平滑：三遍 ±6 厘米的滑动平均（首尾固定、靠近首尾时窗口变窄）
    let sm = res;
    for (let pass = 0; pass < 3; pass++) {
      sm = sm.map((q, j) => {
        const r = Math.min(6, j, sm.length - 1 - j);
        if (r === 0) return q;
        let x = 0, z = 0;
        for (let m = -r; m <= r; m++) { x += sm[j + m][0]; z += sm[j + m][1]; }
        return [x / (2 * r + 1), z / (2 * r + 1)];
      });
    }
    idx.forEach((i, m) => { nodeS[i] = S + cum[nodeIdx[m]]; });
    legData.push({ s0: S, L, pts: sm, step: L / (N - 1) });
    S += L;
  }
  const legAt = (s) => legData.find((g) => s <= g.s0 + g.L + 1e-9) || legData[legData.length - 1];
  const posIn = (g, s) => {
    const f = clamp01((s - g.s0) / g.L) * (g.pts.length - 1), k = Math.min(g.pts.length - 2, Math.floor(f)), u = f - k;
    return [g.pts[k][0] + (g.pts[k + 1][0] - g.pts[k][0]) * u, g.pts[k][1] + (g.pts[k + 1][1] - g.pts[k][1]) * u];
  };
  return { legs: legData, nodeS, total: S, legAt, posIn, pos: (s) => posIn(legAt(s), s) };
}


// ---------- 时间：速度上限 → 加速度受限的速度曲线 → 停留时长 → 朝向 / 俯仰按时间插值，转头太快的地方回头把那几段走慢 ----------
// 1. 沿路线每 1 厘米一个点：速度上限 = 节点速度按路程线性插值 × 这一段的减速系数 mult（初始 1），停下来的点 = 0；
//    拐弯处再按横向加速度 A_LAT 限速；正反两遍按最大加速度 ACC 限速（梯形速度），积分成"只走路"的时间
// 2. 停留时长：hold 给的最小值；hold 点给了朝向数组 → 至少 总角度 ÷ YAW_CAP；sweep 点 → 到下一个朝向锚点按 sweep 的角速度匀速扫完
// 3. 朝向锚点按时间排开（锚点之间线性插值 = 匀速转），每两个锚点之间的角速度如果超过 YAW_CAP（俯仰超过 PITCH_CAP），
//    把这两个锚点之间的走路段 mult 调小、重来（最多 40 遍）——拐弯、转头的地方自动走慢
// 4. 最后"时间 → 路程"做高斯平滑（SIG_S，加减速变成 S 形），朝向、俯仰各做一次高斯平滑（SIG_YAW / SIG_PITCH：转头的起停是缓的，角加速度有上限）
const YAW_CAP = 35, PITCH_CAP = 7, ACC = 0.75, A_LAT = 1.1, SIG_S = 0.28, SIG_YAW = 0.42, SIG_PITCH = 0.5;
const listOf = (y) => (y == null ? null : Array.isArray(y) ? y : [y]);
const sweepOf = (arr) => arr.slice(1).reduce((a, y, k) => a + Math.abs(y - arr[k]), 0);
// 一维高斯平滑（两头按端点的斜率线性外推，起步、收尾的速度不被抹掉）
function gauss(arr, sigma, hz) {
  const r = Math.ceil(3 * sigma * hz), w = [];
  for (let k = -r; k <= r; k++) w.push(Math.exp(-0.5 * (k / (sigma * hz)) ** 2));
  const W = w.reduce((a, b) => a + b, 0), n = arr.length, d0 = arr[1] - arr[0], d1 = arr[n - 1] - arr[n - 2];
  const at = (j) => (j < 0 ? arr[0] + d0 * j : j >= n ? arr[n - 1] + d1 * (j - n + 1) : arr[j]);
  return arr.map((_, j) => { let a = 0; for (let k = -r; k <= r; k++) a += w[k + r] * at(j + k); return a / W; });
}
// 速度曲线（只走路，不含停留）
function speedProfile(route, G, mult) {
  const n = route.length, K = Math.max(2, Math.round(G.total / DS)), ds = G.total / K;
  const kOf = (i) => Math.round(G.nodeS[i] / ds), vlim = new Float64Array(K + 1).fill(Infinity);
  for (let i = 0; i < n - 1; i++) {
    const k0 = kOf(i), k1 = kOf(i + 1);
    // 有一头是停下来的点（v = 0）时整段按另一头的速度（停下来交给加速度限制）
    const va = (route[i].v || route[i + 1].v) * mult[i], vb = (route[i + 1].v || route[i].v) * mult[i];
    for (let k = k0; k <= k1; k++) { const u = (k - k0) / Math.max(1, k1 - k0); vlim[k] = Math.min(vlim[k], va + (vb - va) * u); }
  }
  // 拐弯限速：横向加速度 v²·κ ≤ A_LAT（κ 按同一段路线上前后 12 厘米的转角算）——绕餐桌那种急弯别甩着过去
  for (let k = 0; k <= K; k++) {
    const s = k * ds, g = G.legAt(s), a = Math.max(g.s0, s - 0.12), b = Math.min(g.s0 + g.L, s + 0.12);
    if (b - a < 0.2) continue;
    const p0 = G.posIn(g, a), p1 = G.posIn(g, s), p2 = G.posIn(g, b);
    const h1 = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]), h2 = Math.atan2(p2[0] - p1[0], p2[1] - p1[1]);
    const kap = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))) / ((b - a) / 2);
    if (kap > 1e-3) vlim[k] = Math.min(vlim[k], Math.sqrt(A_LAT / kap));
  }
  route.forEach((nd, i) => { if (nd.hold != null) vlim[kOf(i)] = 0; });
  const v = new Float64Array(K + 1);
  v[0] = Math.min(vlim[0], route[0].v);
  for (let k = 1; k <= K; k++) v[k] = Math.min(vlim[k], Math.sqrt(v[k - 1] ** 2 + 2 * ACC * ds));
  v[K] = Math.min(v[K], route[n - 1].v);
  for (let k = K - 1; k >= 0; k--) v[k] = Math.min(v[k], Math.sqrt(v[k + 1] ** 2 + 2 * ACC * ds));
  const tw = new Float64Array(K + 1);
  for (let k = 1; k <= K; k++) tw[k] = tw[k - 1] + (2 * ds) / Math.max(1e-4, v[k - 1] + v[k]);
  return { v, tw, K, ds, kOf };
}
// 锚点（按时间）：单个值 → 到达这一点的时刻；数组（hold 点）→ 停的这段时间里按角度排开
// pre / post（只给朝向用）：单个值的锚点提前 pre[i] 秒，yawOut 推后 post[i] 秒
function anchorsOf(vals, tin, tout, outs = [], pre = [], post = []) {
  const A = [];
  vals.forEach((arr, i) => {
    if (outs[i] != null) A.push({ t: tout[i] + (post[i] || 0), y: outs[i], i, out: true });   // yawOut：离开停留点的时刻
    if (!arr) return;
    if (arr.length === 1) { A.splice(A.length - (outs[i] != null ? 1 : 0), 0, { t: tin[i] - (pre[i] || 0), y: arr[0], i }); return; }
    const cum = [0];
    for (let m = 1; m < arr.length; m++) cum.push(cum[m - 1] + Math.abs(arr[m] - arr[m - 1]));
    const tot = cum[cum.length - 1];
    arr.forEach((y, m) => A.push({ t: tin[i] + (tout[i] - tin[i]) * (tot > 1e-6 ? cum[m] / tot : m / (arr.length - 1)), y, i }));
  });
  return A;
}
// linger：sweep 的起点锚点和下一个锚点之间插进放慢的那几段（起止各一个锚点，序号同起点：不影响 plan() 按段调速、dip 找下一个锚点）
const lingerT = (nd) => (nd.linger || []).reduce((a, g) => a + g.t, 0);
function addLingers(A, route) {
  const out = [];
  A.forEach((a, k) => {
    out.push(a);
    const nd = route[a.i], b = A[k + 1];
    if (a.out || !nd.sweep || !nd.linger || !b) return;
    const dir = Math.sign(b.y - a.y), d = Math.abs(b.y - a.y), E = lingerT(nd), r = d / Math.max(1e-6, b.t - a.t - E);
    const gs = nd.linger.map((g) => ({ ...g, u: (g.yaw - a.y) * dir })).filter((g) => g.u - g.w / 2 > 0 && g.u + g.w / 2 < d).sort((p, q) => p.u - q.u);
    let acc = 0;
    for (const g of gs) {
      const u0 = g.u - g.w / 2, u1 = g.u + g.w / 2;
      out.push({ t: a.t + u0 / r + acc, y: a.y + dir * u0, i: a.i, linger: true });
      acc += g.t;
      out.push({ t: a.t + u1 / r + acc, y: a.y + dir * u1, i: a.i, linger: true });
    }
  });
  return out;
}
const interpA = (A, t) => {
  if (t <= A[0].t) return A[0].y;
  let a = 0;
  while (a < A.length - 2 && t > A[a + 1].t) a++;
  const P = A[a], Q = A[a + 1];
  return Q.t - P.t < 1e-9 ? Q.y : P.y + ((Q.y - P.y) * Math.max(0, Math.min(1, (t - P.t) / (Q.t - P.t))));
};
function timing(route, G, mult, Ys, P, Yos) {
  const S = speedProfile(route, G, mult), n = route.length;
  const wAt = route.map((_, i) => S.tw[S.kOf(i)]);           // 只算走路时，到达第 i 点的时刻
  const hold = route.map((nd, i) => {
    if (nd.hold == null) return 0;
    let h = nd.hold;
    for (const Y of Ys) if (Y[i] && Y[i].length > 1) h = Math.max(h, sweepOf(Y[i]) / YAW_CAP);
    if (P[i] && P[i].length > 1) h = Math.max(h, sweepOf(P[i]) / PITCH_CAP);
    return h;
  });
  // sweep：从这一点到下一个朝向锚点（下一个点的 yaw，或停留点的 yawOut）按给定角速度匀速扫完（横竖版取要停得久的那个）；
  // 差的时间加在这中间第一个停下来的点上
  route.forEach((nd, i) => {
    if (!nd.sweep) return;
    Ys.forEach((Y, v) => {
      const Yo = Yos[v];
      let m = i, tgt = null;
      for (; m < n && !tgt; m++) {
        if (m > i && Y[m]) tgt = { m, out: false, y: Y[m][0] };
        else if (Yo[m] != null) tgt = { m, out: true, y: Yo[m] };
      }
      if (!tgt) return;
      const hi = tgt.out ? tgt.m : tgt.m - 1;
      let h = i;
      while (h <= hi && route[h].hold == null) h++;
      if (h > hi) return;
      const d = Math.abs(tgt.y - Y[i][Y[i].length - 1]);
      const shift = (nd.pre || 0) + (tgt.out ? route[tgt.m].post || 0 : 0);
      let other = 0;
      for (let q = i; q <= hi; q++) if (q !== h) other += hold[q];
      hold[h] = Math.max(hold[h], d / nd.sweep + lingerT(nd) - shift - (wAt[tgt.m] - wAt[i]) - other);
    });
  });
  const tin = [], tout = [];
  let acc = 0;
  route.forEach((_, i) => { tin.push(wAt[i] + acc); acc += hold[i]; tout.push(tin[i] + hold[i]); });
  return { S, hold, tin, tout, dur: tout[n - 1] };
}
// yaw: "path" → 这一点路线的走向（+ lead），按前一个锚点展开成最近的那一圈：拐弯时朝向跟着路走，不斜着身子横着挪
function resolvePath(route, G, vert) {
  let prev = null;
  return route.map((nd, i) => {
    const y = vert && nd.yv != null ? nd.yv : nd.yaw;
    if (y !== "path") { const L = listOf(y); if (L) prev = L[L.length - 1]; return L; }
    const s = G.nodeS[i], g = G.legAt(s), a = G.posIn(g, Math.max(g.s0, s - 0.15)), b = G.posIn(g, Math.min(g.s0 + g.L, s + 0.15));
    let h = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + (nd.lead || 0);
    if (prev != null) h = prev + ((((h - prev + 180) % 360) + 360) % 360) - 180;
    prev = h;
    return [h];
  });
}
function plan(route, G) {
  const n = route.length;
  const Ys = [false, true].map((vert) => resolvePath(route, G, vert));
  const Yos = [false, true].map((vert) => route.map((nd) => (vert && nd.yvOut != null ? nd.yvOut : nd.yawOut ?? null)));
  const PRE = route.map((nd) => nd.pre || 0), POST = route.map((nd) => nd.post || 0);
  const yawAnchors = (Y, Yo, T) => addLingers(anchorsOf(Y, T.tin, T.tout, Yo, PRE, POST), route);
  const P = route.map((nd, i) => listOf(nd.pitch ?? (i === 0 || i === n - 1 ? PITCH0 : null)));
  const mult = new Array(n - 1).fill(1);
  let T;
  for (let it = 0; it < 40; it++) {
    T = timing(route, G, mult, Ys, P, Yos);
    // 每段取所有超速区间里要求最狠的那个系数（横版、竖版、俯仰不连乘，免得慢过头），逐遍逼近
    const need = new Array(n - 1).fill(1);
    for (const [vals, cap, outs, yawish] of [[Ys[0], YAW_CAP, Yos[0], 1], [Ys[1], YAW_CAP, Yos[1], 1], [P, PITCH_CAP, [], 0]]) {
      const A = yawish ? yawAnchors(vals, outs, T) : anchorsOf(vals, T.tin, T.tout, outs);
      for (let a = 0; a < A.length - 1; a++) {
        const dy = Math.abs(A[a + 1].y - A[a].y), dt = A[a + 1].t - A[a].t, r = dy / Math.max(1e-6, dt);
        if (dy < 1e-6 || r <= cap * 1.004) continue;
        for (let s = A[a].i; s < A[a + 1].i; s++) need[s] = Math.min(need[s], Math.max(0.6, (cap / r) * 0.99));
      }
    }
    if (need.every((f) => f === 1)) break;
    need.forEach((f, s) => { mult[s] *= f; });
  }
  // 停下来的点（按采样序号）→ 停多久；tk = 到达第 k 个点的时刻（含前面的停留），leave = 离开的时刻
  const { S } = T, holdAt = new Map(route.map((_, i) => [S.kOf(i), i]).filter(([, i]) => T.hold[i] > 0));
  const tk = new Float64Array(S.K + 1), leave = new Float64Array(S.K + 1);
  let add = 0;
  for (let k = 0; k <= S.K; k++) { tk[k] = S.tw[k] + add; if (holdAt.has(k)) add += T.hold[holdAt.get(k)]; leave[k] = S.tw[k] + add; }
  const AY = Ys.map((Y, v) => yawAnchors(Y, Yos[v], T)), AP = anchorsOf(P, T.tin, T.tout);
  // 低头：从这一点到下一个朝向锚点（横版）之间
  const dips = [];
  route.forEach((nd, i) => {
    if (!nd.dip) return;
    const nxt = AY[0].find((a) => a.i > i);
    dips.push({ ...nd.dip, t0: T.tin[i], t1: nxt ? nxt.t : T.dur });
  });
  return { ...T, tk, leave, ds: S.ds, K: S.K, AY, AP, dips, mult };
}

// ---------- 第一人称的机位表：每秒 120 个点，{ t, x, z, yaw, pitch }；at(t) 线性插值 ----------
const HZ = 120;
const WALK_CACHE = {};
export function buildWalk(vertical = false, route = ROUTE) {
  const key = vertical ? "v" : "h";
  if (route === ROUTE && WALK_CACHE[key]) return WALK_CACHE[key];
  const G = geometry(route), T = plan(route, G), N = Math.round(T.dur * HZ) + 1;
  // 原始（没平滑的）时间 → 路程：在 hold 的时间里路程不变
  const sRaw = new Array(N);
  for (let j = 0, k = 0; j < N; j++) {
    const tau = j / HZ;
    while (k < T.K && T.tk[k + 1] <= tau) k++;
    if (k >= T.K) { sRaw[j] = G.total; continue; }
    if (tau <= T.leave[k]) { sRaw[j] = k * T.ds; continue; }
    sRaw[j] = (k + (tau - T.leave[k]) / Math.max(1e-9, T.tk[k + 1] - T.leave[k])) * T.ds;
  }
  const sSm = gauss(sRaw, SIG_S, HZ).map((x) => Math.max(0, Math.min(G.total, x)));
  const AY = T.AY[vertical ? 1 : 0];
  const rawY = [], rawP = [];
  for (let j = 0; j < N; j++) { rawY.push(interpA(AY, j / HZ)); rawP.push(interpA(T.AP, j / HZ)); }
  const yaw = gauss(rawY, SIG_YAW, HZ);
  // 低头（余弦形，跟着平滑后的朝向走）：竖版视角大，低一半就够。时间窗两头各 0.6 秒淡入淡出（窗口开始时朝向可能已经在 ± width 里），
  // 加进俯仰以后再一起做高斯平滑——不会有一帧突然低头
  const env = (x) => smooth(clamp01(x / 0.6));
  for (const d of T.dips) for (let j = Math.max(0, Math.floor(d.t0 * HZ)); j < Math.min(N, Math.ceil(d.t1 * HZ)); j++) {
    const u = Math.min(1, Math.abs(yaw[j] - (vertical && d.yawV != null ? d.yawV : d.yaw)) / d.width);
    rawP[j] += (vertical ? 0.5 : 1) * d.depth * 0.5 * (1 + Math.cos(Math.PI * u)) * env(j / HZ - d.t0) * env(d.t1 - j / HZ);
  }
  const pitch = gauss(rawP, SIG_PITCH, HZ);
  const ts = [], xs = [], zs = [], sp = [];
  for (let j = 0; j < N; j++) { const p = G.pos(sSm[j]); ts.push(T_LAND + j / HZ); xs.push(p[0]); zs.push(p[1]); }
  for (let j = 0; j < N; j++) { const a = Math.max(0, j - 1), b = Math.min(N - 1, j + 1); sp.push(((sSm[b] - sSm[a]) * HZ) / (b - a)); }
  const fov = vertical ? 84 : 60;
  const at = (t) => {
    const f = Math.max(0, Math.min(N - 1, (t - T_LAND) * HZ)), k = Math.min(N - 2, Math.floor(f)), u = f - k;
    const L = (a) => a[k] + (a[k + 1] - a[k]) * u;
    return { x: L(xs), z: L(zs), yaw: L(yaw), pitch: L(pitch), fov, speed: L(sp) };
  };
  // 起步时的速度（给落地那一帧的切线用）：位置、朝向、俯仰的时间导数
  const d = (a) => (a[1] - a[0]) * HZ;
  const out = { at, t0: T_LAND, t1: T_LAND + T.dur, dur: T.dur, fov, tin: T.tin.map((t) => T_LAND + t), tout: T.tout.map((t) => T_LAND + t), nodeS: G.nodeS, geo: G, hold: T.hold,
    table: { t: ts, x: xs, z: zs, yaw, pitch, speed: sp, s: sSm }, v0: [d(xs), 0, d(zs), d(yaw), d(pitch), 0] };
  if (route === ROUTE) WALK_CACHE[key] = out;
  return out;
}

// ---------- 时间线 ----------
// 第一人称的表只在漫游成片里用：第一次要时才算（默认画面不花这几十毫秒）
let W_H = null;
const walkH = () => (W_H ??= buildWalk(false));
// 推拉门：沿路线离门口（route 里 slide 的那一点）还有 open 米时开始滑开，dur 秒推开
const SLIDES = {};
const slideAt = (kind) => (SLIDES[kind] ??= (() => {
  const W = walkH(), i = ROUTE.findIndex((nd) => nd.slide === kind), nd = ROUTE[i], s0 = W.nodeS[i] - nd.open;
  const j = Math.max(0, W.table.s.findIndex((s) => s >= s0));
  return [+W.table.t[j].toFixed(2), +(W.table.t[j] + nd.dur).toFixed(2)];
})());
export const TL_TOUR = {
  term: null, reveal: null,
  open: [0, 1.5],            // 书桌上的图纸：斜上方慢慢推近
  tilt: [0.8, 4.4],          // 推到 3/4 鸟瞰
  floor: [1.3, 2.5],
  walls: [1.5, 3.3],
  openings: [3.1, 4.2],
  furniture: [4.0, 5.6],
  decor: [5.4, 8.0],         // 软装：按房间成组，2.6 秒落完
  finish: [0, 0.01],
  hold: [8.0, 8.0],
  day: [7.4, 12.0],          // 一天过去（匀速，不缓入缓出：中间那段日落别一下子就黑了），和软装收尾、绕圈、下降叠着
  get end() { return +walkH().t1.toFixed(2); },
};
// 进屋那几秒里各件事的时间
export const TOUR_IN = {
  desk: [11.2, 12.6],        // 书桌、底座、图纸、铅笔淡出
  rise: [11.5, 12.8],        // 墙从 1.5 米长到 2.8 米（相机越过西墙时已经长满）
  bake: [12.0, 13.4],        // 光照：实时 → 烘焙
  inside: [12.8, 14.0],      // 后期：移轴 → 人眼
  sky: [13.5, 14.3],         // 窗外的外滩夜景淡入（相机降到墙顶以下、天花板挡住天以后）
  get slideK() { return slideAt("K"); },  // 厨房推拉门滑开（落地后走两步）
  get slideB() { return slideAt("B"); },  // 阳台推拉门滑开
};

// 降进屋里：[t, x, y, z, yaw, pitch, fov]。第一帧接上绕圈在 12.2 秒的机位和速度（director.js：横版 (0.60, 4.29, 4.90)、yaw 100、俯 48°、视角 32°），
// 最后一帧 = 第一人称的起点（落地时几乎停稳：水平、竖直、转头都缓到 0，再起步走向厨房）。像升降臂一样往下降，同时往东南挪 0.7 米到客厅中间、
// 往左转 45° 看向餐桌和厨房推拉门：每个量从起点（带着绕圈的速度）缓到终点（三次 Hermite，见 descentKeys），转头最快 ≈ 34°/秒；
// 视角在前 1.4 秒（竖版 1.8 秒）里放宽。墙顶 2.8 米，降到它以下时天花板才出现（正好和视线平齐，不会突然冒出来）
export const DESCENT = {
  h: [
    [12.45, 0.713, 4.077, 4.834, 101.2, -46.2, 34.6],
    [12.70, 0.830, 3.725, 4.871, 106.0, -41.4, 40.5],
    [12.95, 0.947, 3.287, 4.978, 113.2, -34.7, 47.8],
    [13.20, 1.056, 2.815, 5.128, 121.6, -27.0, 54.6],
    [13.45, 1.153, 2.360, 5.293, 130.1, -19.3, 59.1],
    [13.70, 1.230, 1.972, 5.445, 137.6, -12.6, 60.0],
    [13.95, 1.282, 1.701, 5.557, 143.0, -7.8, 60.0],
  ],
  v: [
    [12.45, 0.712, 4.679, 4.841, 101.3, -48.1, 35.0],
    [12.70, 0.829, 4.247, 4.877, 106.3, -43.1, 42.2],
    [12.95, 0.946, 3.705, 4.983, 113.8, -36.1, 52.0],
    [13.20, 1.056, 3.119, 5.131, 122.6, -28.0, 62.6],
    [13.45, 1.153, 2.550, 5.295, 131.5, -19.9, 72.6],
    [13.70, 1.230, 2.065, 5.446, 139.3, -12.9, 80.2],
    [13.95, 1.281, 1.727, 5.557, 144.9, -7.9, 83.9],
  ],
};

// ---------- 分段三次 Hermite（每个通道单独算，切线按时间加权、单调限幅：不过冲、不回弹）：降进屋里那段用 ----------
// keys：[{ t, v: [...], m?: [...] }]；没给 m 的中间帧按 Fritsch–Carlson 算；首尾没给 m 就是 0
export function makeTrack(keys) {
  const n = keys.length;
  for (let j = 1; j < n - 1; j++) {
    const A = keys[j - 1], K = keys[j], C = keys[j + 1], h0 = K.t - A.t, h1 = C.t - K.t;
    if (K.m) continue;
    K.m = K.v.map((x, i) => {
      const s0 = (x - A.v[i]) / h0, s1 = (C.v[i] - x) / h1;
      if (s0 * s1 <= 0) return 0;
      const m = (s0 * h1 + s1 * h0) / (h0 + h1);
      return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.min(Math.abs(s0), Math.abs(s1)));
    });
  }
  keys[0].m ??= keys[0].v.map(() => 0);
  keys[n - 1].m ??= keys[n - 1].v.map(() => 0);
  return (t) => {
    let j = 0;
    while (j < n - 2 && t > keys[j + 1].t) j++;
    const A = keys[j], C = keys[j + 1], h = C.t - A.t, u = clamp01((t - A.t) / h);
    const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    return A.v.map((x, i) => h00 * x + h10 * h * A.m[i] + h01 * C.v[i] + h11 * h * C.m[i]);
  };
}
// 降进屋里那段的关键帧：first = 绕圈最后一刻（带速度），接 DESCENT，最后一帧 = 第一人称起点（切线 = 起步速度；yaw 展开、不绕远路）
// 第 7 轮：director 传了 first（绕圈最后一刻的机位和速度）时，中间的关键帧按每个量各自的三次 Hermite 现算——起点带着绕圈的速度、
// 终点停稳（视角在 DESCENT_FOV_T 秒内放宽），密密地取关键帧：降下来时水平方向不会在头一两帧突然掉头（绕圈结束时还在往东北走）。
// 没传 first（tools/tour-path.mjs 画路线图）就用上面存好的 DESCENT（按横版、竖版各自绕圈的终点算的近似值）
const DESCENT_FOV_T = { h: 1.4, v: 1.8 };
export function descentKeys(vertical, first = []) {
  const W = buildWalk(vertical), s = W.at(T_LAND), keys = [...first];
  let prev = keys.length ? keys[keys.length - 1].v[3] : s.yaw;
  const unwrap = (y) => { while (y - prev > 180) y -= 360; while (y - prev < -180) y += 360; prev = y; return y; };
  if (first.length) {
    const F = first[first.length - 1], T = T_LAND - F.t, yEnd = unwrap(s.yaw), end = [s.x, EYE_H, s.z, yEnd, s.pitch, W.fov];
    const herm = (p0, p1, m0, m1, D, t) => { const u = clamp01(t / D); return (2 * u ** 3 - 3 * u ** 2 + 1) * p0 + (u ** 3 - 2 * u ** 2 + u) * D * m0 + (-2 * u ** 3 + 3 * u ** 2) * p1 + (u ** 3 - u ** 2) * D * m1; };
    for (let k = 1; k / 15 < T - 0.05; k++) {                     // 每 1/15 秒一帧：Hermite 几乎就是这条三次曲线本身，加速度不会在关键帧处起伏
      const t = k / 15;
      keys.push({ t: F.t + t, v: end.map((e, i) => (i === 5 ? herm(F.v[i], e, F.m?.[i] || 0, 0, DESCENT_FOV_T[vertical ? "v" : "h"], t) : herm(F.v[i], e, F.m?.[i] || 0, W.v0[i], T, t))) });
    }
    keys.push({ t: T_LAND, v: end, m: [...W.v0] });
    return { keys, yawOffset: yEnd - s.yaw };
  }
  for (const [t, x, y, z, yaw, pitch, fov] of DESCENT[vertical ? "v" : "h"]) keys.push({ t, v: [x, y, z, unwrap(yaw), pitch, fov] });
  const yl = unwrap(s.yaw);
  keys.push({ t: T_LAND, v: [s.x, EYE_H, s.z, yl, s.pitch, W.fov], m: [...W.v0] });
  return { keys, yawOffset: yl - s.yaw };
}
export { smooth };
