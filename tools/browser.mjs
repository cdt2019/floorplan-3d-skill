// 无头 Edge + CDP，加一个本地静态文件服务（截图、逐帧录制、烘焙导出都用它）。
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

const children = [];
const profiles = [];
let server = null;
export const cleanup = () => {
  server?.close();
  // 同步结束 Edge（异步的话脚本先退出，Edge 会留在后台）。Edge 起来后会脱离启动它的进程，
  // 按进程树杀不干净，所以再按命令行里的配置文件夹路径把剩下的都找出来结束掉
  for (const c of children.splice(0)) spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
  if (profiles.length) {
    const pat = profiles.map((p) => `$_.CommandLine -like '*${basename(p)}*'`).join(" -or ");
    spawnSync("powershell", ["-NoProfile", "-c", `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ? { ${pat} } | % { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: "ignore" });
  }
  // 浏览器配置文件放在 D 盘的 .profiles/ 里，录完删掉（C 盘空间紧）
  for (const p of profiles.splice(0)) {
    for (let i = 0; i < 10; i++) {
      try { rmSync(p, { recursive: true, force: true }); break; } catch { spawnSync("powershell", ["-c", "Start-Sleep -Milliseconds 300"]); }
    }
  }
};
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".csv": "text/csv; charset=utf-8", ".png": "image/png", ".json": "application/json" };
export function serve(port) {
  server = createServer((req, res) => {
    const p = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(p).pipe(res);
  }).listen(port, "127.0.0.1");
  return `http://127.0.0.1:${port}`;
}

/** 开一个无头 Edge 页面。W×H 是 CSS 尺寸，DSF 是设备像素比；virtualTime 为真时注入虚拟时钟 */
export async function openPage({ url, W, H, DSF = 1, cdpPort = 9344, virtualTime = false, swiftshader = false }) {
  const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
  if (!EDGE) throw new Error("找不到 Edge");
  const profile = join(root, ".profiles", `edge-${Date.now()}`);
  profiles.push(profile);
  const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
    "--hide-scrollbars", "--mute-audio", "--no-first-run", "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    // 3D 要 WebGL：默认用显卡（d3d11），没有显卡的机器用软件渲染 swiftshader
    ...(swiftshader ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"]),
    // 双显卡笔记本：EDGE_ARGS="--force_high_performance_gpu" 让无头 Edge 用独显（默认走核显）
    ...(process.env.EDGE_ARGS ? process.env.EDGE_ARGS.split(" ") : []), "about:blank"], { stdio: "ignore" });
  children.push(edge);
  let page;
  for (let i = 0; ; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find((t) => t.type === "page"); if (page) break; } catch { /* 还没起来 */ }
    if (i > 60) throw new Error("Edge 没起来");
    await sleep(300);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    else if (d.method === "Runtime.consoleAPICalled" && (d.params.type === "error" || d.params.type === "warning")) errors.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
  if (virtualTime) await send("Page.addScriptToEvaluateOnNewDocument", { source: readFileSync(join(root, "tools/virtual-time.js"), "utf8") });
  await send("Page.navigate", { url });
  return { send, evaluate, errors, close: () => { ws.close(); cleanup(); } };
}
