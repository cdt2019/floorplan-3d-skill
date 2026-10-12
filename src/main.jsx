import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Sheet from "./Sheet.jsx";
import { loadPlan } from "./plan/load.js";
const q = new URLSearchParams(location.search);
(async () => {
  const plan = await loadPlan();
  window.__plan = plan;
  // 录视频：先加载导演（含终端回放的时间表），再渲染
  if (q.has("rec")) {
    const d = await import("./director.js");
    if (q.has("cast")) {
      const k = await fetch(`/casts/${q.get("cast")}.keys.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (k) { d.setTermKeys(k); window.__termKeys = k; }
    }
  }
  createRoot(document.getElementById("root")).render(q.has("sheet") ? <Sheet plan={plan} /> : <App plan={plan} />);
})();
