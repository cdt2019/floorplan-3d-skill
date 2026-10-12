// 第 4 轮：人眼高度（1.6 米）挨个房间拍静帧（烘焙光照 m3），页面只开一次，换机位连拍。
// 用法（先 npm run dev，烘焙文件在 public/bake/<set>/）：
//   node tools/room-shots.mjs                          # 全部房间，横版 → out/look/tmp/room-<名字>.png
//   node tools/room-shots.mjs --v living bed2          # 竖版（720×1280），只拍这两间 → room-<名字>-v.png
//   node tools/room-shots.mjs --night n1 night         # 阳台看夜景（&night=n1）
//   --q 追加网址参数；--dir 输出目录；--tag 输出名后缀；--fps 每个机位测 4 秒帧率（关垂直同步）
// 双显卡笔记本加环境变量 EDGE_ARGS="--force_high_performance_gpu"。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, log, openPage, root, sleep } from "./browser.mjs";

// 机位：cam = 相机（x 东、y 高、z 南），tgt = 看向的点；fov = 竖直视角（度）；vfov = 竖版用的视角
export const ROOMS = {
  living: { cam: [0.75, 1.6, 7.95], tgt: [5.4, 1.0, 5.3], fov: 50, vcam: [1.0, 1.6, 7.7], vtgt: [5.5, 1.05, 5.9], vfov: 64, label: "客厅" },
  dining: { cam: [4.7, 1.6, 7.6], tgt: [1.6, 1.0, 4.1], fov: 50, label: "餐厅" },
  kitchen: { cam: [2.35, 1.6, 3.35], tgt: [1.0, 1.05, 0.35], fov: 58, vcam: [1.75, 1.6, 3.4], vtgt: [1.6, 1.05, 0.3], vfov: 70, label: "厨房" },
  bath: { cam: [3.95, 1.6, 3.38], tgt: [3.95, 1.05, 0.6], fov: 64, vcam: [4.05, 1.6, 3.42], vtgt: [3.8, 1.0, 0.6], vfov: 74, label: "卫生间" },
  bed2: { cam: [5.45, 1.6, 3.3], tgt: [8.6, 0.95, 1.3], fov: 56, label: "次卧" },
  master: { cam: [6.35, 1.6, 4.2], tgt: [9.3, 0.95, 6.6], fov: 56, vcam: [6.4, 1.6, 4.5], vtgt: [9.5, 0.95, 5.95], vfov: 66, label: "主卧" },
  balcony: { cam: [0.6, 1.6, 8.75], tgt: [5.2, 1.0, 9.55], fov: 56, label: "阳台" },
  // 阳台夜景：站在阳台西头（小桌椅旁）往东南偏南看——天际线在画面中间，左下是绿植和灯笼（面朝南时东边在画面左边），右边是西侧栏板；
  // 竖版往东多转一点、往下多看一点，把灯笼带进来
  night: { cam: [0.9, 1.6, 8.45], tgt: [2.4, 0.39, 13.06], fov: 62, vcam: [0.9, 1.6, 8.45], vtgt: [2.86, 0.22, 12.84], vfov: 70, label: "阳台夜景" },
};

const argv = process.argv.slice(2);
const opt = (k, d = "") => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv.splice(i, 2)[1] : d; };
const V = argv.includes("--v"), FPS = argv.includes("--fps");
const EXTRA = opt("q"), DIR = opt("dir", "out/look/tmp"), TAG = opt("tag"), NIGHT = opt("night");
const names = argv.filter((a) => !a.startsWith("--"));
const list = names.length ? names : Object.keys(ROOMS).filter((k) => k !== "night");
if (FPS) process.env.EDGE_ARGS = [process.env.EDGE_ARGS, "--disable-gpu-vsync", "--disable-frame-rate-limit"].filter(Boolean).join(" ");
const [W, H] = V ? [720, 1280] : [1280, 720];
const url = `http://localhost:5182/?style=e2&stage=6&finish=1&plan=opus55&clean&look=pro&pbr&view=eye&baked${NIGHT ? "&night=" + NIGHT : ""}${EXTRA}`;
mkdirSync(join(root, DIR), { recursive: true });
const { send, evaluate, errors } = await openPage({ url, W, H, DSF: 1.5, cdpPort: 9481 });
for (let k = 0; !(await evaluate("!!(window.__three && window.__lookReady)").catch(() => false)); k++) {
  if (k > 500) throw new Error("页面没准备好：" + errors.join("\n"));
  await sleep(300);
}
await sleep(1200);
const gpu = await evaluate(`(() => { const g = document.querySelector('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })()`).catch(() => "?");
log("GPU", gpu, (await evaluate("JSON.stringify({applied: window.__bake?.applied, missing: window.__bake?.missing?.length})")) || "");
for (const n of list) {
  const s = ROOMS[n];
  if (!s) { log("没有这个机位", n); continue; }
  const fov = V ? s.vfov || s.fov + 10 : s.fov, cam = (V && s.vcam) || s.cam, tgt = (V && s.vtgt) || s.tgt;
  await evaluate(`(async () => { const { camera, controls } = window.__three;
    camera.position.set(${cam}); controls.target.set(${tgt}); camera.fov = ${fov}; camera.updateProjectionMatrix(); controls.update();
    for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r)); return 1; })()`);
  if (FPS) {
    const fps = await evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); })`);
    log(`${n}: ${fps.toFixed(1)} fps`);
    continue;
  }
  const r = await send("Page.captureScreenshot", { format: "png" });
  const f = join(root, DIR, `room-${n}${NIGHT ? "-" + NIGHT : ""}${TAG ? "-" + TAG : ""}${V ? "-v" : ""}.png`);
  writeFileSync(f, Buffer.from(r.result.data, "base64"));
  log("已保存", f);
}
if (errors.length) log("页面报错 / 警告：\n  " + [...new Set(errors)].slice(0, 12).join("\n  "));
cleanup();
process.exit(0);
