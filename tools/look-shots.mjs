// 画质实验（look-spike）：同一套户型、同一个完成状态，按不同渲染管线各拍一张 1920×1080，存到 out/look/。
// 用法（先 npm run dev）：
//   node tools/look-shots.mjs            # 全拍
//   node tools/look-shots.mjs b c        # 只拍 B、C
//   node tools/look-shots.mjs --fps b c  # 不拍照，测实时帧率（关掉垂直同步）
//   node tools/look-shots.mjs m1 m2 m3 m4         # 氛围预设；加 --v 拍竖版 1080×1920（输出 m1-v.png）
//   node tools/look-shots.mjs t0 t1 t2 t3 t4 t5 t6 t7   # 一天的时间 tod = 0, 0.15, … 1
//   node tools/look-shots.mjs m2a m2b m2c && node tools/look-shots.mjs --v m2a m2b m2c   # 第 2 轮：奶油阴天的三个看得清的版本
//   node tools/look-shots.mjs cl-living-m2a cl-bed-m2a cl-living-m3 cl-bed-m3            # 第 2 轮：软装近景（白天 / 夜里）
//   node tools/look-shots.mjs eyeb && node tools/look-shots.mjs --fps eyeb               # 第 3 轮：人眼高度 + 烘焙光照（静帧 / 帧率）
// 双显卡笔记本默认走核显；加环境变量 EDGE_ARGS="--force_high_performance_gpu" 用独显。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, log, openPage, root, sleep } from "./browser.mjs";

const BASE = "style=e2&stage=6&finish=1&plan=opus55&clean";
export const SHOTS = {
  a: { q: `${BASE}&view=iso`, wait: 3500, label: "A 现在：正交等轴测 · 无色调映射 · 墨线" },
  b: { q: `${BASE}&look=pro`, wait: 6000, label: "B 光照 + 后期（几何、材质不变）" },
  c: { q: `${BASE}&look=pro&pbr`, wait: 9000, label: "C B + PBR 贴图 + CC0 模型" },
  d: { q: `${BASE}&look=pro&pbr&view=eye&cut=2.8`, wait: 9000, label: "D 人眼高度：C 的材质，站在客厅看阳台" },
  e: { q: `${BASE}&look=pt&view=eye&cut=2.8`, wait: 0, label: "E 路径追踪（D 的机位）", pt: true }, // PT_SAMPLES=96 PT_MAX_S=780
  // 第 3 轮：人眼高度 + Blender 烘焙的光照贴图（蓝调开灯，D 的机位）；要先跑 tools/bake-export.mjs + tools/blender/bake.py
  eyeb: { q: `${BASE}&look=pro&pbr&view=eye&baked`, label: "人眼高度 · 烘焙光照（蓝调）" },
};
// 氛围预设：m1–m4（第 1 轮）、m2a / m2b / m2c（第 2 轮）；一天的时间：t0–t7 = tod 0, 0.15, … 0.9, 1（配 m1 的配色和机位）
for (const m of ["m1", "m2", "m3", "m4", "m2a", "m2b", "m2c"]) SHOTS[m] = { q: `${BASE}&look=pro&pbr&mood=${m}`, label: m };
// 第 2 轮软装近景：客厅（从西南往东北看沙发、挂画、餐桌）、主卧（从西南往东看床、挂画、床头柜），白天 m2a / 夜里 m3
const CL = { living: "&cam=0.6,4.0,10.2&tgt=4.0,0.4,6.0&fov=40", bed: "&cam=5.9,3.6,9.4&tgt=8.6,0.4,5.4&fov=46" };
for (const [k, c] of Object.entries(CL)) for (const m of ["m2a", "m3"]) SHOTS[`cl-${k}-${m}`] = { q: `${BASE}&look=pro&pbr&mood=${m}${c}`, label: `${k} ${m}` };
export const TODS = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
TODS.forEach((t, i) => { SHOTS["t" + i] = { q: `${BASE}&look=pro&pbr&mood=m1&tod=${t}`, label: `tod=${t}` }; });
const argv = process.argv.slice(2);
const FPS = argv.includes("--fps");
const V = argv.includes("--v"); // 竖版 1080×1920，输出名加 -v
// 调参用：--extra "&tm=neutral&exp=1.3" 追加网址参数，--tag xx 让输出名变成 b-xx.png
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv.splice(i, 2)[1] : ""; };
const EXTRA = opt("extra"), TAG = opt("tag");
const pick = argv.filter((a) => !a.startsWith("--"));
const names = pick.length ? pick : ["a", "b", "c", "d"];
mkdirSync(join(root, "out", "look"), { recursive: true });
if (FPS) process.env.EDGE_ARGS = [process.env.EDGE_ARGS, "--disable-gpu-vsync", "--disable-frame-rate-limit"].filter(Boolean).join(" ");

for (const [i, n] of names.entries()) {
  const s = SHOTS[n];
  const { send, evaluate, errors, close } = await openPage({ url: `http://localhost:5182/?${s.q}${EXTRA}`, W: V ? 720 : 1280, H: V ? 1280 : 720, DSF: 1.5, cdpPort: 9401 + i });
  for (let k = 0; !(await evaluate("!!document.querySelector('canvas')").catch(() => false)); k++) { if (k > 80) throw new Error("页面没起来"); await sleep(300); }
  const gpu = await evaluate(`(() => { const g = document.querySelector('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })()`).catch(() => "?");
  if (s.pt) {
    // 路径追踪：等到采样数够了再拍，记录每个采样的耗时
    const target = Number(process.env.PT_SAMPLES || 256), t0 = Date.now();
    let last = 0;
    for (;;) {
      const st = await evaluate("window.__pt ? JSON.stringify(window.__pt) : null").catch(() => null);
      if (st) { const p = JSON.parse(st); if (p.status?.startsWith("error")) throw new Error(p.status); if (p.samples !== last && p.samples % 16 < 1) log(`${n}: ${p.samples.toFixed(0)} 采样，${((Date.now() - t0) / 1000).toFixed(0)} 秒`); last = p.samples; if (p.samples >= target) break; }
      if (Date.now() - t0 > Number(process.env.PT_MAX_S || 900) * 1000) { log("到时间上限了"); break; }
      await sleep(1000);
    }
    log(`${n}: ${JSON.stringify(await evaluate("JSON.stringify(window.__pt)"))}，总共 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  } else if (s.q.includes("look=")) {
    // 等页面自己说准备好了（贴图、模型、后期都就绪），最多 90 秒
    for (let k = 0; !(await evaluate("!!window.__lookReady").catch(() => false)); k++) { if (k > 300) { log(`${n}: 等不到 __lookReady，直接拍`); break; } await sleep(300); }
    await sleep(1500);
  } else await sleep(s.wait);
  if (FPS) {
    const fps = await evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); })`);
    log(`${n}: ${fps.toFixed(1)} fps（${gpu}）`);
  } else {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const file = `${n}${TAG ? "-" + TAG : ""}${V ? "-v" : ""}.png`;
    writeFileSync(join(root, "out", "look", file), Buffer.from(r.result.data, "base64"));
    log(`已保存 out/look/${file}（${gpu}）`);
  }
  if (errors.length) log("页面报错 / 警告：\n  " + [...new Set(errors)].slice(0, 8).join("\n  "));
  close();
}
cleanup();
process.exit(0);
