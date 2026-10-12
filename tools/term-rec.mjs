// 录 Claude Code 终端：在虚拟终端（ConPTY）里启动 claude，自动输入一句提示词，
// 把终端输出的每一个字节连同时间戳存成 asciinema v2 格式的 .cast 文件。回放用 tools 里的舞台页面（xterm.js）。
// 录的是真实运行，不是画出来的界面。
//
// 用法：node tools/term-rec.mjs --cwd <空文件夹> --prompt "提示词" --out out/read.cast [--cols 96 --rows 30] [--done plan.json] [--manual] [--prompt-file 文件]
//   --done：等这个文件出现、并且终端安静 6 秒，就算结束
//   --manual：手动模式。要在真的终端里运行：Claude Code 的画面同步显示出来，键盘输入转给它，
//             启动时的选择框、干活时的审批框都由人自己看、自己点；脚本只负责打提示词和录像。
//             日志写进 --log 文件（默认 out/rec-manual.log），不往终端里打，免得弄乱画面。
//             中途想结束：在 Claude Code 里按两次 Ctrl+C 退出，录像照样保存。
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pty from "@lydell/node-pty";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const cwd = arg("cwd"), out = arg("out", "out/read.cast");
const cols = Number(arg("cols", 96)), rows = Number(arg("rows", 30)), done = arg("done");
const extra = (arg("args", "--permission-mode acceptEdits") || "").split(" ").filter(Boolean);
// --prompt-file：从 UTF-8 文件读提示词（有的终端只让敲 ASCII 命令行）
const prompt = arg("prompt") ?? (arg("prompt-file") && readFileSync(arg("prompt-file"), "utf8").trim());
const manual = argv.includes("--manual"), logFile = arg("log", "out/rec-manual.log");
if (!cwd || !prompt) throw new Error("要 --cwd 和 --prompt");

