// 第 6、7 轮：漫游路线检查（不开浏览器）。按 src/look/tour.js 的 ROUTE / DESCENT 采样第一人称那段（和降进屋里那段），算：
//   速度、加速度（沿路线的、合成的）、转头（yaw）和俯仰的角速度——给每个房间的用时；
//   每一刻离墙、门框、门扇、推拉门扇、高的东西（吊灯、落地灯、绿植、衣柜、冰箱、淋浴房、窗帘）有多近，有没有从家具上面"穿过去"；
//   画面里"近处的墙 / 门扇 / 衣柜"占多少（水平方向按屏幕等距打 61 条射线，近处 < 0.9 米的竖直覆盖率加权，> 25% 的时段列出来）；
//   降进屋里那段越过西墙时多高（墙顶 2.8 米）。
// 然后交给 tools/tour-path.py 画路线图（按速度着色、标各房间用时）。
// 用法：node tools/tour-path.mjs [--v]   → out/look/tmp/tour-path[-v].json，并打印统计
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWalk, descentKeys, makeTrack, T_LAND, TOUR_IN, TL_TOUR, ROUTE, EYE_H } from "../src/look/tour.js";
import { planDecor, FURN, toWorld } from "../src/look/decor.js";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const V = process.argv.includes("--v");
const plan = JSON.parse(readFileSync(join(root, "public/plans/opus55.json"), "utf8"));
const decor = planDecor(plan, { cut: 2.8 });
const W = buildWalk(V), TB = W.table, HZ = 120;
const deg = Math.PI / 180;

// ---------- 采样：第一人称（120 赫兹的机位表，导数用中心差分）+ 降进屋里（关键帧，从 DESCENT 第一帧起） ----------
const n = TB.t.length;
const d1 = (a, j) => { const i0 = Math.max(0, j - 1), i1 = Math.min(n - 1, j + 1); return ((a[i1] - a[i0]) * HZ) / (i1 - i0); };
const vx = TB.x.map((_, j) => d1(TB.x, j)), vz = TB.z.map((_, j) => d1(TB.z, j));
// 合成加速度用 ±50 毫秒的差分（路线是 1 厘米一段的折线，逐点差分会有锯齿）；停下来、原地反向的那一刻（速度 < 5 厘米 / 秒）不算
const d6 = (a, j) => { const i0 = Math.max(0, j - 6), i1 = Math.min(n - 1, j + 6); return ((a[i1] - a[i0]) * HZ) / (i1 - i0); };
const ax = vx.map((_, j) => d6(vx, j)), az = vz.map((_, j) => d6(vz, j));
const yr = TB.yaw.map((_, j) => d1(TB.yaw, j)), pr = TB.pitch.map((_, j) => d1(TB.pitch, j));
const ya = yr.map((_, j) => d1(yr, j));
const sp = vx.map((_, j) => Math.hypot(vx[j], vz[j]));
const at = sp.map((_, j) => (sp[j] < 0.05 ? 0 : d1(sp, j)));   // 沿路线的加速度（速度大小的变化率；停下来反向的那一刻不算）
const samples = [];
for (let j = 0; j < n; j += 4) {                         // 30 帧 / 秒
  samples.push({ t: +TB.t[j].toFixed(3), x: TB.x[j], z: TB.z[j], y: EYE_H, yaw: TB.yaw[j], pitch: TB.pitch[j], fov: W.fov, speed: sp[j], acc: at[j], accAll: sp[j] < 0.05 ? 0 : Math.hypot(ax[j], az[j]), yawRate: yr[j], yawAcc: ya[j], pitchRate: pr[j] });
}
const { keys } = descentKeys(V, []);
const dt = makeTrack(keys.map((k) => ({ ...k, v: [...k.v], m: k.m && [...k.m] })));
const descent = [];
for (let t = keys[0].t; t <= T_LAND + 1e-6; t += 1 / 30) { const v = dt(t); descent.push({ t: +t.toFixed(3), x: v[0], y: v[1], z: v[2], yaw: v[3], pitch: v[4], fov: v[5] }); }

