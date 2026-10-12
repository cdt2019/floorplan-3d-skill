// 烘焙第 1 步：从页面导出整套房子（满层高 + 天花板 + 家具 + 软装，蓝调 m3 的配色）给 Blender。
// 用法（先 npm run dev）：
//   node tools/bake-export.mjs                     # 户型 opus55 → out/bake/opus55-m5/scene.glb + meta.json
//   node tools/bake-export.mjs --plan opus55 --set opus55-m5
// 然后：blender -b --factory-startup -P tools/blender/bake.py -- --set opus55-m5   （见 bake.py 开头）
// 双显卡笔记本加环境变量 EDGE_ARGS="--force_high_performance_gpu"。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, log, openPage, root, sleep } from "./browser.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const plan = arg("plan", "opus55"), set = arg("set", `${plan}-m5`); // 第 5 轮：门按 doors.jsx 的规则开着（m3 是第 4 轮那套）
const url = `http://localhost:5182/?style=e2&stage=6&finish=1&plan=${plan}&clean&look=pro&pbr&view=eye&bake=export&bakeset=${set}${arg("q", "")}`;
const { evaluate, errors } = await openPage({ url, W: 1280, H: 720, DSF: 1, cdpPort: 9491 });
for (let k = 0; !(await evaluate("!!window.__lookReady && !!window.__bakeExport").catch(() => false)); k++) {
  if (k > 400) throw new Error("页面没准备好：" + errors.join("\n"));
  await sleep(300);
}
await sleep(1500);
const t0 = Date.now();
const r = await evaluate("window.__bakeExport()");
const dir = join(root, "out", "bake", set);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "scene.glb"), Buffer.from(r.glb, "base64"));
writeFileSync(join(dir, "meta.json"), JSON.stringify(JSON.parse(r.meta), null, 1));
log(`导出 ${r.n} 个网格（静态 ${r.static} 个），GLB ${(r.bytes / 1e6).toFixed(1)} MB，${((Date.now() - t0) / 1000).toFixed(1)} 秒 → ${dir}`);
if (errors.length) log("页面报错 / 警告：\n  " + [...new Set(errors)].slice(0, 10).join("\n  "));
cleanup();
process.exit(0);
