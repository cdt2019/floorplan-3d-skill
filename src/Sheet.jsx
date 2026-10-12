// ?sheet：只显示户型平面图（2D）。?ppm= 每米像素，导出给 AI 读图用
import { useEffect, useRef } from "react";
import { drawPlan, sheetBounds } from "./plan/drawPlan.js";

// ?sheet&plan=名字：把 AI 读出来的数据重新画成户型图，和原图对照
export default function Sheet({ plan: PLAN }) {
  const ref = useRef();
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const B = sheetBounds(PLAN);
    const ppm = Number(q.get("ppm")) || Math.min(innerWidth / (B.x1 - B.x0), innerHeight / (B.z1 - B.z0));
    const c = ref.current;
    c.width = Math.round((B.x1 - B.x0) * ppm); c.height = Math.round((B.z1 - B.z0) * ppm);
    document.fonts.ready.then(() => { drawPlan(c.getContext("2d"), PLAN, ppm); window.__sheetReady = true; });
  }, []);
  return <canvas ref={ref} id="sheet" style={{ display: "block", maxWidth: "100vw", maxHeight: "100vh", margin: "0 auto", background: "#fff" }} />;
}
