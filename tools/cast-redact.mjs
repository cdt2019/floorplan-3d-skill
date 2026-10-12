// 终端录像脱敏：把所有邮箱地址换成等长的星号（等长才不会打乱终端排版），另存一份。
// 用法：node tools/cast-redact.mjs <原始.cast> <脱敏后.cast> [--also 其他要打码的字符串 ...]
// 原始录像不要提交、不要放进视频；只用脱敏后的。
//
// 注意：只在"看得见的字"里找邮箱。终端输出里夹着控制序列（比如 ESC[1C 表示右移一格、代替空格），
// 直接对原始字节用正则，会把控制序列的参数（"1C"）也当成邮箱的一部分换掉，排版就乱了。
import { readFileSync, writeFileSync } from "node:fs";

const [src, dst, ...rest] = process.argv.slice(2);
if (!src || !dst) throw new Error("用法：node tools/cast-redact.mjs <原始.cast> <脱敏后.cast> [--also 字符串 ...]");
const also = rest[0] === "--also" ? rest.slice(1) : [];
const [head, ...lines] = readFileSync(src, "utf8").trim().split("\n");
const events = lines.map((l) => JSON.parse(l));
// 0. 窗口标题（OSC 0/1/2）里有程序路径，带着电脑用户名；画面上看不到，整条删掉（不影响排版）
for (const e of events) e[2] = e[2].replace(/\x1b\][012];[^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
const raw = events.map((e) => e[2]).join("");

// 1. 把原始流拆成"控制序列"和"可见字"，记下每个可见字在原始流里的位置
const CTRL = /\x1b\[[0-9;?<>=!]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]|[\x00-\x1f]/y;
const pos = [];
let plain = "";
for (let i = 0; i < raw.length; ) {
  CTRL.lastIndex = i;
  const m = CTRL.exec(raw);
  if (m) { i += m[0].length; continue; }
  pos.push(i); plain += raw[i]; i++;
}
// 2. 在可见字里找邮箱和指定字符串，对应的原始位置换成星号
const chars = raw.split("");
let hits = 0;
const mask = (from, len) => { for (let k = from; k < from + len; k++) chars[pos[k]] = "*"; };
for (const m of plain.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) { hits++; mask(m.index, m[0].length); }
for (const a of also) { let k = -1; while ((k = plain.indexOf(a, k + 1)) >= 0) { hits++; mask(k, a.length); } }
const all = chars.join("");
// 3. 按原来每段的长度切回去
let i = 0;
for (const e of events) { const n = e[2].length; e[2] = all.slice(i, i + n); i += n; }
// 4. 复查
let plain2 = "";
for (let j = 0; j < all.length; ) { CTRL.lastIndex = j; const m = CTRL.exec(all); if (m) { j += m[0].length; continue; } plain2 += all[j]; j++; }
const left = plain2.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/g) || [];
writeFileSync(dst, [head, ...events.map((e) => JSON.stringify(e))].join("\n") + "\n");
console.log(`打码 ${hits} 处；复查剩余 ${left.length} 处邮箱 → ${dst}`);
if (left.length) process.exit(1);