const t0 = Date.now();
const events = [];
let tail = "", lastOut = Date.now(), finishing = false;
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "").replace(/\x1b[@-_]/g, "");
const log = manual
  ? (...a) => appendFileSync(logFile, [new Date().toTimeString().slice(0, 8), ...a].join(" ") + "\n")
  : (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
if (manual) writeFileSync(logFile, "");
// Windows 的 ConPTY 要可执行文件的完整路径
const CLAUDE = process.env.CLAUDE_BIN || (process.platform === "win32"
  ? execSync("where claude", { encoding: "utf8" }).split(/\s+/).find((l) => /[.](exe|cmd)$/i.test(l))
  : "claude");
// 环境变量要干净：从另一个 Claude Code 会话里运行本脚本时，会继承一堆 CLAUDE_* / ANTHROPIC_* 变量，
// 被录的 Claude Code 会以为自己是"子会话"（底部出警告、改走别的接口地址）。清掉，和用户自己在终端里敲 claude 一样
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC|AI_AGENT|BAGGAGE)/i.test(k)));
const term = pty.spawn(CLAUDE, extra, { name: "xterm-256color", cols, rows, cwd, env: { ...env, FORCE_COLOR: "1", COLORTERM: "truecolor" } });
term.onData((d) => {
  events.push([(Date.now() - t0) / 1000, "o", d]);
  tail = (tail + strip(d)).slice(-4000);
  lastOut = Date.now();
  if (manual) process.stdout.write(d);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idle = async (ms, max = 60000) => { const s = Date.now(); while (Date.now() - lastOut < ms && Date.now() - s < max) await sleep(100); };

const save = (end = (Date.now() - t0) / 1000) => {
  const header = { version: 2, width: cols, height: rows, timestamp: Math.floor(t0 / 1000), env: { TERM: "xterm-256color" }, end };
  writeFileSync(out, [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join("\n") + "\n");
};
const restoreTty = () => { if (manual && process.stdin.isTTY) { process.stdin.setRawMode(false); process.stdin.pause(); } };
if (manual) {
  // 键盘原样转给 Claude Code（方向键、回车、Esc、Ctrl+C 都是它收）
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on("data", (d) => term.write(d.toString("utf8")));
  process.stdin.resume();
  // 人在 Claude Code 里自己退出了：照样存盘
  term.onExit(() => {
    if (finishing) return;
    save(); restoreTty();
    log(`Claude Code 已退出，已保存 ${out}：${events.length} 段输出`);
    process.stdout.write(`\r\n\r\n录像已保存：${out}\r\n`);
    process.exit(0);
  });
}
// 等到真正的输入框出现再打字。启动时可能先弹各种选择框（信任文件夹、首次设置、升级提示……）：
// 自动模式只处理"信任这个文件夹"（文件夹是我们自己建的）；别的选择框是用户的设置，脚本停下来报出内容，不替用户选。
// 手动模式全部交给人。
const ready = () => /\/effort|for shortcuts|Try "/.test(tail.slice(-3500)) && !/Enter to confirm/.test(tail.slice(-1200));
const startWait = Date.now();
let trusted = false;
while (!ready()) {
  await sleep(500);
  if (manual) continue;
  await idle(1500, 10000);
  const screen = tail.slice(-1500);
  if (/Enter to confirm/.test(screen)) {
    if (!trusted && /trust this folder/i.test(screen)) {
      // 文件夹里有 .claude 配置时默认选中的是"No, exit"，要先按下箭头选到"Yes"
      const yesBelow = /No,\s*exit[\s\S]*Yes,\s*I\s*trust/i.test(screen);
      log("信任文件夹提示 → " + (yesBelow ? "下箭头 + 回车" : "回车"));
      if (yesBelow) { term.write("\x1b[B"); await sleep(400); }
      term.write("\r"); trusted = true; tail = ""; await sleep(1500);
      continue;
    }
    log("出现不认识的选择框，停止录制，不替用户选择：\n" + screen.replace(/\s+/g, " ").slice(-400));
    save(); try { term.kill(); } catch { /* 已经退出 */ }
    process.exit(2);
  }
  if (Date.now() - startWait > 90000) {
    log("90 秒没等到输入框，停止。最后的屏幕：", tail.slice(-600).replace(/\s+/g, " "));
    save(); try { term.kill(); } catch { /* */ } process.exit(3);
  }
}
await sleep(800);
log("开始输入提示词");
for (const ch of prompt) { term.write(ch); await sleep(ch === " " ? 70 : 55); }
await sleep(700);
term.write("\r");
log("已发送，等 Claude 干活");
const start = Date.now();
let refused = 0, approved = 0, boxOpen = false;
// 只读量图脚本的检查：只许用 PIL 和几个纯计算的标准库，不许碰文件系统、网络、子进程、动态执行
const SAFE_IMPORTS = new Set(["PIL", "math", "json", "statistics", "collections", "itertools", "functools", "re", "numpy"]);
function readOnlyScript(file) {
  const p = join(cwd, file);
  if (!/^[\w.-]+\.py$/.test(file) || !existsSync(p)) return "文件不在录制文件夹里";
  const src = readFileSync(p, "utf8");
  for (const m of src.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w., ]+))/gm)) {
    for (const mod of (m[1] || m[2]).split(",").map((s) => s.trim().split(/[.\s]/)[0])) if (mod && !SAFE_IMPORTS.has(mod)) return "用了 " + mod;
  }
  const bad = src.match(/\b(eval|exec|compile|__import__|globals|setattr|getattr)\s*\(|(?<!Image\.)\bopen\s*\(|\.save\s*\(|\bos\.|\bsys\.|subprocess|socket|urllib|requests|shutil|pathlib/);
  return bad ? "出现了 " + bad[0] : null;
}
while (Date.now() - start < 20 * 60000) {
  await sleep(1000);
  if (manual) {
    // 审批框由人点；这里只记一笔，方便事后对照
    const open = /Do you want to proceed/.test(tail.slice(-1500));
    if (open && !boxOpen) log("审批框（等人点）：" + tail.slice(-1500).replace(/\s+/g, " ").slice(-400));
    boxOpen = open;
  } else {
    // 弹出审批框：只有"运行录制文件夹里、经检查只读图量像素的 python 脚本"才选 1. Yes（只同意这一次）；其他一律 Esc 拒绝
    const screen = tail.slice(-2500);
    if (/Do you want to proceed/.test(screen)) {
      const cmd = (screen.match(/\$\s*(python3?\s+[\w.-]+\.py)\s/) || [])[1];
      const file = cmd && cmd.split(/\s+/)[1];
      const why = file ? readOnlyScript(file) : "不是运行单个 python 脚本";
      if (!why && /❯\s*1\.\s*Yes/.test(screen)) {
        approved++; log(`审批框：${cmd}，脚本只读图量像素 → 1. Yes（第 ${approved} 次）`); term.write("\r");
      } else {
        // Esc 会打断 Claude 这一整轮，它会停下来等人输入，不会再写出 plan.json。所以拒绝之后直接结束录制，报出审批框内容
        refused++; log(`审批框 → Esc 拒绝（${why || "选项不在 Yes 上"}），录制结束。审批框内容：\n` + screen.replace(/\s+/g, " ").slice(-700));
        term.write("\x1b"); await sleep(1500);
        save(); try { term.kill(); } catch { /* 已经退出 */ }
        process.exit(4);
      }
      tail = ""; await sleep(1500);
    }
  }
  const fileOk = !done || existsSync(join(cwd, done));
  if (fileOk && !boxOpen && Date.now() - lastOut > 6000 && Date.now() - start > 15000) break;
}
log("完成，退出");
finishing = true;
await sleep(1500);
const end = (Date.now() - t0) / 1000;
term.write("\x03"); await sleep(400); term.write("\x03"); await sleep(1500);
try { term.kill(); } catch { /* 已经退出 */ }
save(end);
restoreTty();
log(`已保存 ${out}：${events.length} 段输出，${end.toFixed(1)} 秒（退出前）` + (manual ? "，审批由人点" : `，拒绝审批 ${refused} 次，同意 ${approved} 次`));
if (manual) process.stdout.write(`\r\n\r\n录像已保存：${out}（可以关掉这个标签页了）\r\n`);
process.exit(0);
