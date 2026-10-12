// 终端回放：把 tools/term-rec.mjs 录下的 .cast（真实的 Claude Code 终端输出）用 xterm.js 一段段重放。
// 视频时间 → 录像时间用分段线性的时间表（timeMap）映射：打字、写文件按原速，长时间思考的部分压缩。
// 画面一角标出"终端实录 · 加速 ×N"，N 按当前这一段的压缩比算，如实标注。
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { T } from "../theme.js";

// Claude Code 选的是浅色主题（假设终端是白底），回放也用白底
const THEME = {
  background: "#ffffff", foreground: "#1f1f1f", cursor: "#1f1f1f", selectionBackground: "#d0d0d0",
  black: "#1f1f1f", red: "#c4302b", green: "#2f8f3a", yellow: "#a46a00", blue: "#1f5fbf", magenta: "#8a3fb0", cyan: "#16808a", white: "#e5e5e5",
  brightBlack: "#6b6b6b", brightRed: "#d9534f", brightGreen: "#3fae4f", brightYellow: "#c98a00", brightBlue: "#3a7bd5", brightMagenta: "#a35fc9", brightCyan: "#2aa0aa", brightWhite: "#ffffff",
};

export async function loadCast(url) {
  const text = await (await fetch(url)).text();
  const [head, ...lines] = text.trim().split("\n");
  return { header: JSON.parse(head), events: lines.map((l) => JSON.parse(l)) };
}

// keys: [[视频秒, 录像秒], ...]，单调递增
export const mapTime = (keys, v) => {
  if (v <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [v0, r0] = keys[i - 1], [v1, r1] = keys[i];
    if (v <= v1) return r0 + ((v - v0) / (v1 - v0)) * (r1 - r0);
  }
  return keys[keys.length - 1][1];
};
const speedAt = (keys, v) => {
  for (let i = 1; i < keys.length; i++) if (v <= keys[i][0]) return (keys[i][1] - keys[i - 1][1]) / (keys[i][0] - keys[i - 1][0]);
  return 1;
};

// cast：loadCast 的结果；keys：时间表；getTime：返回当前视频秒数的函数（录制时由导演给，交互时用真实时钟）
export function TermReplay({ cast, keys, getTime, title = "Claude Code", fontSize = 15 }) {
  const box = useRef(), tag = useRef(), clock = useRef();
  const [term, setTerm] = useState(null);
  useEffect(() => {
    if (!cast) return;
    const t = new Terminal({ cols: cast.header.width, rows: cast.header.height, fontSize, lineHeight: 1.15,
      fontFamily: '"Cascadia Mono", Consolas, "Microsoft YaHei", monospace', theme: THEME, allowProposedApi: true, cursorBlink: false, scrollback: 0 });
    t.open(box.current);
    setTerm(t);
    return () => t.dispose();
  }, [cast, fontSize]);
  useEffect(() => {
    if (!term) return;
    let raf, idx = 0, last = -1;
    const tick = () => {
      const v = getTime();
      const r = mapTime(keys, v);
      if (r < last) { term.reset(); idx = 0; } // 往回跳：从头重放
      let chunk = "";
      while (idx < cast.events.length && cast.events[idx][0] <= r) chunk += cast.events[idx++][2];
      if (chunk) term.write(chunk);
      last = r;
      const k = speedAt(keys, v);
      if (tag.current) tag.current.textContent = k > 1.5 ? `终端实录 · 加速 ×${Math.round(k)}` : "终端实录 · 原速";
      if (clock.current) { const s = Math.floor(r); clock.current.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [term, cast, keys, getTime]);
  return (
    <div className="term-win" style={{ "--accent": T.accent }}>
      <div className="term-bar">
        <i /><i /><i />
        <span>{title}</span>
        <em ref={clock}>00:00</em>
        <b ref={tag}>终端实录</b>
      </div>
      <div ref={box} className="term-box" />
    </div>
  );
}