// ---------- 障碍 ----------
// 墙：沿中线切段，门洞、推拉门洞在眼高处是空的；窗在眼高处算墙；入户门关着（第 6 轮不从门外进来），也算墙
const segs = [];
for (const w of plan.walls) {
  const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  const holes = plan.openings.filter((o) => o.wall === w.id && o.type !== "window" && o.name !== "入户门").map((o) => [o.at - o.w / 2 + 0.05, o.at + o.w / 2 - 0.05]).sort((a, b) => a[0] - b[0]);
  let u = -0.12;
  for (const [a, b] of [...holes, [L + 0.12, L + 0.12]]) { if (a > u) segs.push({ kind: "wall", a: [w.a[0] + ux * u, w.a[1] + uz * u], b: [w.a[0] + ux * a, w.a[1] + uz * a], r: w.t / 2, h: [0, 2.8] }); u = b; }
}
// 门扇（doors.jsx 的规则算出来的姿态）
const leaf = (hx, hz, ang, len) => ({ kind: "leaf", a: [hx, hz], b: [hx + Math.sin(ang) * len, hz + Math.cos(ang) * len], r: 0.02, h: [0, 2.05] });
segs.push(leaf(3.55, 3.54, 210 * deg, 0.7));              // 卫生间门：合页在西，开进卫生间 120°（斜着收在洗手台和门之间的角落，tour.js 的 DOOR_OVERRIDES）
segs.push(leaf(5.2, 3.54, 180 * deg, 0.7));               // 次卧门：合页在西，开进次卧 90°
segs.push(leaf(6.06, 4.1, 118 * deg, 0.8));               // 主卧门：合页在北，开进主卧 118°（塞进衣柜旁边的角落）
// 推拉门扇：厨房（西边那扇推到东边那扇后面 → 东半边是两层玻璃）、阳台（滑开以后中间两扇各叠到两边）
segs.push({ kind: "panel", a: [1.47, 3.6], b: [2.25, 3.6], r: 0.04, h: [0, 2.35] });
segs.push({ kind: "panel", a: [0.9, 8.4], b: [1.98, 8.4], r: 0.04, h: [0, 2.35] }, { kind: "panel", a: [4.02, 8.4], b: [5.1, 8.4], r: 0.04, h: [0, 2.35] });
// 高的东西（圆）
const circles = [];
for (const d of decor) {
  if (d.kind === "lamp" && d.style === "pendant") circles.push({ kind: "pendant", c: [d.x, d.z], r: 0.25 });
  if (d.kind === "lamp" && d.style === "floor") circles.push({ kind: "floorlamp", c: [d.x, d.z], r: 0.22 });
  if (d.kind === "plant") circles.push({ kind: "plant-" + d.size, c: [d.x, d.z], r: d.size === "big" ? 0.42 : 0.32 });
  if (d.kind === "curtain") circles.push({ kind: "curtain", c: [d.x, d.z], r: 0.25 });
}
for (const f of plan.furniture.filter((f) => f.type === "plant")) circles.push({ kind: "plant", c: f.at, r: 0.32 });
// 家具占地框：高的（衣柜、冰箱、淋浴房）算障碍、也算"挡画面"；矮的只检查"有没有从上面穿过去"；餐椅单独算（餐桌的框含椅子）
const TALL = { wardrobe: 2.2, fridge: 1.8, shower: 2.0 };
const boxes = plan.furniture.map((f) => {
  const S = FURN[f.type] || { w: 0.5, d: 0.5 }, [cx, cz] = toWorld(f, 0, S.oz || 0), r = ((f.rot || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)), hw = (S.w * c + S.d * s) / 2, hd = (S.w * s + S.d * c) / 2;
  return { type: f.type, tall: f.type in TALL, h: TALL[f.type], box: [cx - hw, cz - hd, cx + hw, cz + hd] };
});
const segDist = (p, a, b) => { const vx = b[0] - a[0], vz = b[1] - a[1], L2 = vx * vx + vz * vz || 1e-9, u = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / L2)); return Math.hypot(p[0] - a[0] - vx * u, p[1] - a[1] - vz * u); };
const boxDist = (p, b) => Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[2]), Math.max(b[1] - p[1], 0, p[1] - b[3]));

