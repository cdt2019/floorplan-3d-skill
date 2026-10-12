// 封面候选：成片时间线（?rec&…&seq=final）上取全分辨率静帧（无字，1920×1080 / 竖版 1080×1920），存到 out/final/cover-<名字>-16x9|9x16.png。
// 用法（先 npm run dev）：node tools/cover-stills.mjs [--v] 名字:秒[:tod] …   tod 给了就覆盖光照（成片里 0 白天 → 1 蓝调开灯，= m3），
//   例：hero:9.5:1 = 9.5 秒的鸟瞰机位（整套微缩模型在画面里）配蓝调开灯的光（成片里鸟瞰时还是黄昏，12 秒才到蓝调）。双显卡加 EDGE_ARGS="--force_high_performance_gpu"
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, log, openPage, root, sleep } from "./browser.mjs";
const argv = process.argv.slice(2), V = argv.includes("--v");
const shots = argv.filter((a) => !a.startsWith("--")).map((s) => { const [name, t, tod] = s.split(":"); return { name, t: +t, tod: tod == null ? null : +tod }; });
const [W, H] = V ? [720, 1280] : [1280, 720];
const url = `http://localhost:5182/?rec${V ? "=v" : ""}&style=e2&plan=opus55&clean&look=pro&pbr&seq=final`;
const dir = join(root, "out/final"); mkdirSync(dir, { recursive: true });
const { send, evaluate, errors } = await openPage({ url, W, H, DSF: 1.5, cdpPort: 9463 });
for (let k = 0; !(await evaluate("!!(window.__directorReady && window.__three && window.__lookReady)").catch(() => false)); k++) {
  if (k > 400) throw new Error("not ready: " + errors.join("\n")); await sleep(300);
}
await sleep(2000);
for (const s of shots) {
  const ov = s.tod == null ? "" : `window.__scene.setState({ tod: ${s.tod} });`;
  await evaluate(`(async () => { const raf = () => new Promise((r) => requestAnimationFrame(r));
    window.__director.seek(${s.t}); ${ov} for (let i = 0; i < 20; i++) await raf();
    window.__director.seek(${s.t}); ${ov} for (let i = 0; i < 20; i++) await raf(); return 1; })()`);
  await sleep(500);
  const r = await send("Page.captureScreenshot", { format: "png" });
  const f = join(dir, `cover-${s.name}-${V ? "9x16" : "16x9"}.png`);
  writeFileSync(f, Buffer.from(r.result.data, "base64")); log("saved", f);
}
cleanup(); process.exit(0);
