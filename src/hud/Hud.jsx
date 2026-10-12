// 界面：标题、面积表 / 分步搭建的步骤表、当前步骤标签
import { T } from "../theme.js";
import { useScene } from "../store.js";
import "./hud.css";

export const STAGES = [
  { no: "01", name: "图纸", en: "PLAN" },
  { no: "02", name: "读图", en: "AI READS THE PLAN" },
  { no: "03", name: "墙体", en: "WALLS" },
  { no: "04", name: "门窗", en: "DOORS & WINDOWS" },
  { no: "05", name: "家具", en: "FURNITURE" },
  { no: "06", name: "完成", en: "COMPLETED" },
];

// 读图日志：AI 从图上读到了什么（数字从数据里数出来；正式版换成 AI 读图的真实结果）
function readLog(plan) {
  const ext = plan.walls.filter((w) => w.t >= 0.2), int = plan.walls.filter((w) => w.t < 0.2);
  const n = (t) => plan.openings.filter((o) => o.type === t).length;
  const xs = [...new Set(plan.walls.filter((w) => w.a[0] === w.b[0]).map((w) => w.a[0]))].length;
  const zs = [...new Set(plan.walls.filter((w) => w.a[1] === w.b[1]).map((w) => w.a[1]))].length + 1;
  const total = plan.rooms.reduce((s, r) => s + (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]), 0);
  return [
    ["轴线", `${xs} 纵 × ${zs} 横`],
    ["外墙", `${ext.length} 段 · 厚 ${Math.round(ext[0].t * 1000)}`],
    ["内墙", `${int.length} 段 · 厚 ${Math.round(int[0].t * 1000)}`],
    ["门", `平开 ${n("door")} · 推拉 ${n("slide")}`],
    ["窗", `${n("window")} 樘`],
    ["房间", `${plan.rooms.length} 间 · ${total.toFixed(1)} ㎡`],
  ];
}

export function Hud({ plan, stage = STAGES.length }) {
  const reveal = useScene((s) => s.reveal);
  const rooms = plan.rooms.map((r) => ({ name: r.name, area: (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]) }));
  const total = rooms.reduce((s, r) => s + r.area, 0);
  const vars = { "--paper": T.paper, "--ink": T.ink, "--soft": T.inkSoft, "--accent": T.accent, "--seal": T.seal, "--font": T.font, "--serif": T.serif, "--mono": T.mono };
  const cur = STAGES[Math.min(stage, STAGES.length) - 1];
  return (
    <div className={`hud hud-${T.hud}`} style={vars}>
      {T.hud === "drawing" && <div className="frame" />}
      <header className="title">
        <div className="seal">宅</div>
        <div>
          <h1>{plan.name}</h1>
          <p>FLOOR PLAN → 3D · 两室两厅一厨一卫</p>
        </div>
      </header>
      {T.hud === "diagram" ? (
        <>
          <aside className="steps">
            {STAGES.map((s, i) => <div key={s.no} className={i + 1 === stage ? "on" : i + 1 < stage ? "done" : ""}><em>{s.no}</em>{s.name}</div>)}
          </aside>
          <footer className="stage-tag"><em>{cur.no}</em><b>{cur.name}</b><span>{cur.en}</span></footer>
          {stage === 2 && reveal > 0.02 && (
            <aside className="readlog">
              <h4>AI 读图</h4>
              {readLog(plan).map(([k, v]) => <div key={k}><i>✓</i><span>{k}</span><b>{v}</b></div>)}
            </aside>
          )}
          <aside className="areas mini" style={stage === 2 ? { display: "none" } : undefined}>
            <h4>面积</h4>
            {rooms.map((r) => <div key={r.name}><span>{r.name}</span><b>{r.area.toFixed(1)}</b></div>)}
            <div className="sum"><span>合计</span><b>{total.toFixed(1)} ㎡</b></div>
          </aside>
        </>
      ) : (
        <aside className="areas">
          <h4>面积表</h4>
          {rooms.map((r) => <div key={r.name}><span>{r.name}</span><b>{r.area.toFixed(1)}</b></div>)}
          <div className="sum"><span>合计（轴线）</span><b>{total.toFixed(1)} ㎡</b></div>
        </aside>
      )}
    </div>
  );
}
