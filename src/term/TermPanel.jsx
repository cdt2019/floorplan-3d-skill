// 页面上的终端回放窗口。?cast=名字 打开。
// - 录视频（?rec）：显示 / 隐藏和播放进度都由导演控制（store 里的 termOn、termT），时间表用 /casts/名字.keys.json
// - 检查画面：?tt=秒 停在录像的第几秒；都不传就从头原速播放
// 终端的行列数是录像时定死的（比如 96×30），窗口按画面大小整体缩放，放进 termArea 给的那块地方，不裁掉底部的输入框。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TermReplay, loadCast } from "./TermReplay.jsx";
import { termArea } from "./layout.js";
import { useScene } from "../store.js";

const q = new URLSearchParams(location.search);
const REC = q.has("rec");

export function TermPanel({ src }) {
  const [cast, setCast] = useState(null);
  const [fit, setFit] = useState(null);
  const wrap = useRef();
  useEffect(() => { loadCast(src).then(setCast); }, [src]);
  const on = useScene((s) => (REC ? s.termOn ?? 0 : 1));
  const fixed = q.has("tt") ? Number(q.get("tt")) : null;
  const keys = useMemo(() => (REC ? window.__termKeys || [[0, 0], [1, 1]] : fixed != null ? [[0, fixed], [1, fixed]] : [[0, 0], [1e6, 1e6]]), [fixed, cast]);
  const t0 = useMemo(() => performance.now(), []);
  const getTime = useMemo(() => (REC ? () => Math.max(0, useScene.getState().termT ?? 0) : () => (performance.now() - t0) / 1000), [t0]);
  const show = cast && on > 0.001;
  // 量出终端窗口原本的大小，算缩放
  useLayoutEffect(() => {
    if (!show || fit) return;
    let raf;
    const measure = () => {
      const win = wrap.current?.firstChild;
      if (!win?.querySelector(".xterm-screen")?.offsetWidth) { raf = requestAnimationFrame(measure); return; }
      const w = win.offsetWidth, h = win.offsetHeight, { box } = termArea();
      const s = Math.min(1, box.w / w, box.h / h);
      setFit({ s, left: box.x, top: box.y + (box.h - h * s) / 2 });
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [show, fit]);
  if (!show) return null;
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", opacity: fit ? on : 0, transform: `translateY(${(1 - on) * 40}px)` }}>
      <div ref={wrap} style={{ position: "absolute", left: fit?.left ?? 0, top: fit?.top ?? 0, transform: `scale(${fit?.s ?? 1})`, transformOrigin: "0 0" }}>
        <TermReplay cast={cast} keys={keys} getTime={getTime} />
      </div>
    </div>
  );
}
