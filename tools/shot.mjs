// 拍一张高清截图检查画面：node tools/shot.mjs [风格 a|b|c|d] [视角 iso|top] [宽x高] [输出名]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, log, openPage, root, sleep } from "./browser.mjs";
const [style = "a", view = "iso", size = "1280x720", name = `${style}-${view}.png`, extra = ""] = process.argv.slice(2);
const [W, H] = size.split("x").map(Number);
const { send, evaluate } = await openPage({ url: `http://localhost:5182/?style=${style}&view=${view}${extra}`, W, H, DSF: 1.5, cdpPort: 9371 });
for (let i = 0; !(await evaluate("!!document.querySelector('canvas')").catch(() => false)); i++) { if (i > 80) throw new Error("页面没起来"); await sleep(300); }
await sleep(Number(process.env.SHOT_WAIT || 3500)); // 加载贴图 / 模型 / 路径追踪累积时可以等久一点
// 有终端回放（&cast=）时，等终端窗口加载出来再拍
if (extra.includes("cast=")) for (let i = 0; !(await evaluate("!!document.querySelector('.term-win .xterm-rows')").catch(() => false)) && i < 40; i++) await sleep(250);
await sleep(300);
const r = await send("Page.captureScreenshot", { format: "png" });
mkdirSync(join(root, "out"), { recursive: true });
writeFileSync(join(root, "out", name), Buffer.from(r.result.data, "base64"));
log("已保存 out/" + name);
cleanup();
process.exit(0);
