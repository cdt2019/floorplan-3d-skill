// 自动出片：无头 Edge 打开页面（?rec），虚拟时钟一帧一帧往前推、截图，ffmpeg 合成 MP4。
// 用法（先 npm run dev）：
//   node tools/record.mjs --q "style=e2&plan=ai&cast=read"   # 横版 1920×1080、30 帧 → out/floorplan-16x9.mp4
//   node tools/record.mjs --v          # 竖版 1080×1920 → out/floorplan-9x16.mp4
//   node tools/record.mjs --preview    # 10 帧预览，每秒存一张图到 out/preview/，先检查镜头
//   node tools/record.mjs --smooth     # 30 帧、低分辨率（960×540 / 竖版 540×960）的顺滑预览：看镜头稳不稳（10 帧预览会把抖动放大）
//   node tools/record.mjs --bgm 音乐.mp3   # 混一段背景音乐（自动淡出）
//   node tools/record.mjs --preview --q "style=e2&plan=opus55&clean&look=pro&pbr&mood=m1"   # 画质实验：透视鸟瞰的紧凑时间线（17 秒）
//     再加 &day：完成后一天过去（24 秒）。双显卡笔记本加环境变量 EDGE_ARGS="--force_high_performance_gpu"
//   node tools/record.mjs --preview --q "style=e2&plan=opus55&clean&look=pro&pbr&seq=final" --name look/round2-seq-16x9-preview   # 成片时间线（28 秒），加 &day2=m2b 换白天配色
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, log, openPage, root, sleep } from "./browser.mjs";

const FF = process.env.FFMPEG || "ffmpeg"; // 不在 PATH 里就设环境变量 FFMPEG 指向 ffmpeg.exe
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const V = argv.includes("--v"), PREVIEW = argv.includes("--preview"), SMOOTH = argv.includes("--smooth");
const FPS = PREVIEW ? 10 : 30;
const FAST = PREVIEW || SMOOTH; // 预览：编码快一点、画质低一点
const [W, H, DSF] = SMOOTH ? (V ? [540, 960, 1] : [960, 540, 1]) : V ? [540, 960, 2] : [1280, 720, 1.5];
const OUT = join(root, "out");
mkdirSync(OUT, { recursive: true });
const name = arg("name", `floorplan-${V ? "9x16" : "16x9"}${PREVIEW ? "-preview" : SMOOTH ? "-smooth" : ""}`); // --name look/round2-seq-16x9-preview → out/look/…mp4
const SILENT = join(OUT, `${name}.mp4`);
const URL = `http://localhost:5182/?rec${V ? "=v" : ""}&${arg("q", "style=e2")}`;

const { send, evaluate, errors } = await openPage({ url: URL, W, H, DSF, cdpPort: 9381, virtualTime: true });
for (let i = 0; !(await evaluate("!!(window.__directorReady && window.__three)").catch(() => false)); i++) {
  if (i > 100) throw new Error("页面没准备好：" + errors.join("\n"));
  await sleep(300);
}
// look=pro：等贴图、模型、后期都就绪（页面置 __lookReady），最多 90 秒
if (/[?&]look=/.test(URL)) {
  for (let i = 0; !(await evaluate("!!window.__lookReady").catch(() => false)); i++) { if (i > 300) { log("等不到 __lookReady，直接录"); break; } await sleep(300); }
  await evaluate("window.__director.seek(0), 1"); // 先摆到第 0 秒再开录，第一帧不会是预载时的完成状态
}
await sleep(1500); // 等字体、几何体都准备好
await evaluate("window.__vt.start(), 1");

const ff = spawn(FF, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  "-c:v", "libx264", "-preset", FAST ? "veryfast" : "slow", "-crf", PREVIEW ? "26" : SMOOTH ? "22" : "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", SILENT],
  { stdio: ["pipe", "inherit", "inherit"] });
const ffDone = new Promise((r) => ff.on("exit", r));
const pdir = join(OUT, "preview");
if (PREVIEW) { rmSync(pdir, { recursive: true, force: true }); mkdirSync(pdir, { recursive: true }); }
const step = 1000 / FPS;
const total = Math.ceil((await evaluate("window.__director.END")) * FPS);
const t0 = Date.now();
for (let f = 0; ; f++) {
  const more = await evaluate(`(async () => {
    const more = window.__director.frame(${step});
    // 让这一帧画完再截图。不能用 setTimeout：它已经换成虚拟时钟，不推进就不会触发
    await new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = r; ch.port2.postMessage(0); });
    return more;
  })()`);
  const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: PREVIEW ? 80 : SMOOTH ? 88 : 94, optimizeForSpeed: true });
  const buf = Buffer.from(shot.result.data, "base64");
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (PREVIEW && f % FPS === 0) writeFileSync(join(pdir, `t${String(f / FPS).padStart(2, "0")}.jpg`), buf);
  if (f % (FPS * 5) === 0) {
    const per = (Date.now() - t0) / (f + 1);
    log(`第 ${f}/${total} 帧（${(f / FPS).toFixed(0)} 秒），${per.toFixed(0)} 毫秒一帧，还要约 ${Math.ceil(((total - f) * per) / 60000)} 分钟`);
  }
  if (!more) break;
}
ff.stdin.end();
await ffDone;
if (errors.length) log("页面报错 / 警告：\n" + [...new Set(errors)].slice(0, 10).join("\n"));
cleanup();

const bgm = arg("bgm");
if (bgm && existsSync(bgm)) {
  const final = join(OUT, `${name}-bgm.mp4`);
  const dur = total / FPS;
  await new Promise((ok, bad) => spawn(FF, ["-y", "-loglevel", "error", "-i", SILENT, "-i", bgm, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-af", `volume=0.7,afade=t=in:d=1,afade=t=out:st=${dur - 2.5}:d=2.5`, "-shortest", "-movflags", "+faststart", final], { stdio: "inherit" })
    .on("exit", (c) => (c ? bad(new Error("混音失败")) : ok())));
  log(`完成：${final}`);
} else log(`完成：${SILENT}`);
process.exit(0);
