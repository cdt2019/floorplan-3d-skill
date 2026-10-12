// 成片时间线的静帧：打开 ?rec&…&seq=final，等就绪后跳到指定秒数各截一张（检查镜头、出对比图用）。
// 用法（先 npm run dev）：
//   node tools/seq-stills.mjs --t 27.4,29,30.5,32,34,37,40 --name seq          # → out/look/tmp/seq-27.4.png …
//   node tools/seq-stills.mjs --v --t 33,38 --name seqv                         # 竖版
//   --q 追加网址参数；--dir 输出目录（默认 out/look/tmp）；--small 小图（调机位用）
// 双显卡笔记本加环境变量 EDGE_ARGS="--force_high_performance_gpu"。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, log, openPage, root, sleep } from "./browser.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const V = argv.includes("--v"), SMALL = argv.includes("--small"); // --small：640×360 / 360×640、1 倍像素（调机位用，快）
const [W, H] = SMALL ? (V ? [360, 640] : [640, 360]) : V ? [720, 1280] : [1280, 720];
const url = `http://localhost:5182/?rec${V ? "=v" : ""}&style=e2&plan=opus55&clean&look=pro&pbr&seq=final${arg("q", "")}`;
const dir = join(root, arg("dir", "out/look/tmp"));
mkdirSync(dir, { recursive: true });
const { send, evaluate, errors } = await openPage({ url, W, H, DSF: SMALL ? 1 : 1.5, cdpPort: 9461 });
for (let k = 0; !(await evaluate("!!(window.__directorReady && window.__three && window.__lookReady)").catch(() => false)); k++) {
  if (k > 400) throw new Error("页面没准备好：" + errors.join("\n"));
  await sleep(300);
}
await sleep(1500);
for (const t of arg("t", "27.4,30,32,34,37,40").split(",").map(Number)) {
  await evaluate(`(async () => { window.__director.seek(${t}); for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(r)); window.__director.seek(${t}); for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r)); return 1; })()`);
  const r = await send("Page.captureScreenshot", { format: "png" });
  const f = join(dir, `${arg("name", "seq")}-${t}.png`);
  writeFileSync(f, Buffer.from(r.result.data, "base64"));
  log("已保存", f);
}
if (errors.length) log("页面报错 / 警告：\n  " + [...new Set(errors)].slice(0, 10).join("\n  "));
cleanup();
process.exit(0);
