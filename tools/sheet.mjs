// 导出户型平面图 PNG：node tools/sheet.mjs [每米像素=120] [输出名=plan-sheet.png]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, log, openPage, root, sleep } from "./browser.mjs";
const [ppm = "120", name = "plan-sheet.png"] = process.argv.slice(2);
const { evaluate } = await openPage({ url: `http://localhost:5182/?sheet&ppm=${ppm}`, W: 1200, H: 900, DSF: 1, cdpPort: 9372 });
for (let i = 0; !(await evaluate("!!window.__sheetReady").catch(() => false)); i++) { if (i > 80) throw new Error("图纸没画好"); await sleep(300); }
const data = await evaluate("document.getElementById('sheet').toDataURL('image/png')");
mkdirSync(join(root, "out"), { recursive: true });
writeFileSync(join(root, "out", name), Buffer.from(data.split(",")[1], "base64"));
log("已保存 out/" + name);
cleanup();
process.exit(0);
