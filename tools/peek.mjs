// 调试用：无头 Edge 打开一个网址，等 look=pro 就绪，可选执行一段 JS（--js "表达式" 或 --jsfile 文件），再截一张图。
// 用法（先 npm run dev）：
//   node tools/peek.mjs --q "style=e2&stage=6&finish=1&plan=opus55&clean&look=pro&pbr&mood=m3&view=eye&cut=2.8" --out out/look/tmp/peek.png
//   node tools/peek.mjs --q "…" --js "window.__three.camera.position.toArray()" --noshot
//   --v 竖版 720×1280；--w 1280 --h 720 自定尺寸；--wait 毫秒（就绪后再等）
// 双显卡笔记本加环境变量 EDGE_ARGS="--force_high_performance_gpu"。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cleanup, log, openPage, root, sleep } from "./browser.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const V = argv.includes("--v");
const W = Number(arg("w", V ? 720 : 1280)), H = Number(arg("h", V ? 1280 : 720));
const url = `http://localhost:5182/?${arg("q", "")}`;
const { send, evaluate, errors } = await openPage({ url, W, H, DSF: Number(arg("dsf", 1.5)), cdpPort: Number(arg("port", 9471)) });
for (let k = 0; !(await evaluate("!!document.querySelector('canvas')").catch(() => false)); k++) { if (k > 100) throw new Error("页面没起来：" + errors.join("\n")); await sleep(300); }
if (/look=/.test(url)) for (let k = 0; !(await evaluate("!!window.__lookReady").catch(() => false)); k++) { if (k > 400) { log("等不到 __lookReady"); break; } await sleep(300); }
await sleep(Number(arg("wait", 1500)));
const js = arg("jsfile") ? readFileSync(arg("jsfile"), "utf8") : arg("js");
if (js) {
  const r = await evaluate(`(async () => { ${js.includes("return") ? js : "return (" + js + ")"} })()`).catch((e) => "ERR " + e.message);
  console.log(typeof r === "string" ? r : JSON.stringify(r, null, 1));
  await sleep(Number(arg("after", 600)));
}
if (!argv.includes("--noshot")) {
  const out = join(root, arg("out", "out/look/tmp/peek.png"));
  mkdirSync(dirname(out), { recursive: true });
  const r = await send("Page.captureScreenshot", { format: out.endsWith(".jpg") ? "jpeg" : "png" });
  writeFileSync(out, Buffer.from(r.result.data, "base64"));
  log("已保存", out);
}
if (errors.length) log("页面报错 / 警告：\n  " + [...new Set(errors)].slice(0, 12).join("\n  "));
cleanup();
process.exit(0);