// ---------- 离得多近 ----------
const report = [];
for (const s of samples) {
  const p = [s.x, s.z];
  let best = { d: 9, what: "" };
  for (const g of segs) { const d = segDist(p, g.a, g.b) - g.r; if (d < best.d) best = { d, what: g.kind }; }
  for (const c of circles) { const d = Math.hypot(p[0] - c.c[0], p[1] - c.c[1]) - c.r; if (d < best.d) best = { d, what: c.kind }; }
  for (const b of boxes) { const d = boxDist(p, b.box); if (b.tall && d < best.d) best = { d, what: b.type }; if (!b.tall && d === 0) s.over = b.type; }
  s.clear = +best.d.toFixed(3); s.near = best.what;
  if (best.d < 0.28 || s.over) report.push(`${s.t.toFixed(2)}s (${s.x.toFixed(2)}, ${s.z.toFixed(2)})  离${best.what} ${best.d.toFixed(2)} 米${s.over ? "  ⚠ 从" + s.over + "上方穿过" : ""}`);
}

// ---------- 画面里近处的墙 / 门扇 / 衣柜占多少 ----------
function raySeg(p, d, g) {
  const ex = g.b[0] - g.a[0], ez = g.b[1] - g.a[1], den = d[0] * ez - d[1] * ex;
  if (Math.abs(den) < 1e-9) return null;
  const wx = g.a[0] - p[0], wz = g.a[1] - p[1];
  const t = (wx * ez - wz * ex) / den, u = (wx * d[1] - wz * d[0]) / den;
  const L = Math.hypot(ex, ez), pad = g.r / L;
  if (u < -pad || u > 1 + pad || t <= 0) return null;
  const sinA = Math.abs(den) / L;
  return Math.max(0.02, t - g.r / Math.max(0.15, sinA));
}
function rayBox(p, d, b) {
  let t0 = 0, t1 = 1e9;
  for (const [o, dd, lo, hi] of [[p[0], d[0], b[0], b[2]], [p[1], d[1], b[1], b[3]]]) {
    if (Math.abs(dd) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let a = (lo - o) / dd, c = (hi - o) / dd; if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
  }
  return t0 <= t1 && t0 > 0 ? t0 : null;
}
const aspect = V ? 9 / 16 : 16 / 9, tanV = Math.tan((W.fov / 2) * deg), tanH = tanV * aspect, NEAR = 0.9;
for (const s of samples) {
  const p = [s.x, s.z];
  let near = 0;
  const what = {}, C = 61;
  for (let c = 0; c < C; c++) {
    const sx = -1 + (2 * c) / (C - 1), phi = Math.atan(sx * tanH), a = s.yaw * deg - phi; // 屏幕右边 = yaw 减小的方向
    const d = [Math.sin(a), Math.cos(a)];
    let best = { t: 1e9, h: [0, 0], k: "" };
    for (const g of segs) { const t = raySeg(p, d, g); if (t != null && t < best.t) best = { t, h: g.h, k: g.kind }; }
    for (const b of boxes) if (b.tall) { const t = rayBox(p, d, b.box); if (t != null && t < best.t) best = { t, h: [0, b.h], k: b.type }; }
    if (best.t > NEAR) continue;
    const e0 = Math.atan((best.h[0] - EYE_H) / best.t) / deg, e1 = Math.atan((best.h[1] - EYE_H) / best.t) / deg;
    const y = (e) => Math.max(-1, Math.min(1, Math.tan(Math.max(-89, Math.min(89, e - s.pitch)) * deg) / tanV));
    const cov = (y(e1) - y(e0)) / 2;
    near += cov / C; what[best.k] = (what[best.k] || 0) + cov / C;
  }
  s.fill = +near.toFixed(3); s.fillWhat = Object.entries(what).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(" ");
}
const fills = [];
let run = null;
for (const s of samples) {
  if (s.fill > 0.25) { if (!run) run = { t0: s.t, max: 0, what: "" }; run.t1 = s.t; if (s.fill > run.max) { run.max = s.fill; run.what = s.fillWhat; } }
  else if (run) { fills.push(run); run = null; }
}
if (run) fills.push(run);

// ---------- 各房间用时（按相机所在的房间矩形；站在墙洞里算前一个房间） ----------
const onWall = (x, z) => Math.abs(z - 3.6) < 0.07 || (Math.abs(x - 6) < 0.07 && z > 3.6) || Math.abs(z - 8.4) < 0.07;
const roomOf = (x, z) => (onWall(x, z) ? null : plan.rooms.find((r) => x >= r.rect[0] && x <= r.rect[2] && z >= r.rect[1] && z <= r.rect[3])?.name);
const visits = [];
let last = null;
for (const s of samples) {
  const r = roomOf(s.x, s.z) || (last && last.room);
  if (!last || last.room !== r) { last = { room: r, t0: s.t, t1: s.t }; visits.push(last); } else last.t1 = s.t;
}
for (let i = 0; i < visits.length - 1; i++) visits[i].t1 = visits[i + 1].t0;
visits[visits.length - 1].t1 = TL_TOUR.end;

// ---------- 降进屋里那段：越过西墙时的高度 ----------
const wallCross = descent.filter((s) => s.x > -0.2 && s.x < 0.2).map((s) => s.y);
const ceilAt = descent.find((s) => s.y < 2.79);

// ---------- 输出 ----------
const out = join(root, "out/look/tmp");
mkdirSync(out, { recursive: true });
const nodes = ROUTE.map((r, i) => ({ p: r.p, t: W.tin[i], tout: W.tout[i], hold: W.hold[i] || 0, beat: r.beat || null }));
// 第 7 轮：按 ROUTE 里各拍（beat）切成段：落地 → 厨房门、厨房、绕餐桌、卫生间、→ 次卧、次卧、→ 主卧、主卧、→ 阳台门、阳台
const beatT = (re) => { const i = ROUTE.findIndex((r) => r.beat && re.test(r.beat)); return i < 0 ? null : W.tin[i]; };
const cuts = [["从鸟瞰降到客厅中间", 12.2], ["走两步到厨房门（推拉门滑开）", T_LAND], ["厨房", beatT(/走进厨房/)], ["绕过餐桌（电视、外滩、沙发）", beatT(/出厨房/)], ["卫生间", beatT(/进卫生间/)],
  ["走向次卧", beatT(/出卫生间/)], ["次卧", beatT(/进次卧/)], ["走向主卧", beatT(/出次卧/)], ["主卧", beatT(/进主卧/)], ["穿过客厅到阳台门", beatT(/出主卧/)], ["阳台", beatT(/走上阳台/)]].filter((c) => c[1] != null);
const segments = cuts.map(([name, t0], k) => ({ name, t0, t1: k + 1 < cuts.length ? cuts[k + 1][1] : TL_TOUR.end }));
writeFileSync(join(out, `tour-path${V ? "-v" : ""}.json`), JSON.stringify({ samples, descent, segs, circles, boxes, plan, nodes, visits, segments, aspect, slideB: TOUR_IN.slideB, slideK: TOUR_IN.slideK, end: TL_TOUR.end, tLand: T_LAND }));
const inner = (s) => s.t > T_LAND + 0.2;
const max = (k) => samples.filter(inner).reduce((m, s) => (Math.abs(s[k]) > Math.abs(m[k]) ? s : m));
// 120 赫兹逐点扫一遍（30 帧的采样会漏掉一两个点的跳变）：朝向、俯仰的角速度和角加速度最大值
{
  const j0 = TB.t.findIndex((t) => t > T_LAND + 0.2), mx = (arr) => { let m = 0, t = 0; for (let j = Math.max(1, j0); j < n - 1; j++) if (Math.abs(arr[j]) > m) { m = Math.abs(arr[j]); t = TB.t[j]; } return [m, t]; };
  const pa = pr.map((_, j) => d1(pr, j)), [a, ta] = mx(yr), [b, tb] = mx(pr), [c, tc] = mx(ya), [d, td] = mx(pa);
  console.log(`（120 赫兹逐点）转头最快 ${a.toFixed(1)}°/s（${ta.toFixed(2)}s），俯仰最快 ${b.toFixed(1)}°/s（${tb.toFixed(2)}s），转头角加速度最大 ${c.toFixed(0)}°/s²（${tc.toFixed(2)}s），俯仰角加速度最大 ${d.toFixed(0)}°/s²（${td.toFixed(2)}s）`);
}
console.log(`第一人称 ${T_LAND}–${TL_TOUR.end} 秒（${W.dur.toFixed(1)} 秒），总长 ${W.geo.total.toFixed(1)} 米；厨房推拉门 ${TOUR_IN.slideK.join("–")} 秒，阳台推拉门 ${TOUR_IN.slideB.join("–")} 秒`);
const m1 = max("speed"), m2 = max("acc"), m3 = max("accAll"), m4 = max("yawRate"), m5 = max("pitchRate"), m6 = max("yawAcc");
console.log(`速度最大 ${m1.speed.toFixed(2)} 米/秒（${m1.t.toFixed(1)}s）；沿路线加速度最大 ${Math.abs(m2.acc).toFixed(2)} 米/秒²（${m2.t.toFixed(1)}s），合成（含拐弯）${m3.accAll.toFixed(2)}（${m3.t.toFixed(1)}s）`);
console.log(`转头最快 ${Math.abs(m4.yawRate).toFixed(1)}°/s（${m4.t.toFixed(1)}s），转头角加速度最大 ${Math.abs(m6.yawAcc).toFixed(1)}°/s²（${m6.t.toFixed(1)}s）；俯仰最快 ${Math.abs(m5.pitchRate).toFixed(1)}°/s`);
const over = (lim) => samples.filter((s) => inner(s) && Math.abs(s.yawRate) > lim).length / 30;
console.log(`转头 > 20°/s 的时间共 ${over(20).toFixed(1)} 秒，> 25°/s ${over(25).toFixed(1)} 秒，> 30°/s ${over(30).toFixed(1)} 秒；俯仰范围 ${Math.min(...samples.map((s) => s.pitch)).toFixed(1)}…${Math.max(...samples.map((s) => s.pitch)).toFixed(1)}°`);
const peaks = [];
for (let j = 1; j < samples.length - 1; j++) { const s = samples[j]; if (Math.abs(s.yawRate) > 18 && Math.abs(s.yawRate) > Math.abs(samples[j - 1].yawRate) + 0.05 && Math.abs(s.yawRate) >= Math.abs(samples[j + 1].yawRate)) peaks.push(`${s.t.toFixed(1)}s ${s.yawRate.toFixed(0)}`); }
if (peaks.length) console.log("转头峰值（> 18°/s）：" + peaks.join("，"));
console.log(`离得近（< 0.28 米）或穿过家具：${report.length} 处`);
for (const r of report.filter((_, i) => i % 3 === 0)) console.log("  " + r);
console.log(`近处（< ${NEAR} 米）的墙 / 门扇 / 衣柜占画面 > 25%：${fills.length} 段`);
for (const f of fills) console.log(`  ${f.t0.toFixed(1)}–${f.t1.toFixed(1)}s（${(f.t1 - f.t0 + 1 / 30).toFixed(1)} 秒）最多 ${(f.max * 100).toFixed(0)}%：${f.what}`);
console.log("各段用时：" + segments.map((g) => `${g.name} ${g.t0.toFixed(1)}–${g.t1.toFixed(1)}（${(g.t1 - g.t0).toFixed(1)}）`).join("，"));
console.log("各房间用时：" + visits.map((v) => `${v.room} ${v.t0.toFixed(1)}–${v.t1.toFixed(1)}（${(v.t1 - v.t0).toFixed(1)}）`).join("，"));
console.log(`降进屋里：越过西墙时高 ${wallCross.length ? Math.min(...wallCross).toFixed(2) : "?"} 米；${ceilAt ? `${ceilAt.t.toFixed(2)}s 降到 2.8 米以下，此时 x = ${ceilAt.x.toFixed(2)}` : ""}`);
